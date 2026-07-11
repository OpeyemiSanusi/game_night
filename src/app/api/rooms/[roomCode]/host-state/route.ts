import { getSupabaseAdmin } from "@/lib/supabase/server";
import { fail, ok } from "@/lib/server/http";
import { loadHostSavingGraceState } from "@/lib/server/host-saving-grace";
import { rebuildPublicRoomState } from "@/lib/server/room-state";
import { tokenHashesMatch } from "@/lib/server/tokens";
import { normalizeRoomCode } from "@/lib/validation";
import type { GamePhase, HostPrivateState } from "@/lib/types";

export const runtime = "nodejs";

interface RoomRow {
  id: string;
  room_code: string;
  title: string;
  phase: GamePhase;
  team_count: number;
  current_round_number: number;
  settings: Record<string, unknown>;
  host_token_hash: string;
}

function getNextAction(phase: GamePhase) {
  switch (phase) {
    case "LOBBY":
      return "Lock Teams";
    case "TEAM_SETUP":
      return "Start Game";
    case "CHALLENGE_SELECTION":
      return "Waiting for Player Selection";
    case "QUESTION_ACTIVE":
      return "Lock Voting";
    case "VOTING_LOCKED":
      return "Reveal Answer";
    case "ANSWER_REVEAL":
      return "Start Punishments";
    case "ROUND_DRAW":
      return "Next Round";
    case "SAVING_GRACE_CATEGORY":
      return "Start Saving Grace Answers";
    case "SAVING_GRACE_ACTIVE":
      return "Reveal Saving Grace";
    case "SAVING_GRACE_RESULT":
      return "Start Lamb Selection";
    case "SACRIFICIAL_LAMB_SELECTION":
      return "Reveal Sacrificial Lamb";
    case "SACRIFICIAL_LAMB_REVEAL":
      return "Start Consequence Choice";
    case "CONSEQUENCE_CHOICE":
      return "Start Penalty Queue";
    case "DRINK_CONFIRMATION":
      return "Confirm Drink";
    case "CHALLENGE_REVEAL":
      return "Start Challenge";
    case "CHALLENGE_ACTIVE":
      return "Challenge Passed";
    case "RESCUER_SELECTION":
      return "Start Bottle Flip";
    case "BOTTLE_FLIP_ACTIVE":
      return "Bottle Landed";
    case "PIE_CONFIRMATION":
      return "Confirm Pie";
    case "ROUND_COMPLETE":
      return "Next Round";
    case "FINAL_RESULTS":
      return "Game Complete";
    default:
      return "Lobby Setup";
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode: rawRoomCode } = await context.params;
  const roomCode = normalizeRoomCode(rawRoomCode);
  const token = request.headers.get("x-host-token");

  if (!roomCode) {
    return fail("Enter a valid room code.", 400);
  }

  if (!token) {
    return fail("Host token is required.", 401);
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;

  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Server is not configured.", 500);
  }

  const { data: room, error } = await supabase
    .from("rooms")
    .select(
      "id, room_code, title, phase, team_count, current_round_number, settings, host_token_hash",
    )
    .eq("room_code", roomCode)
    .maybeSingle<RoomRow>();

  if (error) {
    return fail(error.message, 500);
  }

  if (!room) {
    return fail("Room not found. Check the code and try again.", 404);
  }

  if (!tokenHashesMatch(token, room.host_token_hash)) {
    return fail("Host session is not valid for this room.", 401);
  }

  const publicState = await rebuildPublicRoomState(room.id);
  const [packsResult, decksResult, roundResult] = await Promise.all([
    supabase
      .from("question_packs")
      .select("id, name, enabled")
      .eq("enabled", true)
      .order("created_at", { ascending: false })
      .returns<Array<{ id: string; name: string; enabled: boolean }>>(),
    supabase
      .from("challenge_decks")
      .select("id, name, enabled")
      .eq("enabled", true)
      .order("created_at", { ascending: false })
      .returns<Array<{ id: string; name: string; enabled: boolean }>>(),
    room.current_round_number > 0
      ? supabase
          .from("rounds")
          .select("id, question_id")
          .eq("room_id", room.id)
          .eq("round_number", room.current_round_number)
          .maybeSingle<{ id: string; question_id: string | null }>()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (packsResult.error) {
    return fail(packsResult.error.message, 500);
  }

  if (decksResult.error) {
    return fail(decksResult.error.message, 500);
  }

  if (roundResult.error) {
    return fail(roundResult.error.message, 500);
  }

  let currentQuestion:
    | {
        id: string;
        quote: string;
        correctAnswerId: string;
        correctAnswerName: string;
        sentAt: string;
        reactionCount: number;
      }
    | undefined;

  if (roundResult.data?.question_id) {
    const { data: question, error: questionError } = await supabase
      .from("questions")
      .select(
        "id, quote, correct_answer_id, answer_options, sent_at, reaction_count",
      )
      .eq("id", roundResult.data.question_id)
      .maybeSingle<{
        id: string;
        quote: string;
        correct_answer_id: string;
        answer_options: Array<{ id: string; name: string }>;
        sent_at: string;
        reaction_count: number;
      }>();

    if (questionError) {
      return fail(questionError.message, 500);
    }

    if (question) {
      currentQuestion = {
        id: question.id,
        quote: question.quote,
        correctAnswerId: question.correct_answer_id,
        correctAnswerName:
          question.answer_options.find(
            (option) => option.id === question.correct_answer_id,
          )?.name || "Unknown",
        sentAt: question.sent_at,
        reactionCount: question.reaction_count,
      };
    }
  }

  const { data: assignments, error: assignmentsError } = roundResult.data?.id
    ? await supabase
        .from("challenge_assignments")
        .select("target_team_id, challenge_id, challenges(title)")
        .eq("round_id", roundResult.data.id)
    : { data: [], error: null };

  if (assignmentsError) {
    return fail(assignmentsError.message, 500);
  }

  const savingGrace = await loadHostSavingGraceState(supabase, room);

  const response: HostPrivateState = {
    room: {
      id: room.id,
      roomCode: room.room_code,
      title: room.title,
      phase: room.phase,
      teamCount: room.team_count,
      currentRoundNumber: room.current_round_number,
      settings: room.settings || {},
    },
    publicState,
    nextRecommendedAction: getNextAction(room.phase),
    game: {
      packs: packsResult.data || [],
      challengeDecks: decksResult.data || [],
      ...(currentQuestion ? { currentQuestion } : {}),
      hiddenChallenges:
        assignments?.map((assignment) => {
          const team = publicState.teams.find(
            (item) => item.id === assignment.target_team_id,
          );
          const challenge = assignment.challenges as { title?: string } | null;

          return {
            teamId: assignment.target_team_id,
            teamName: team?.name || "Team",
            challengeTitle: challenge?.title || null,
            selected: Boolean(assignment.challenge_id),
          };
        }) || [],
      savingGrace,
    },
  };

  return ok(response);
}
