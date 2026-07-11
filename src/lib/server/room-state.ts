import "server-only";

import { getJoinUrl, SOFT_PLAYER_CAP } from "@/lib/config";
import type {
  AnswerOption,
  GamePhase,
  PenaltyPublic,
  PlayerPublic,
  PlayerStatus,
  PublicRoomState,
  SavingGraceCategory,
  TeamPublic,
} from "@/lib/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";

interface RoomRow {
  id: string;
  room_code: string;
  title: string;
  phase: GamePhase;
  team_count: number;
  current_round_number: number;
  phase_started_at: string | null;
  phase_ends_at: string | null;
  is_paused: boolean;
  remaining_ms_when_paused: number | null;
  created_at: string;
  updated_at: string;
}

interface TeamRow {
  id: string;
  room_id: string;
  team_index: number;
  name: string;
  color: string;
  icon: string;
  score: number;
}

interface PlayerRow {
  id: string;
  room_id: string;
  team_id: string | null;
  display_name: string;
  initials: string;
  avatar_url: string | null;
  join_order: number;
  status: PlayerStatus;
  is_connected: boolean;
  last_seen_at: string | null;
}

interface RoundRow {
  id: string;
  room_id: string;
  question_id: string | null;
  round_number: number;
  results: Record<string, unknown>;
}

interface QuestionRow {
  id: string;
  quote: string;
  answer_options: AnswerOption[];
}

interface LeaderRow {
  team_id: string;
  player_id: string;
}

interface VoteRow {
  player_id: string;
}

interface AttemptRow {
  team_id: string;
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
  consequence_choice: "DRINK" | "CHALLENGE" | null;
  challenge_assignment_id: string | null;
  status: string;
  queue_index: number;
}

interface AssignmentChallengeRow {
  id: string;
  target_team_id: string;
  challenges:
    | {
        title: string;
        instructions: string;
        duration_seconds: number;
        success_criteria: string;
      }
    | null;
}

export function toPlayerPublic(player: PlayerRow): PlayerPublic {
  const lastSeenMs = player.last_seen_at ? Date.parse(player.last_seen_at) : 0;
  const recentlySeen = lastSeenMs > 0 && Date.now() - lastSeenMs < 15_000;

  return {
    id: player.id,
    teamId: player.team_id,
    displayName: player.display_name,
    initials: player.initials,
    avatarUrl: player.avatar_url,
    joinOrder: player.join_order,
    status: player.status,
    isConnected: player.is_connected && recentlySeen,
  };
}

export function buildPublicRoomState(
  room: RoomRow,
  teams: TeamRow[],
  players: PlayerRow[],
  version: number,
  gameData?: {
    round: RoundRow | null;
    question: QuestionRow | null;
    leaders: LeaderRow[];
    votes: VoteRow[];
    attempts: AttemptRow[];
    penalties: PenaltyRow[];
    assignmentChallenges: AssignmentChallengeRow[];
  },
): PublicRoomState {
  const publicPlayers = players.map(toPlayerPublic);
  const teamsWithPlayers: TeamPublic[] = teams.map((team) => {
    const teamPlayers = publicPlayers.filter(
      (player) => player.teamId === team.id && player.status !== "inactive",
    );

    return {
      id: team.id,
      teamIndex: team.team_index,
      name: team.name,
      color: team.color,
      icon: team.icon,
      score: team.score,
      playerCount: teamPlayers.length,
      players: teamPlayers,
    };
  });

  const activePlayerCount = publicPlayers.filter(
    (player) => player.status === "active",
  ).length;
  const pendingPlayerCount = publicPlayers.filter(
    (player) => player.status === "pending",
  ).length;

  const state: PublicRoomState = {
    roomId: room.id,
    roomCode: room.room_code,
    title: room.title,
    phase: room.phase,
    teamCount: room.team_count,
    currentRoundNumber: room.current_round_number,
    version,
    updatedAt: new Date().toISOString(),
    createdAt: room.created_at,
    timer: {
      phaseStartedAt: room.phase_started_at,
      phaseEndsAt: room.phase_ends_at,
      isPaused: room.is_paused,
      remainingMsWhenPaused: room.remaining_ms_when_paused,
    },
    lobby: {
      joinUrl: getJoinUrl(room.room_code),
      playerCount: publicPlayers.length,
      activePlayerCount,
      pendingPlayerCount,
      softCap: SOFT_PLAYER_CAP,
    },
    teams: teamsWithPlayers,
    players: publicPlayers,
    leaderboard: teamsWithPlayers.map((team) => ({
      teamId: team.id,
      teamIndex: team.teamIndex,
      name: team.name,
      color: team.color,
      score: team.score,
    })),
  };

  if (!gameData?.round) {
    return state;
  }

  const round = gameData.round;
  const phase = room.phase;
  const revealPhases: GamePhase[] = [
    "ANSWER_REVEAL",
    "ROUND_DRAW",
    "SAVING_GRACE_CATEGORY",
    "SAVING_GRACE_ACTIVE",
    "SAVING_GRACE_RESULT",
    "SACRIFICIAL_LAMB_SELECTION",
    "SACRIFICIAL_LAMB_REVEAL",
    "CONSEQUENCE_CHOICE",
    "DRINK_CONFIRMATION",
    "CHALLENGE_REVEAL",
    "CHALLENGE_ACTIVE",
    "CHALLENGE_RESULT",
    "RESCUER_SELECTION",
    "RESCUER_REVEAL",
    "BOTTLE_FLIP_ACTIVE",
    "BOTTLE_FLIP_RESULT",
    "PIE_CONFIRMATION",
    "ROUND_COMPLETE",
    "FINAL_RESULTS",
  ];

  state.leaders = gameData.leaders
    .map((leader) => {
      const team = teamsWithPlayers.find((item) => item.id === leader.team_id);
      const player = publicPlayers.find((item) => item.id === leader.player_id);

      if (!team || !player) {
        return null;
      }

      return {
        teamId: team.id,
        teamIndex: team.teamIndex,
        teamName: team.name,
        teamColor: team.color,
        playerId: player.id,
        displayName: player.displayName,
        initials: player.initials,
        avatarUrl: player.avatarUrl,
      };
    })
    .filter(Boolean) as NonNullable<PublicRoomState["leaders"]>;

  if (
    gameData.question &&
    [
      "QUESTION_ACTIVE",
      "VOTING_LOCKED",
      ...revealPhases,
    ].includes(phase)
  ) {
    state.question = {
      roundId: round.id,
      roundNumber: round.round_number,
      quote: gameData.question.quote,
      answerOptions: gameData.question.answer_options,
    };
  }

  if (["QUESTION_ACTIVE", "VOTING_LOCKED", ...revealPhases].includes(phase)) {
    const eligible = publicPlayers.filter(
      (player) => player.status === "active" && player.teamId,
    ).length;
    state.voteProgress = {
      submitted: new Set(gameData.votes.map((vote) => vote.player_id)).size,
      eligible,
    };
  }

  if (revealPhases.includes(phase) && round.results?.teams) {
    state.roundResults = round.results as unknown as PublicRoomState["roundResults"];
  }

  if (
    gameData.attempts.length > 0 &&
    [
      "SAVING_GRACE_CATEGORY",
      "SAVING_GRACE_ACTIVE",
      "SAVING_GRACE_RESULT",
      "SACRIFICIAL_LAMB_SELECTION",
      "SACRIFICIAL_LAMB_REVEAL",
      "CONSEQUENCE_CHOICE",
      "DRINK_CONFIRMATION",
      "CHALLENGE_REVEAL",
      "CHALLENGE_ACTIVE",
      "CHALLENGE_RESULT",
      "RESCUER_SELECTION",
      "RESCUER_REVEAL",
      "BOTTLE_FLIP_ACTIVE",
      "BOTTLE_FLIP_RESULT",
      "PIE_CONFIRMATION",
      "ROUND_COMPLETE",
    ].includes(phase)
  ) {
    const showResults = [
      "SAVING_GRACE_RESULT",
      "SACRIFICIAL_LAMB_SELECTION",
      "SACRIFICIAL_LAMB_REVEAL",
      "CONSEQUENCE_CHOICE",
      "DRINK_CONFIRMATION",
      "CHALLENGE_REVEAL",
      "CHALLENGE_ACTIVE",
      "CHALLENGE_RESULT",
      "RESCUER_SELECTION",
      "RESCUER_REVEAL",
      "BOTTLE_FLIP_ACTIVE",
      "BOTTLE_FLIP_RESULT",
      "PIE_CONFIRMATION",
      "ROUND_COMPLETE",
    ].includes(phase);

    state.savingGrace = {
      teamIds: gameData.attempts.map((attempt) => attempt.team_id),
      categoryByTeamId: Object.fromEntries(
        gameData.attempts.map((attempt) => [attempt.team_id, attempt.category]),
      ),
      answeredTeamIds: gameData.attempts
        .filter((attempt) => attempt.answer)
        .map((attempt) => attempt.team_id),
      ...(showResults
        ? {
            resultsByTeamId: Object.fromEntries(
              gameData.attempts.map((attempt) => [
                attempt.team_id,
                {
                  category: attempt.category || "TIME_OF_DAY",
                  answer: attempt.answer,
                  correctAnswer: attempt.correct_answer || "",
                  isCorrect: Boolean(attempt.is_correct),
                },
              ]),
            ),
          }
        : {}),
    };
  }

  if (gameData.penalties.length > 0) {
    const firstIncomplete = gameData.penalties.find(
      (penalty) => penalty.status !== "complete",
    );
    const penalties: PenaltyPublic[] = gameData.penalties.map((penalty) => {
      const team = teamsWithPlayers.find((item) => item.id === penalty.team_id);
      const lamb = publicPlayers.find((item) => item.id === penalty.lamb_player_id);
      const rescuer = publicPlayers.find(
        (item) => item.id === penalty.rescuer_player_id,
      );
      const assignment = gameData.assignmentChallenges.find(
        (item) => item.id === penalty.challenge_assignment_id,
      );
      const challengeVisible = [
        "challenge_reveal",
        "challenge_active",
        "awaiting_rescuer",
        "bottle_active",
        "pie_confirmation",
        "complete",
      ].includes(penalty.status);

      return {
        id: penalty.id,
        teamId: penalty.team_id,
        teamIndex: team?.teamIndex || 0,
        teamName: team?.name || "Team",
        teamColor: team?.color || "#ffffff",
        lambPlayerId: lamb?.id || null,
        lambName: lamb?.displayName || null,
        rescuerPlayerId: rescuer?.id || null,
        rescuerName: rescuer?.displayName || null,
        consequenceChoice: penalty.consequence_choice,
        status: penalty.status,
        queueIndex: penalty.queue_index,
        isActive: firstIncomplete?.id === penalty.id,
        ...(challengeVisible && assignment?.challenges
          ? {
              challenge: {
                title: assignment.challenges.title,
                instructions: assignment.challenges.instructions,
                durationSeconds: assignment.challenges.duration_seconds,
                successCriteria: assignment.challenges.success_criteria,
              },
            }
          : {}),
      };
    });

    state.penalties = penalties;
    state.activePenalty = penalties.find((penalty) => penalty.isActive) || null;
  }

  if (phase === "FINAL_RESULTS") {
    const maxScore = Math.max(...teamsWithPlayers.map((team) => team.score));
    state.finalWinnerTeamIds = teamsWithPlayers
      .filter((team) => team.score === maxScore)
      .map((team) => team.id);
  }

  return state;
}

export async function rebuildPublicRoomState(roomId: string) {
  const supabase = getSupabaseAdmin();

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select(
      "id, room_code, title, phase, team_count, current_round_number, phase_started_at, phase_ends_at, is_paused, remaining_ms_when_paused, created_at, updated_at",
    )
    .eq("id", roomId)
    .single<RoomRow>();

  if (roomError || !room) {
    throw new Error(roomError?.message || "Room not found");
  }

  const [{ data: teams, error: teamsError }, { data: players, error: playersError }] =
    await Promise.all([
      supabase
        .from("teams")
        .select("id, room_id, team_index, name, color, icon, score")
        .eq("room_id", room.id)
        .order("team_index", { ascending: true })
        .returns<TeamRow[]>(),
      supabase
        .from("players")
        .select(
          "id, room_id, team_id, display_name, initials, avatar_url, join_order, status, is_connected, last_seen_at",
        )
        .eq("room_id", room.id)
        .order("join_order", { ascending: true })
        .returns<PlayerRow[]>(),
    ]);

  if (teamsError) {
    throw new Error(teamsError.message);
  }

  if (playersError) {
    throw new Error(playersError.message);
  }

  let gameData:
    | {
        round: RoundRow | null;
        question: QuestionRow | null;
        leaders: LeaderRow[];
        votes: VoteRow[];
        attempts: AttemptRow[];
        penalties: PenaltyRow[];
        assignmentChallenges: AssignmentChallengeRow[];
      }
    | undefined;

  if (room.current_round_number > 0) {
    const { data: round, error: roundError } = await supabase
      .from("rounds")
      .select("id, room_id, question_id, round_number, results")
      .eq("room_id", room.id)
      .eq("round_number", room.current_round_number)
      .maybeSingle<RoundRow>();

    if (roundError) {
      throw new Error(roundError.message);
    }

    if (round) {
      const [
        questionResult,
        leadersResult,
        votesResult,
        attemptsResult,
        penaltiesResult,
        assignmentsResult,
      ] = await Promise.all([
        round.question_id
          ? supabase
              .from("questions")
              .select("id, quote, answer_options")
              .eq("id", round.question_id)
              .maybeSingle<QuestionRow>()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("round_leaders")
          .select("team_id, player_id")
          .eq("round_id", round.id)
          .returns<LeaderRow[]>(),
        supabase
          .from("votes")
          .select("player_id")
          .eq("round_id", round.id)
          .returns<VoteRow[]>(),
        supabase
          .from("saving_grace_attempts")
          .select("team_id, category, answer, correct_answer, is_correct")
          .eq("round_id", round.id)
          .returns<AttemptRow[]>(),
        supabase
          .from("penalties")
          .select(
            "id, team_id, lamb_player_id, rescuer_player_id, consequence_choice, challenge_assignment_id, status, queue_index",
          )
          .eq("round_id", round.id)
          .order("queue_index", { ascending: true })
          .returns<PenaltyRow[]>(),
        supabase
          .from("challenge_assignments")
          .select(
            "id, target_team_id, challenges(title, instructions, duration_seconds, success_criteria)",
          )
          .eq("round_id", round.id),
      ]);

      for (const result of [
        questionResult,
        leadersResult,
        votesResult,
        attemptsResult,
        penaltiesResult,
        assignmentsResult,
      ]) {
        if (result.error) {
          throw new Error(result.error.message);
        }
      }

      gameData = {
        round,
        question: questionResult.data || null,
        leaders: leadersResult.data || [],
        votes: votesResult.data || [],
        attempts: attemptsResult.data || [],
        penalties: penaltiesResult.data || [],
        assignmentChallenges:
          (assignmentsResult.data as AssignmentChallengeRow[] | null) || [],
      };
    }
  }

  const { data: existingState, error: existingError } = await supabase
    .from("public_room_state")
    .select("version")
    .eq("room_id", room.id)
    .maybeSingle<{ version: number }>();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const nextVersion = (existingState?.version || 0) + 1;
  const state = buildPublicRoomState(
    room,
    teams || [],
    players || [],
    nextVersion,
    gameData,
  );

  const { error: upsertError } = await supabase.from("public_room_state").upsert(
    {
      room_id: room.id,
      room_code: room.room_code,
      state,
      version: nextVersion,
      updated_at: state.updatedAt,
    },
    { onConflict: "room_id" },
  );

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  return state;
}
