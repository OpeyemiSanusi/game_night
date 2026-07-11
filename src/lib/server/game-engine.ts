import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { rebuildPublicRoomState } from "@/lib/server/room-state";
import type { PlayerAuthRow, RoomAuthRow } from "@/lib/server/auth";
import {
  computeTeamScores,
  isAfterDeadline,
  phaseUpdate,
  randomItem,
  randomSample,
  readSettings,
  savingGracePrompt,
  type PlayerRow,
  type TeamRow,
  type VoteRow,
} from "@/lib/server/game-utils";
import type {
  AnswerOption,
  ConsequenceChoice,
  GamePhase,
  HostAction,
  SavingGraceCategory,
} from "@/lib/types";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

interface QuestionRow {
  id: string;
  quote: string;
  answer_options: AnswerOption[];
  correct_answer_id: string;
  sent_at: string;
  next_sender_options: AnswerOption[];
  correct_next_sender_id: string | null;
  reaction_count: number;
}

interface RoundRow {
  id: string;
  room_id: string;
  question_id: string | null;
  round_number: number;
  results: Record<string, unknown>;
}

interface ChallengeRow {
  id: string;
  title: string;
  instructions: string;
  duration_seconds: number;
  success_criteria: string;
}

interface ChallengeOption {
  id: string;
  title: string;
  instructions: string;
  durationSeconds: number;
  successCriteria: string;
}

interface AssignmentRow {
  id: string;
  chooser_team_id: string;
  target_team_id: string;
  chooser_player_id: string | null;
  challenge_id: string | null;
  options: ChallengeOption[];
}

interface AttemptRow {
  id: string;
  team_id: string;
  leader_player_id: string | null;
  category: SavingGraceCategory | null;
  answer: string | null;
  correct_answer: string | null;
  is_correct: boolean | null;
}

interface PenaltyRow {
  id: string;
  team_id: string;
  lamb_player_id: string | null;
  rescuer_player_id: string | null;
  consequence_choice: ConsequenceChoice | null;
  challenge_assignment_id: string | null;
  status: string;
  queue_index: number;
  payload: Record<string, unknown>;
}

function asQuestion(data: unknown) {
  return data as QuestionRow;
}

async function loadTeams(supabase: SupabaseAdmin, roomId: string) {
  const { data, error } = await supabase
    .from("teams")
    .select("id, team_index, name, color, score")
    .eq("room_id", roomId)
    .order("team_index", { ascending: true })
    .returns<TeamRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function loadPlayers(supabase: SupabaseAdmin, roomId: string) {
  const { data, error } = await supabase
    .from("players")
    .select("id, team_id, display_name, initials, avatar_url, join_order, status")
    .eq("room_id", roomId)
    .order("join_order", { ascending: true })
    .returns<PlayerRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

async function loadCurrentRound(supabase: SupabaseAdmin, room: RoomAuthRow) {
  if (room.current_round_number < 1) {
    return null;
  }

  const { data, error } = await supabase
    .from("rounds")
    .select("id, room_id, question_id, round_number, results")
    .eq("room_id", room.id)
    .eq("round_number", room.current_round_number)
    .maybeSingle<RoundRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data || null;
}

async function loadQuestion(supabase: SupabaseAdmin, questionId: string) {
  const { data, error } = await supabase
    .from("questions")
    .select(
      "id, quote, answer_options, correct_answer_id, sent_at, next_sender_options, correct_next_sender_id, reaction_count",
    )
    .eq("id", questionId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Question not found.");
  }

  return asQuestion(data);
}

async function loadRoundQuestion(supabase: SupabaseAdmin, room: RoomAuthRow) {
  const round = await loadCurrentRound(supabase, room);

  if (!round || !round.question_id) {
    throw new Error("No active round question.");
  }

  return { round, question: await loadQuestion(supabase, round.question_id) };
}

async function logEvent(
  supabase: SupabaseAdmin,
  roomId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
  actorPlayerId?: string | null,
) {
  await supabase.from("game_events").insert({
    room_id: roomId,
    actor_player_id: actorPlayerId || null,
    event_type: eventType,
    payload,
  });
}

async function setRoomPhase(
  supabase: SupabaseAdmin,
  roomId: string,
  phase: GamePhase,
  durationSeconds?: number,
) {
  const { error } = await supabase
    .from("rooms")
    .update(phaseUpdate(phase, durationSeconds))
    .eq("id", roomId);

  if (error) {
    throw new Error(error.message);
  }
}

async function loadChallenges(supabase: SupabaseAdmin, settings: RoomAuthRow["settings"]) {
  const selectedDeckId =
    typeof settings.selectedChallengeDeckId === "string"
      ? settings.selectedChallengeDeckId
      : undefined;
  let query = supabase
    .from("challenges")
    .select("id, title, instructions, duration_seconds, success_criteria")
    .eq("enabled", true);

  if (selectedDeckId) {
    query = query.eq("deck_id", selectedDeckId);
  }

  const { data, error } = await query.returns<ChallengeRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data || data.length < 1) {
    throw new Error("No enabled challenges found.");
  }

  return data;
}

function toChallengeOption(challenge: ChallengeRow): ChallengeOption {
  return {
    id: challenge.id,
    title: challenge.title,
    instructions: challenge.instructions,
    durationSeconds: challenge.duration_seconds,
    successCriteria: challenge.success_criteria,
  };
}

async function assignLeadersAndChallenges(
  supabase: SupabaseAdmin,
  room: RoomAuthRow,
  round: RoundRow,
) {
  const [{ data: existingLeaders }, { data: existingAssignments }] =
    await Promise.all([
      supabase
        .from("round_leaders")
        .select("id")
        .eq("round_id", round.id)
        .returns<Array<{ id: string }>>(),
      supabase
        .from("challenge_assignments")
        .select("id")
        .eq("round_id", round.id)
        .returns<Array<{ id: string }>>(),
    ]);

  const [teams, players, challenges] = await Promise.all([
    loadTeams(supabase, room.id),
    loadPlayers(supabase, room.id),
    loadChallenges(supabase, room.settings),
  ]);

  if (
    (existingLeaders?.length || 0) >= teams.length &&
    (existingAssignments?.length || 0) >= teams.length
  ) {
    return;
  }

  const { data: previousLeaders, error: leadersError } = await supabase
    .from("round_leaders")
    .select("team_id, player_id")
    .eq("room_id", room.id)
    .returns<Array<{ team_id: string; player_id: string }>>();

  if (leadersError) {
    throw new Error(leadersError.message);
  }

  const leaderRows = teams.flatMap((team) => {
    const teamPlayers = players.filter(
      (player) => player.team_id === team.id && player.status === "active",
    );

    if (teamPlayers.length === 0) {
      return [];
    }

    const leader = [...teamPlayers].sort((left, right) => {
      const leftCount = (previousLeaders || []).filter(
        (row) => row.player_id === left.id,
      ).length;
      const rightCount = (previousLeaders || []).filter(
        (row) => row.player_id === right.id,
      ).length;

      return leftCount - rightCount || left.join_order - right.join_order;
    })[0];

    return [
      {
        room_id: room.id,
        round_id: round.id,
        team_id: team.id,
        player_id: leader.id,
      },
    ];
  });

  if (leaderRows.length !== teams.length) {
    throw new Error("Every team needs at least one active player before starting.");
  }

  const { error: leaderInsertError } = await supabase
    .from("round_leaders")
    .upsert(leaderRows, { onConflict: "round_id,team_id" });

  if (leaderInsertError) {
    throw new Error(leaderInsertError.message);
  }

  const assignmentRows = teams.map((team) => {
    const targetTeam = teams[(team.team_index + 1) % teams.length];
    const leader = leaderRows.find((row) => row.team_id === team.id);
    const options = randomSample(challenges, Math.min(3, challenges.length)).map(
      toChallengeOption,
    );

    return {
      room_id: room.id,
      round_id: round.id,
      chooser_team_id: team.id,
      target_team_id: targetTeam.id,
      chooser_player_id: leader?.player_id || null,
      options,
    };
  });

  const { error: assignmentError } = await supabase
    .from("challenge_assignments")
    .upsert(assignmentRows, {
      onConflict: "round_id,chooser_team_id,target_team_id",
    });

  if (assignmentError) {
    throw new Error(assignmentError.message);
  }
}

async function chooseNextQuestion(supabase: SupabaseAdmin, room: RoomAuthRow) {
  const settings = readSettings(room.settings);
  let query = supabase
    .from("questions")
    .select("id")
    .eq("enabled", true)
    .order("created_at", { ascending: true });

  if (settings.selectedQuestionPackId) {
    query = query.eq("pack_id", settings.selectedQuestionPackId);
  }

  const { data: questions, error } = await query.returns<Array<{ id: string }>>();

  if (error) {
    throw new Error(error.message);
  }

  if (!questions || questions.length === 0) {
    throw new Error("Import at least one enabled question before starting.");
  }

  const { data: usedRounds, error: usedError } = await supabase
    .from("rounds")
    .select("question_id")
    .eq("room_id", room.id)
    .not("question_id", "is", null)
    .returns<Array<{ question_id: string }>>();

  if (usedError) {
    throw new Error(usedError.message);
  }

  const usedIds = new Set((usedRounds || []).map((round) => round.question_id));
  return questions.find((question) => !usedIds.has(question.id)) || questions[0];
}

async function createNextRound(supabase: SupabaseAdmin, room: RoomAuthRow) {
  const settings = readSettings(room.settings);
  const nextRoundNumber = room.current_round_number + 1;

  if (nextRoundNumber > settings.rounds) {
    await setRoomPhase(supabase, room.id, "FINAL_RESULTS");
    await logEvent(supabase, room.id, "GAME_ENDED", { reason: "round_limit" });
    return;
  }

  const { data: existingRound, error: existingRoundError } = await supabase
    .from("rounds")
    .select("id, room_id, question_id, round_number, results")
    .eq("room_id", room.id)
    .eq("round_number", nextRoundNumber)
    .maybeSingle<RoundRow>();

  if (existingRoundError) {
    throw new Error(existingRoundError.message);
  }

  let round = existingRound;

  if (!round) {
    const question = await chooseNextQuestion(supabase, room);
    const { data: insertedRound, error } = await supabase
    .from("rounds")
    .insert({
      room_id: room.id,
      round_number: nextRoundNumber,
      question_id: question.id,
      phase: "CHALLENGE_SELECTION",
      started_at: new Date().toISOString(),
    })
    .select("id, room_id, question_id, round_number, results")
    .single<RoundRow>();

    if (error || !insertedRound) {
      const { data: racedRound } = await supabase
        .from("rounds")
        .select("id, room_id, question_id, round_number, results")
        .eq("room_id", room.id)
        .eq("round_number", nextRoundNumber)
        .maybeSingle<RoundRow>();

      if (!racedRound) {
        throw new Error(error?.message || "Round could not be created.");
      }

      round = racedRound;
    } else {
      round = insertedRound;
    }
  }

  await assignLeadersAndChallenges(supabase, room, round);

  const { error: roomError } = await supabase
    .from("rooms")
    .update({
      current_round_number: nextRoundNumber,
      ...phaseUpdate("CHALLENGE_SELECTION", settings.challengeSelectionSeconds),
    })
    .eq("id", room.id);

  if (roomError) {
    throw new Error(roomError.message);
  }

  await logEvent(supabase, room.id, "ROUND_CREATED", { roundNumber: nextRoundNumber });
}

async function ensureChallengeSelections(supabase: SupabaseAdmin, roundId: string) {
  const { data, error } = await supabase
    .from("challenge_assignments")
    .select("id, challenge_id, options")
    .eq("round_id", roundId)
    .returns<Array<{ id: string; challenge_id: string | null; options: ChallengeOption[] }>>();

  if (error) {
    throw new Error(error.message);
  }

  for (const assignment of data || []) {
    if (assignment.challenge_id) {
      continue;
    }

    const option = randomItem(assignment.options || []);
    const { error: updateError } = await supabase
      .from("challenge_assignments")
      .update({
        challenge_id: option.id,
        selected_at: new Date().toISOString(),
        was_random: true,
      })
      .eq("id", assignment.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }
}

async function showQuestion(supabase: SupabaseAdmin, room: RoomAuthRow) {
  const settings = readSettings(room.settings);
  const round = await loadCurrentRound(supabase, room);

  if (!round) {
    throw new Error("Start the game before showing a question.");
  }

  await ensureChallengeSelections(supabase, round.id);
  await setRoomPhase(supabase, room.id, "QUESTION_ACTIVE", settings.questionTimerSeconds);
  await supabase.from("rounds").update({ phase: "QUESTION_ACTIVE" }).eq("id", round.id);
  await logEvent(supabase, room.id, "QUESTION_SHOWN", { roundId: round.id });
}

async function lockVoting(supabase: SupabaseAdmin, room: RoomAuthRow) {
  const round = await loadCurrentRound(supabase, room);

  if (!round) {
    throw new Error("No active round.");
  }

  await supabase
    .from("rounds")
    .update({
      phase: "VOTING_LOCKED",
      locked_at: new Date().toISOString(),
    })
    .eq("id", round.id);
  await setRoomPhase(supabase, room.id, "VOTING_LOCKED");
  await logEvent(supabase, room.id, "VOTING_LOCKED", { roundId: round.id });
}

async function revealAnswer(supabase: SupabaseAdmin, room: RoomAuthRow) {
  const { round, question } = await loadRoundQuestion(supabase, room);
  const [teams, players, votesResult] = await Promise.all([
    loadTeams(supabase, room.id),
    loadPlayers(supabase, room.id),
    supabase
      .from("votes")
      .select("player_id, answer_id")
      .eq("round_id", round.id)
      .returns<VoteRow[]>(),
  ]);

  if (votesResult.error) {
    throw new Error(votesResult.error.message);
  }

  const scoring = computeTeamScores(
    teams,
    players,
    votesResult.data || [],
    question.correct_answer_id,
  );
  const correctOption = question.answer_options.find(
    (option) => option.id === question.correct_answer_id,
  );
  const results = {
    revealedAnswer: {
      correctAnswerId: question.correct_answer_id,
      correctAnswerName: correctOption?.name || "Unknown",
    },
    ...scoring,
  };

  if (scoring.winnerTeamIds.length > 0) {
    const winnerScores = teams
      .filter((team) => scoring.winnerTeamIds.includes(team.id))
      .map((team) =>
        supabase
          .from("teams")
          .update({ score: team.score + 1 })
          .eq("id", team.id),
      );
    await Promise.all(winnerScores);
  }

  await supabase
    .from("votes")
    .update({ is_correct: false })
    .eq("round_id", round.id);
  await supabase
    .from("votes")
    .update({ is_correct: true })
    .eq("round_id", round.id)
    .eq("answer_id", question.correct_answer_id);
  await supabase
    .from("rounds")
    .update({
      phase: scoring.completeDraw ? "ROUND_DRAW" : "ANSWER_REVEAL",
      revealed_at: new Date().toISOString(),
      results,
    })
    .eq("id", round.id);
  await setRoomPhase(
    supabase,
    room.id,
    scoring.completeDraw ? "ROUND_DRAW" : "ANSWER_REVEAL",
  );
  await logEvent(supabase, room.id, "ANSWER_REVEALED", { roundId: round.id });
}

async function startSavingGrace(supabase: SupabaseAdmin, room: RoomAuthRow) {
  const round = await loadCurrentRound(supabase, room);

  if (!round) {
    throw new Error("No active round.");
  }

  const results = round.results as {
    lastPlaceTeamIds?: string[];
  };
  const teamIds = results.lastPlaceTeamIds || [];

  if (teamIds.length === 0) {
    await setRoomPhase(supabase, room.id, "ROUND_COMPLETE");
    return;
  }

  const { data: leaders, error: leadersError } = await supabase
    .from("round_leaders")
    .select("team_id, player_id")
    .eq("round_id", round.id)
    .returns<Array<{ team_id: string; player_id: string }>>();

  if (leadersError) {
    throw new Error(leadersError.message);
  }

  const rows = teamIds.map((teamId) => ({
    room_id: room.id,
    round_id: round.id,
    team_id: teamId,
    leader_player_id:
      leaders?.find((leader) => leader.team_id === teamId)?.player_id || null,
  }));

  const { error } = await supabase
    .from("saving_grace_attempts")
    .upsert(rows, { onConflict: "round_id,team_id" });

  if (error) {
    throw new Error(error.message);
  }

  const settings = readSettings(room.settings);
  await setRoomPhase(
    supabase,
    room.id,
    "SAVING_GRACE_CATEGORY",
    settings.savingGraceCategorySeconds,
  );
}

async function startSavingGraceActive(supabase: SupabaseAdmin, room: RoomAuthRow) {
  const round = await loadCurrentRound(supabase, room);

  if (!round) {
    throw new Error("No active round.");
  }

  const { data, error } = await supabase
    .from("saving_grace_attempts")
    .select("id, category")
    .eq("round_id", round.id)
    .returns<Array<{ id: string; category: SavingGraceCategory | null }>>();

  if (error) {
    throw new Error(error.message);
  }

  for (const attempt of data || []) {
    if (attempt.category) {
      continue;
    }

    const category = randomItem<SavingGraceCategory>([
      "TIME_OF_DAY",
      "NEXT_SENDER",
      "REACTION_COUNT",
    ]);
    const { error: updateError } = await supabase
      .from("saving_grace_attempts")
      .update({ category, category_selected_at: new Date().toISOString() })
      .eq("id", attempt.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  const settings = readSettings(room.settings);
  await setRoomPhase(
    supabase,
    room.id,
    "SAVING_GRACE_ACTIVE",
    settings.savingGraceAnswerSeconds,
  );
}

async function revealSavingGrace(supabase: SupabaseAdmin, room: RoomAuthRow) {
  const { round, question } = await loadRoundQuestion(supabase, room);
  const { data, error } = await supabase
    .from("saving_grace_attempts")
    .select("id, team_id, leader_player_id, category, answer, correct_answer, is_correct")
    .eq("round_id", round.id)
    .returns<AttemptRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  const failedTeamIds: string[] = [];

  for (const attempt of data || []) {
    const category =
      attempt.category ||
      randomItem<SavingGraceCategory>([
        "TIME_OF_DAY",
        "NEXT_SENDER",
        "REACTION_COUNT",
      ]);
    const prompt = savingGracePrompt(category, question);
    const answer = attempt.answer || "";
    const isCorrect = answer.trim().toLowerCase() === prompt.correctAnswer.toLowerCase();

    if (!isCorrect) {
      failedTeamIds.push(attempt.team_id);
    }

    const { error: updateError } = await supabase
      .from("saving_grace_attempts")
      .update({
        category,
        answer: answer || null,
        correct_answer: prompt.correctAnswer,
        is_correct: isCorrect,
        answered_at: attempt.answer ? new Date().toISOString() : null,
      })
      .eq("id", attempt.id);

    if (updateError) {
      throw new Error(updateError.message);
    }
  }

  await supabase
    .from("rounds")
    .update({
      results: {
        ...(round.results || {}),
        savingGraceFailedTeamIds: failedTeamIds,
      },
    })
    .eq("id", round.id);
  await setRoomPhase(
    supabase,
    room.id,
    failedTeamIds.length === 0 ? "ROUND_COMPLETE" : "SAVING_GRACE_RESULT",
  );
}

async function startLambSelection(supabase: SupabaseAdmin, room: RoomAuthRow) {
  const round = await loadCurrentRound(supabase, room);

  if (!round) {
    throw new Error("No active round.");
  }

  const failedTeamIds = (round.results?.savingGraceFailedTeamIds || []) as string[];

  if (failedTeamIds.length === 0) {
    await setRoomPhase(supabase, room.id, "ROUND_COMPLETE");
    return;
  }

  const teams = await loadTeams(supabase, room.id);
  const rows = failedTeamIds
    .map((teamId) => teams.find((team) => team.id === teamId))
    .filter(Boolean)
    .sort((left, right) => (left?.team_index || 0) - (right?.team_index || 0))
    .map((team, queueIndex) => ({
      room_id: room.id,
      round_id: round.id,
      team_id: team?.id,
      status: "awaiting_lamb",
      queue_index: queueIndex,
    }));

  const { error } = await supabase.from("penalties").insert(rows);

  if (error) {
    throw new Error(error.message);
  }

  const settings = readSettings(room.settings);
  await setRoomPhase(
    supabase,
    room.id,
    "SACRIFICIAL_LAMB_SELECTION",
    settings.lambSelectionSeconds,
  );
}

async function fillMissingLambs(supabase: SupabaseAdmin, room: RoomAuthRow) {
  const round = await loadCurrentRound(supabase, room);

  if (!round) {
    throw new Error("No active round.");
  }

  const [players, leadersResult, penaltiesResult] = await Promise.all([
    loadPlayers(supabase, room.id),
    supabase
      .from("round_leaders")
      .select("team_id, player_id")
      .eq("round_id", round.id)
      .returns<Array<{ team_id: string; player_id: string }>>(),
    supabase
      .from("penalties")
      .select("id, team_id, lamb_player_id")
      .eq("round_id", round.id)
      .returns<Array<{ id: string; team_id: string; lamb_player_id: string | null }>>(),
  ]);

  if (leadersResult.error) {
    throw new Error(leadersResult.error.message);
  }

  if (penaltiesResult.error) {
    throw new Error(penaltiesResult.error.message);
  }

  for (const penalty of penaltiesResult.data || []) {
    if (penalty.lamb_player_id) {
      await supabase
        .from("penalties")
        .update({ status: "awaiting_consequence" })
        .eq("id", penalty.id);
      continue;
    }

    const leaderId =
      leadersResult.data?.find((leader) => leader.team_id === penalty.team_id)
        ?.player_id || null;
    const fallback =
      players.find(
        (player) => player.team_id === penalty.team_id && player.status === "active",
      )?.id || null;
    const lambId = leaderId || fallback;

    const { error } = await supabase
      .from("penalties")
      .update({
        lamb_player_id: lambId,
        status: "awaiting_consequence",
      })
      .eq("id", penalty.id);

    if (error) {
      throw new Error(error.message);
    }
  }
}

async function revealLambs(supabase: SupabaseAdmin, room: RoomAuthRow) {
  await fillMissingLambs(supabase, room);
  await setRoomPhase(supabase, room.id, "SACRIFICIAL_LAMB_REVEAL");
}

async function startConsequenceChoice(supabase: SupabaseAdmin, room: RoomAuthRow) {
  const settings = readSettings(room.settings);
  await setRoomPhase(
    supabase,
    room.id,
    "CONSEQUENCE_CHOICE",
    settings.consequenceChoiceSeconds,
  );
}

async function loadPenalties(supabase: SupabaseAdmin, roundId: string) {
  const { data, error } = await supabase
    .from("penalties")
    .select(
      "id, team_id, lamb_player_id, rescuer_player_id, consequence_choice, challenge_assignment_id, status, queue_index, payload",
    )
    .eq("round_id", roundId)
    .order("queue_index", { ascending: true })
    .returns<PenaltyRow[]>();

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
}

function phaseForPenaltyStatus(status: string): GamePhase {
  switch (status) {
    case "awaiting_drink":
      return "DRINK_CONFIRMATION";
    case "challenge_reveal":
      return "CHALLENGE_REVEAL";
    case "challenge_active":
      return "CHALLENGE_ACTIVE";
    case "awaiting_rescuer":
      return "RESCUER_SELECTION";
    case "bottle_active":
      return "BOTTLE_FLIP_ACTIVE";
    case "pie_confirmation":
      return "PIE_CONFIRMATION";
    default:
      return "ROUND_COMPLETE";
  }
}

async function attachChallengeToPenalty(
  supabase: SupabaseAdmin,
  roundId: string,
  penalty: PenaltyRow,
) {
  const { data: assignment, error } = await supabase
    .from("challenge_assignments")
    .select("id")
    .eq("round_id", roundId)
    .eq("target_team_id", penalty.team_id)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  if (!assignment) {
    throw new Error("No challenge assignment found for this team.");
  }

  const { error: updateError } = await supabase
    .from("penalties")
    .update({ challenge_assignment_id: assignment.id })
    .eq("id", penalty.id);

  if (updateError) {
    throw new Error(updateError.message);
  }
}

async function activateNextPenalty(supabase: SupabaseAdmin, room: RoomAuthRow) {
  const round = await loadCurrentRound(supabase, room);

  if (!round) {
    throw new Error("No active round.");
  }

  const penalties = await loadPenalties(supabase, round.id);
  const nextPenalty = penalties.find((penalty) => penalty.status !== "complete");

  if (!nextPenalty) {
    await setRoomPhase(supabase, room.id, "ROUND_COMPLETE");
    return;
  }

  let status = nextPenalty.status;

  if (status === "awaiting_consequence") {
    const choice = nextPenalty.consequence_choice || "CHALLENGE";

    if (!nextPenalty.consequence_choice) {
      await supabase
        .from("penalties")
        .update({ consequence_choice: choice })
        .eq("id", nextPenalty.id);
    }

    status = choice === "DRINK" ? "awaiting_drink" : "challenge_reveal";

    await supabase.from("penalties").update({ status }).eq("id", nextPenalty.id);

    if (choice === "CHALLENGE") {
      await attachChallengeToPenalty(supabase, round.id, nextPenalty);
    }
  }

  await setRoomPhase(supabase, room.id, phaseForPenaltyStatus(status));
}

async function completeActivePenalty(
  supabase: SupabaseAdmin,
  room: RoomAuthRow,
  payload: Record<string, unknown>,
) {
  const round = await loadCurrentRound(supabase, room);

  if (!round) {
    throw new Error("No active round.");
  }

  const penalties = await loadPenalties(supabase, round.id);
  const active = penalties.find((penalty) => penalty.status !== "complete");

  if (!active) {
    await setRoomPhase(supabase, room.id, "ROUND_COMPLETE");
    return;
  }

  const { error } = await supabase
    .from("penalties")
    .update({
      status: "complete",
      payload: { ...(active.payload || {}), ...payload },
    })
    .eq("id", active.id);

  if (error) {
    throw new Error(error.message);
  }

  await activateNextPenalty(supabase, room);
}

async function startChallenge(supabase: SupabaseAdmin, room: RoomAuthRow) {
  const round = await loadCurrentRound(supabase, room);

  if (!round) {
    throw new Error("No active round.");
  }

  const penalties = await loadPenalties(supabase, round.id);
  const active = penalties.find((penalty) => penalty.status === "challenge_reveal");

  if (!active) {
    throw new Error("No challenge is ready to start.");
  }

  const { data: assignment, error } = await supabase
    .from("challenge_assignments")
    .select("challenges(duration_seconds)")
    .eq("id", active.challenge_assignment_id)
    .maybeSingle<{ challenges: { duration_seconds: number } | null }>();

  if (error) {
    throw new Error(error.message);
  }

  const duration = assignment?.challenges?.duration_seconds || 30;
  await supabase
    .from("penalties")
    .update({ status: "challenge_active" })
    .eq("id", active.id);
  await setRoomPhase(supabase, room.id, "CHALLENGE_ACTIVE", duration);
}

async function challengeFailed(supabase: SupabaseAdmin, room: RoomAuthRow) {
  const round = await loadCurrentRound(supabase, room);

  if (!round) {
    throw new Error("No active round.");
  }

  const penalties = await loadPenalties(supabase, round.id);
  const active = penalties.find((penalty) => penalty.status === "challenge_active");

  if (!active) {
    throw new Error("No active challenge.");
  }

  const settings = readSettings(room.settings);
  await supabase
    .from("penalties")
    .update({ status: "awaiting_rescuer" })
    .eq("id", active.id);
  await setRoomPhase(supabase, room.id, "RESCUER_SELECTION", settings.lambSelectionSeconds);
}

async function startBottleFlip(supabase: SupabaseAdmin, room: RoomAuthRow) {
  const round = await loadCurrentRound(supabase, room);

  if (!round) {
    throw new Error("No active round.");
  }

  const penalties = await loadPenalties(supabase, round.id);
  const active = penalties.find((penalty) => penalty.status === "awaiting_rescuer");

  if (!active) {
    throw new Error("No rescuer selection is active.");
  }

  if (!active.rescuer_player_id) {
    const players = await loadPlayers(supabase, room.id);
    const fallback = players.find(
      (player) =>
        player.team_id === active.team_id &&
        player.status === "active" &&
        player.id !== active.lamb_player_id,
    );

    if (fallback) {
      await supabase
        .from("penalties")
        .update({ rescuer_player_id: fallback.id })
        .eq("id", active.id);
    }
  }

  const settings = readSettings(room.settings);
  await supabase
    .from("penalties")
    .update({ status: "bottle_active" })
    .eq("id", active.id);
  await setRoomPhase(supabase, room.id, "BOTTLE_FLIP_ACTIVE", settings.bottleFlipSeconds);
}

async function bottleMissed(supabase: SupabaseAdmin, room: RoomAuthRow) {
  const round = await loadCurrentRound(supabase, room);

  if (!round) {
    throw new Error("No active round.");
  }

  const penalties = await loadPenalties(supabase, round.id);
  const active = penalties.find((penalty) => penalty.status === "bottle_active");

  if (!active) {
    throw new Error("No active bottle flip.");
  }

  await supabase
    .from("penalties")
    .update({ status: "pie_confirmation" })
    .eq("id", active.id);
  await setRoomPhase(supabase, room.id, "PIE_CONFIRMATION");
}

async function updateTimer(supabase: SupabaseAdmin, room: RoomAuthRow, action: HostAction) {
  if (action === "PAUSE") {
    if (!room.phase_ends_at || room.is_paused) {
      return;
    }

    const remaining = Math.max(0, Date.parse(room.phase_ends_at) - Date.now());
    const { error } = await supabase
      .from("rooms")
      .update({
        is_paused: true,
        remaining_ms_when_paused: remaining,
        phase_ends_at: null,
      })
      .eq("id", room.id);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  if (action === "RESUME") {
    if (!room.is_paused || !room.remaining_ms_when_paused) {
      return;
    }

    const { error } = await supabase
      .from("rooms")
      .update({
        is_paused: false,
        phase_ends_at: new Date(Date.now() + room.remaining_ms_when_paused).toISOString(),
        remaining_ms_when_paused: null,
      })
      .eq("id", room.id);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  if (action === "ADD_5" || action === "ADD_10") {
    const addMs = action === "ADD_5" ? 5000 : 10000;
    const base = room.phase_ends_at ? Date.parse(room.phase_ends_at) : Date.now();
    const { error } = await supabase
      .from("rooms")
      .update({ phase_ends_at: new Date(base + addMs).toISOString() })
      .eq("id", room.id);

    if (error) {
      throw new Error(error.message);
    }

    return;
  }

  if (action === "END_TIMER") {
    const { error } = await supabase
      .from("rooms")
      .update({ phase_ends_at: new Date().toISOString() })
      .eq("id", room.id);

    if (error) {
      throw new Error(error.message);
    }
  }
}

export async function runHostAction(
  supabase: SupabaseAdmin,
  room: RoomAuthRow,
  action: HostAction,
) {
  switch (action) {
    case "LOCK_TEAMS":
      await setRoomPhase(supabase, room.id, "TEAM_SETUP");
      break;
    case "START_GAME":
    case "NEXT_ROUND":
      await createNextRound(supabase, room);
      break;
    case "SHOW_QUESTION":
      await showQuestion(supabase, room);
      break;
    case "LOCK_VOTING":
      await lockVoting(supabase, room);
      break;
    case "REVEAL_ANSWER":
      await revealAnswer(supabase, room);
      break;
    case "START_SAVING_GRACE":
      await startSavingGrace(supabase, room);
      break;
    case "START_SAVING_GRACE_ACTIVE":
      await startSavingGraceActive(supabase, room);
      break;
    case "REVEAL_SAVING_GRACE":
      await revealSavingGrace(supabase, room);
      break;
    case "START_LAMB_SELECTION":
      await startLambSelection(supabase, room);
      break;
    case "REVEAL_SACRIFICIAL_LAMB":
      await revealLambs(supabase, room);
      break;
    case "START_CONSEQUENCE_CHOICE":
      await startConsequenceChoice(supabase, room);
      break;
    case "START_PENALTY_QUEUE":
      await activateNextPenalty(supabase, room);
      break;
    case "CONFIRM_DRINK":
      await completeActivePenalty(supabase, room, { drinkConfirmed: true });
      break;
    case "START_CHALLENGE":
      await startChallenge(supabase, room);
      break;
    case "CHALLENGE_PASSED":
      await completeActivePenalty(supabase, room, { challengePassed: true });
      break;
    case "CHALLENGE_FAILED":
      await challengeFailed(supabase, room);
      break;
    case "START_BOTTLE_FLIP":
      await startBottleFlip(supabase, room);
      break;
    case "BOTTLE_LANDED":
      await completeActivePenalty(supabase, room, { bottleLanded: true });
      break;
    case "BOTTLE_MISSED":
      await bottleMissed(supabase, room);
      break;
    case "CONFIRM_PIE":
      await completeActivePenalty(supabase, room, { pieConfirmed: true });
      break;
    case "END_GAME":
      await setRoomPhase(supabase, room.id, "FINAL_RESULTS");
      break;
    case "PAUSE":
    case "RESUME":
    case "ADD_5":
    case "ADD_10":
    case "END_TIMER":
      await updateTimer(supabase, room, action);
      break;
    default:
      throw new Error(`Unsupported host action: ${action}`);
  }

  await logEvent(supabase, room.id, "HOST_ACTION", { action });
  return rebuildPublicRoomState(room.id);
}

export async function submitVote(
  supabase: SupabaseAdmin,
  room: RoomAuthRow,
  player: PlayerAuthRow,
  answerId: string,
) {
  if (room.phase !== "QUESTION_ACTIVE") {
    throw new Error("Voting is not active.");
  }

  if (room.is_paused || isAfterDeadline(room.phase_ends_at)) {
    throw new Error("Voting is closed.");
  }

  const { round, question } = await loadRoundQuestion(supabase, room);

  if (!question.answer_options.some((option) => option.id === answerId)) {
    throw new Error("Answer option is not valid for this question.");
  }

  const { error } = await supabase.from("votes").upsert(
    {
      room_id: room.id,
      round_id: round.id,
      player_id: player.id,
      answer_id: answerId,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "round_id,player_id" },
  );

  if (error) {
    throw new Error(error.message);
  }

  await logEvent(supabase, room.id, "VOTE_SUBMITTED", { roundId: round.id }, player.id);
  return rebuildPublicRoomState(room.id);
}

async function requireLeader(
  supabase: SupabaseAdmin,
  room: RoomAuthRow,
  player: PlayerAuthRow,
) {
  const round = await loadCurrentRound(supabase, room);

  if (!round || !player.team_id) {
    throw new Error("No active leader action.");
  }

  const { data, error } = await supabase
    .from("round_leaders")
    .select("id")
    .eq("round_id", round.id)
    .eq("team_id", player.team_id)
    .eq("player_id", player.id)
    .maybeSingle<{ id: string }>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Only the current Group Leader can do this.");
  }

  return round;
}

export async function selectLeaderChallenge(
  supabase: SupabaseAdmin,
  room: RoomAuthRow,
  player: PlayerAuthRow,
  assignmentId: string,
  challengeId: string,
) {
  if (room.phase !== "CHALLENGE_SELECTION") {
    throw new Error("Challenge selection is not active.");
  }

  const round = await requireLeader(supabase, room, player);
  const { data: assignment, error } = await supabase
    .from("challenge_assignments")
    .select("id, chooser_team_id, challenge_id, options")
    .eq("id", assignmentId)
    .eq("round_id", round.id)
    .eq("chooser_team_id", player.team_id)
    .maybeSingle<AssignmentRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!assignment) {
    throw new Error("Challenge assignment not found.");
  }

  const selected = (assignment.options || []).find((option) => option.id === challengeId);

  if (!selected) {
    throw new Error("Challenge option is not valid.");
  }

  const { error: updateError } = await supabase
    .from("challenge_assignments")
    .update({
      challenge_id: challengeId,
      selected_at: new Date().toISOString(),
      was_random: false,
    })
    .eq("id", assignment.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return rebuildPublicRoomState(room.id);
}

export async function selectSavingGraceCategory(
  supabase: SupabaseAdmin,
  room: RoomAuthRow,
  player: PlayerAuthRow,
  category: SavingGraceCategory,
) {
  if (room.phase !== "SAVING_GRACE_CATEGORY") {
    throw new Error("Saving Grace category selection is not active.");
  }

  const round = await requireLeader(supabase, room, player);
  const { error } = await supabase
    .from("saving_grace_attempts")
    .update({
      category,
      category_selected_at: new Date().toISOString(),
    })
    .eq("round_id", round.id)
    .eq("team_id", player.team_id);

  if (error) {
    throw new Error(error.message);
  }

  return rebuildPublicRoomState(room.id);
}

export async function submitSavingGraceAnswer(
  supabase: SupabaseAdmin,
  room: RoomAuthRow,
  player: PlayerAuthRow,
  answer: string,
) {
  if (room.phase !== "SAVING_GRACE_ACTIVE") {
    throw new Error("Saving Grace answers are not active.");
  }

  const round = await requireLeader(supabase, room, player);
  const { error } = await supabase
    .from("saving_grace_attempts")
    .update({
      answer: answer.trim(),
      answered_at: new Date().toISOString(),
    })
    .eq("round_id", round.id)
    .eq("team_id", player.team_id);

  if (error) {
    throw new Error(error.message);
  }

  return rebuildPublicRoomState(room.id);
}

export async function selectSacrificialLamb(
  supabase: SupabaseAdmin,
  room: RoomAuthRow,
  player: PlayerAuthRow,
  lambPlayerId: string,
) {
  if (room.phase !== "SACRIFICIAL_LAMB_SELECTION") {
    throw new Error("Sacrificial Lamb selection is not active.");
  }

  const round = await requireLeader(supabase, room, player);
  const players = await loadPlayers(supabase, room.id);
  const selected = players.find(
    (candidate) =>
      candidate.id === lambPlayerId &&
      candidate.team_id === player.team_id &&
      candidate.status === "active",
  );

  if (!selected) {
    throw new Error("Selected lamb must be an active teammate.");
  }

  const { error } = await supabase
    .from("penalties")
    .update({ lamb_player_id: selected.id })
    .eq("round_id", round.id)
    .eq("team_id", player.team_id);

  if (error) {
    throw new Error(error.message);
  }

  return rebuildPublicRoomState(room.id);
}

export async function chooseConsequence(
  supabase: SupabaseAdmin,
  room: RoomAuthRow,
  player: PlayerAuthRow,
  choice: ConsequenceChoice,
) {
  if (room.phase !== "CONSEQUENCE_CHOICE") {
    throw new Error("Consequence choice is not active.");
  }

  const round = await loadCurrentRound(supabase, room);

  if (!round) {
    throw new Error("No active round.");
  }

  const { error } = await supabase
    .from("penalties")
    .update({ consequence_choice: choice })
    .eq("round_id", round.id)
    .eq("lamb_player_id", player.id);

  if (error) {
    throw new Error(error.message);
  }

  return rebuildPublicRoomState(room.id);
}

export async function chooseRescuer(
  supabase: SupabaseAdmin,
  room: RoomAuthRow,
  player: PlayerAuthRow,
  rescuerPlayerId: string,
) {
  if (room.phase !== "RESCUER_SELECTION") {
    throw new Error("Rescuer selection is not active.");
  }

  const round = await loadCurrentRound(supabase, room);

  if (!round) {
    throw new Error("No active round.");
  }

  const penalties = await loadPenalties(supabase, round.id);
  const active = penalties.find(
    (penalty) => penalty.status === "awaiting_rescuer" && penalty.lamb_player_id === player.id,
  );

  if (!active) {
    throw new Error("Only the active lamb can choose a rescuer.");
  }

  const players = await loadPlayers(supabase, room.id);
  const selected = players.find(
    (candidate) =>
      candidate.id === rescuerPlayerId &&
      candidate.team_id === player.team_id &&
      candidate.status === "active" &&
      candidate.id !== player.id,
  );

  if (!selected) {
    throw new Error("Rescuer must be another active teammate.");
  }

  const { error } = await supabase
    .from("penalties")
    .update({ rescuer_player_id: selected.id })
    .eq("id", active.id);

  if (error) {
    throw new Error(error.message);
  }

  return rebuildPublicRoomState(room.id);
}
