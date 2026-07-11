import { getSupabaseAdmin } from "@/lib/supabase/server";
import { fail, ok } from "@/lib/server/http";
import { rebuildPublicRoomState, toPlayerPublic } from "@/lib/server/room-state";
import { hashToken } from "@/lib/server/tokens";
import {
  consequenceQuotas,
  readSettings,
  savingGracePrompt,
} from "@/lib/server/game-utils";
import { hydrateAnswerOptions } from "@/lib/server/questions";
import { normalizeRoomCode } from "@/lib/validation";
import type {
  AnswerOption,
  ConsequenceChoice,
  GamePhase,
  PlayerPrivateState,
  PlayerStatus,
  PublicRoomState,
  SavingGraceCategory,
} from "@/lib/types";

export const runtime = "nodejs";

function countPlayerConsequenceUsage(
  penalties: Array<{ payload: Record<string, unknown> | null }>,
  playerId: string,
) {
  const counts: Record<ConsequenceChoice, number> = {
    DRINK: 0,
    FLIP: 0,
    CHALLENGE: 0,
  };

  for (const penalty of penalties) {
    const choices =
      penalty.payload &&
      typeof penalty.payload.consequenceChoices === "object" &&
      !Array.isArray(penalty.payload.consequenceChoices)
        ? (penalty.payload.consequenceChoices as Record<string, unknown>)
        : {};
    const choice = choices[playerId];

    if (choice === "DRINK" || choice === "FLIP" || choice === "CHALLENGE") {
      counts[choice] += 1;
    }
  }

  return counts;
}

interface RoomRow {
  id: string;
  room_code: string;
  title: string;
  phase: GamePhase;
  team_count: number;
  current_round_number: number;
  settings: Record<string, unknown>;
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

export async function GET(
  request: Request,
  context: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode: rawRoomCode } = await context.params;
  const roomCode = normalizeRoomCode(rawRoomCode);
  const token = request.headers.get("x-player-token");

  if (!roomCode) {
    return fail("Enter a valid room code.", 400);
  }

  if (!token) {
    return fail("Player token is required.", 401);
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;

  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Server is not configured.", 500);
  }

  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, room_code, title, phase, team_count, current_round_number, settings")
    .eq("room_code", roomCode)
    .maybeSingle<RoomRow>();

  if (roomError) {
    return fail(roomError.message, 500);
  }

  if (!room) {
    return fail("Room not found. Check the code and try again.", 404);
  }

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select(
      "id, room_id, team_id, display_name, initials, avatar_url, join_order, status, is_connected, last_seen_at",
    )
    .eq("room_id", room.id)
    .eq("token_hash", hashToken(token))
    .maybeSingle<PlayerRow>();

  if (playerError) {
    return fail(playerError.message, 500);
  }

  if (!player) {
    return fail("Player session was not found for this room.", 401);
  }

  const now = new Date().toISOString();
  await supabase
    .from("players")
    .update({ is_connected: true, last_seen_at: now })
    .eq("id", player.id);

  player.is_connected = true;
  player.last_seen_at = now;

  const { data: publicStateRow } = await supabase
    .from("public_room_state")
    .select("state")
    .eq("room_id", room.id)
    .maybeSingle<{ state: PublicRoomState }>();
  const publicState = publicStateRow?.state || (await rebuildPublicRoomState(room.id));
  const playerPublic = toPlayerPublic(player);
  const team = publicState.teams.find((item) => item.id === player.team_id) || null;
  const actions: NonNullable<PlayerPrivateState["actions"]> = {};
  let role: PlayerPrivateState["role"] = "player";
  let myVote: string | null = null;

  const { data: round } =
    room.phase !== "LOBBY" && room.phase !== "TEAM_SETUP"
      ? await supabase
          .from("rounds")
          .select("id, question_id, round_number")
          .eq("room_id", room.id)
          .eq("round_number", room.current_round_number)
          .maybeSingle<{ id: string; question_id: string | null; round_number: number }>()
      : { data: null };

  const { data: leader } =
    round && player.team_id
      ? await supabase
          .from("round_leaders")
          .select("id")
          .eq("round_id", round.id)
          .eq("team_id", player.team_id)
          .eq("player_id", player.id)
          .maybeSingle<{ id: string }>()
      : { data: null };

  if (leader) {
    role = "leader";
  }

  if (round?.question_id && ["QUESTION_ACTIVE", "VOTING_LOCKED"].includes(room.phase)) {
    const [{ data: question }, { data: vote }] = await Promise.all([
      supabase
        .from("questions")
        .select("answer_options")
        .eq("id", round.question_id)
        .maybeSingle<{ answer_options: AnswerOption[] }>(),
      supabase
        .from("votes")
        .select("answer_id")
        .eq("round_id", round.id)
        .eq("player_id", player.id)
        .maybeSingle<{ answer_id: string }>(),
    ]);

    actions.canVote = room.phase === "QUESTION_ACTIVE";
    actions.answerOptions = question
      ? await hydrateAnswerOptions(supabase, question.answer_options)
      : [];
    myVote = vote?.answer_id || null;
  }

  if (leader && room.phase === "CHALLENGE_SELECTION" && player.team_id && round) {
    const [{ data: assignment }, { data: penalty }] = await Promise.all([
      supabase
        .from("challenge_assignments")
        .select("id, challenge_id, options")
        .eq("round_id", round.id)
        .eq("chooser_team_id", player.team_id)
        .maybeSingle<{
          id: string;
          challenge_id: string | null;
          options: Array<{
            id: string;
            title: string;
            instructions: string;
            durationSeconds: number;
            successCriteria: string;
          }>;
        }>(),
      supabase
        .from("penalties")
        .select("lamb_player_id")
        .eq("round_id", round.id)
        .eq("team_id", player.team_id)
        .maybeSingle<{ lamb_player_id: string | null }>(),
    ]);

    const leaderId = player.id;
    const nonLeaderPlayers =
      team?.players.filter(
        (candidate) =>
          candidate.status === "active" && candidate.id !== leaderId,
      ) || [];
    actions.lambOptions = nonLeaderPlayers;
    actions.selectedLambPlayerId = penalty?.lamb_player_id || null;
    actions.selectedChallengeId = assignment?.challenge_id || null;
    actions.leaderChallengeOptions =
      assignment && !assignment.challenge_id
        ? assignment.options.map((option) => ({
            assignmentId: assignment.id,
            challengeId: option.id,
            title: option.title,
            instructions: option.instructions,
            durationSeconds: option.durationSeconds,
            successCriteria: option.successCriteria,
        }))
        : [];
  }

  if (!leader && room.phase === "CHALLENGE_SELECTION" && player.team_id && round) {
    const [{ data: penalty }, { data: roomPenalties }] = await Promise.all([
      supabase
        .from("penalties")
        .select("payload")
        .eq("round_id", round.id)
        .eq("team_id", player.team_id)
        .maybeSingle<{ payload: Record<string, unknown> | null }>(),
      supabase
        .from("penalties")
        .select("payload")
        .eq("room_id", room.id)
        .returns<Array<{ payload: Record<string, unknown> | null }>>(),
    ]);
    const consequenceChoices =
      penalty?.payload &&
      typeof penalty.payload.consequenceChoices === "object" &&
      !Array.isArray(penalty.payload.consequenceChoices)
        ? (penalty.payload.consequenceChoices as Record<string, unknown>)
        : {};
    const myChoice = consequenceChoices[player.id];
    const usage = countPlayerConsequenceUsage(roomPenalties || [], player.id);
    const quotas = consequenceQuotas(readSettings(room.settings).rounds);

    actions.consequenceOptions = ["DRINK", "FLIP", "CHALLENGE"];
    actions.consequenceRemaining = {
      DRINK: Math.max(0, quotas.DRINK - usage.DRINK),
      FLIP: Math.max(0, quotas.FLIP - usage.FLIP),
      CHALLENGE: Math.max(0, quotas.CHALLENGE - usage.CHALLENGE),
    };
    actions.myConsequenceChoice =
      myChoice === "DRINK" || myChoice === "FLIP" || myChoice === "CHALLENGE"
        ? (myChoice as ConsequenceChoice)
        : null;
  }

  if (leader && room.phase === "SAVING_GRACE_CATEGORY") {
    actions.savingGraceCategories = [
      "TIME_OF_DAY",
      "NEXT_SENDER",
      "REACTION_COUNT",
    ];
  }

  if (leader && room.phase === "SAVING_GRACE_ACTIVE" && player.team_id && round) {
    const [{ data: attempt }, { data: question }] = await Promise.all([
      supabase
        .from("saving_grace_attempts")
        .select("category")
        .eq("round_id", round.id)
        .eq("team_id", player.team_id)
        .maybeSingle<{ category: SavingGraceCategory | null }>(),
      round.question_id
        ? supabase
            .from("questions")
            .select(
              "sent_at, time_of_day, next_sender_options, correct_next_sender_id, reaction_count",
            )
            .eq("id", round.question_id)
            .maybeSingle<{
              sent_at: string;
              time_of_day: string | null;
              next_sender_options: AnswerOption[];
              correct_next_sender_id: string | null;
              reaction_count: number;
            }>()
        : Promise.resolve({ data: null }),
    ]);

    if (attempt?.category && question) {
      const prompt = savingGracePrompt(attempt.category, question);
      actions.savingGraceQuestion = {
        category: attempt.category,
        prompt: prompt.prompt,
        options: prompt.options,
      };
    }
  }

  if (leader && room.phase === "SACRIFICIAL_LAMB_SELECTION" && team) {
    actions.lambOptions = team.players.filter(
      (candidate) => candidate.status === "active" && candidate.id !== player.id,
    );
  }

  if (round) {
    const { data: penalty } = await supabase
      .from("penalties")
      .select("id, lamb_player_id, status, team_id")
      .eq("round_id", round.id)
      .or(`lamb_player_id.eq.${player.id},rescuer_player_id.eq.${player.id}`)
      .order("queue_index", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string; lamb_player_id: string | null; status: string; team_id: string }>();

    if (penalty?.lamb_player_id === player.id) {
      role = "lamb";
    }

    if (
      room.phase === "CONSEQUENCE_CHOICE" &&
      penalty?.lamb_player_id === player.id
    ) {
      actions.consequenceOptions = ["DRINK", "FLIP", "CHALLENGE"];
    }

    if (
      room.phase === "RESCUER_SELECTION" &&
      penalty?.lamb_player_id === player.id &&
      team
    ) {
      actions.rescuerOptions = team.players.filter(
        (candidate) => candidate.status === "active" && candidate.id !== player.id,
      );
    }
  }

  const response: PlayerPrivateState & { publicState: PublicRoomState } = {
    room: {
      id: room.id,
      roomCode: room.room_code,
      title: room.title,
      phase: room.phase,
      teamCount: room.team_count,
    },
    player: playerPublic,
    team,
    role,
    message:
      player.status === "pending"
        ? "You joined after the game started. Wait for the host to approve you."
        : "You are connected.",
    myVote,
    actions,
    publicState,
  };

  return ok(response);
}
