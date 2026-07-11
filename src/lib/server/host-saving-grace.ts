import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import {
  answerOptionId,
  hydrateAnswerOptions,
} from "@/lib/server/questions";
import { timeOfDayBucket } from "@/lib/server/game-utils";
import type {
  AnswerOption,
  GamePhase,
  HostSavingGraceAttemptPublic,
  HostSavingGraceCategory,
  HostSavingGraceHostState,
} from "@/lib/types";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdmin>;

interface HostSavingGraceRoom {
  id: string;
  phase: GamePhase;
  current_round_number: number;
}

interface RoundRow {
  id: string;
  question_id: string | null;
}

interface PenaltyTeamRow {
  id: string;
  team_id: string;
  teams: { name: string } | null;
}

interface QuestionPromptRow {
  sent_at: string;
  time_of_day: string | null;
  next_sender_options: AnswerOption[];
  correct_next_sender_id: string | null;
}

interface AttemptRow {
  category: HostSavingGraceCategory | "REACTION_COUNT" | null;
  prompt: string | null;
  options: AnswerOption[] | null;
  answer: string | null;
  correct_answer: string | null;
  is_correct: boolean | null;
}

const HOST_SAVING_GRACE_PHASES: GamePhase[] = [
  "DRINK_CONFIRMATION",
  "CHALLENGE_REVEAL",
  "CHALLENGE_ACTIVE",
  "BOTTLE_FLIP_ACTIVE",
  "PIE_CONFIRMATION",
];

const HOST_CATEGORIES: HostSavingGraceCategory[] = [
  "TIME_OF_DAY",
  "NEXT_SENDER",
];

export function isHostSavingGraceCategory(
  value: unknown,
): value is HostSavingGraceCategory {
  return value === "TIME_OF_DAY" || value === "NEXT_SENDER";
}

function isHostSavingGracePhase(phase: GamePhase) {
  return HOST_SAVING_GRACE_PHASES.includes(phase);
}

function timeOption(label: string): AnswerOption {
  return {
    id: answerOptionId(label),
    name: label,
    avatarUrl: null,
  };
}

function asHostAttempt(attempt: AttemptRow | null): HostSavingGraceAttemptPublic | null {
  if (
    !attempt?.category ||
    !HOST_CATEGORIES.includes(attempt.category as HostSavingGraceCategory) ||
    !attempt.prompt ||
    !Array.isArray(attempt.options)
  ) {
    return null;
  }

  return {
    category: attempt.category as HostSavingGraceCategory,
    prompt: attempt.prompt,
    options: attempt.options,
    answer: attempt.answer,
    correctAnswer: attempt.correct_answer,
    isCorrect: attempt.is_correct,
  };
}

async function loadCurrentRound(
  supabase: SupabaseAdmin,
  room: HostSavingGraceRoom,
) {
  if (room.current_round_number < 1) {
    return null;
  }

  const { data, error } = await supabase
    .from("rounds")
    .select("id, question_id")
    .eq("room_id", room.id)
    .eq("round_number", room.current_round_number)
    .maybeSingle<RoundRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data || null;
}

async function loadActivePenalty(supabase: SupabaseAdmin, roundId: string) {
  const { data, error } = await supabase
    .from("penalties")
    .select("id, team_id, teams(name)")
    .eq("round_id", roundId)
    .neq("status", "complete")
    .neq("status", "selection")
    .order("queue_index", { ascending: true })
    .limit(1)
    .maybeSingle<PenaltyTeamRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data || null;
}

async function readBalance(
  supabase: SupabaseAdmin,
  roomId: string,
  teamId: string,
) {
  const { data, error } = await supabase
    .from("team_saving_grace_balances")
    .select("remaining_uses")
    .eq("room_id", roomId)
    .eq("team_id", teamId)
    .maybeSingle<{ remaining_uses: number }>();

  if (error) {
    throw new Error(error.message);
  }

  return data?.remaining_uses ?? 3;
}

async function ensureBalance(
  supabase: SupabaseAdmin,
  roomId: string,
  teamId: string,
) {
  const { error } = await supabase
    .from("team_saving_grace_balances")
    .upsert(
      {
        room_id: roomId,
        team_id: teamId,
        remaining_uses: 3,
      },
      {
        onConflict: "room_id,team_id",
        ignoreDuplicates: true,
      },
    );

  if (error) {
    throw new Error(error.message);
  }

  return readBalance(supabase, roomId, teamId);
}

async function loadAttempt(
  supabase: SupabaseAdmin,
  roundId: string,
  teamId: string,
) {
  const { data, error } = await supabase
    .from("saving_grace_attempts")
    .select("category, prompt, options, answer, correct_answer, is_correct")
    .eq("round_id", roundId)
    .eq("team_id", teamId)
    .maybeSingle<AttemptRow>();

  if (error) {
    throw new Error(error.message);
  }

  return data || null;
}

async function buildPrompt(
  supabase: SupabaseAdmin,
  category: HostSavingGraceCategory,
  question: QuestionPromptRow,
) {
  if (category === "TIME_OF_DAY") {
    const correctAnswer = question.time_of_day || timeOfDayBucket(question.sent_at);

    return {
      prompt: "When was this message sent?",
      options: ["Morning", "Afternoon", "Night"].map(timeOption),
      correctAnswer,
    };
  }

  const options = await hydrateAnswerOptions(
    supabase,
    question.next_sender_options,
  );
  const correct = options.find(
    (option) => option.id === question.correct_next_sender_id,
  );

  if (!correct) {
    throw new Error("This question is missing its next-sender answer.");
  }

  return {
    prompt: "Who texted next?",
    options,
    correctAnswer: correct.name,
  };
}

export async function loadHostSavingGraceState(
  supabase: SupabaseAdmin,
  room: HostSavingGraceRoom,
): Promise<HostSavingGraceHostState | null> {
  if (!isHostSavingGracePhase(room.phase)) {
    return null;
  }

  const round = await loadCurrentRound(supabase, room);

  if (!round) {
    return null;
  }

  const penalty = await loadActivePenalty(supabase, round.id);

  if (!penalty) {
    return null;
  }

  const [remaining, attempt] = await Promise.all([
    readBalance(supabase, room.id, penalty.team_id),
    loadAttempt(supabase, round.id, penalty.team_id),
  ]);

  return {
    teamId: penalty.team_id,
    teamName: penalty.teams?.name || "Team",
    remaining,
    activeAttempt: asHostAttempt(attempt),
  };
}

export async function startHostSavingGraceAttempt(
  supabase: SupabaseAdmin,
  room: HostSavingGraceRoom,
  category: HostSavingGraceCategory,
) {
  if (!isHostSavingGracePhase(room.phase)) {
    throw new Error("Saving Grace is only available during an active punishment.");
  }

  const round = await loadCurrentRound(supabase, room);

  if (!round?.question_id) {
    throw new Error("No active question was found for this round.");
  }

  const penalty = await loadActivePenalty(supabase, round.id);

  if (!penalty) {
    throw new Error("No active punishment was found.");
  }

  const existingAttempt = await loadAttempt(supabase, round.id, penalty.team_id);

  if (asHostAttempt(existingAttempt)) {
    return loadHostSavingGraceState(supabase, room);
  }

  const remaining = await ensureBalance(supabase, room.id, penalty.team_id);

  if (remaining <= 0) {
    throw new Error("This team has no Saving Grace uses left.");
  }

  const { data: question, error: questionError } = await supabase
    .from("questions")
    .select("sent_at, time_of_day, next_sender_options, correct_next_sender_id")
    .eq("id", round.question_id)
    .single<QuestionPromptRow>();

  if (questionError || !question) {
    throw new Error(questionError?.message || "Question not found.");
  }

  const prompt = await buildPrompt(supabase, category, question);

  const { error: attemptError } = await supabase
    .from("saving_grace_attempts")
    .upsert(
      {
        room_id: room.id,
        round_id: round.id,
        team_id: penalty.team_id,
        category,
        prompt: prompt.prompt,
        options: prompt.options,
        correct_answer: prompt.correctAnswer,
        answer: null,
        is_correct: null,
        category_selected_at: new Date().toISOString(),
        answered_at: null,
      },
      { onConflict: "round_id,team_id" },
    );

  if (attemptError) {
    throw new Error(attemptError.message);
  }

  const { error: balanceError } = await supabase
    .from("team_saving_grace_balances")
    .update({
      remaining_uses: remaining - 1,
      updated_at: new Date().toISOString(),
    })
    .eq("room_id", room.id)
    .eq("team_id", penalty.team_id);

  if (balanceError) {
    throw new Error(balanceError.message);
  }

  return loadHostSavingGraceState(supabase, room);
}

export async function submitHostSavingGraceAnswer(
  supabase: SupabaseAdmin,
  room: HostSavingGraceRoom,
  answer: string,
) {
  if (!isHostSavingGracePhase(room.phase)) {
    throw new Error("Saving Grace is only available during an active punishment.");
  }

  const round = await loadCurrentRound(supabase, room);

  if (!round) {
    throw new Error("No active round.");
  }

  const penalty = await loadActivePenalty(supabase, round.id);

  if (!penalty) {
    throw new Error("No active punishment was found.");
  }

  const attempt = await loadAttempt(supabase, round.id, penalty.team_id);

  if (!attempt?.correct_answer) {
    throw new Error("Choose a Saving Grace category first.");
  }

  const cleanedAnswer = answer.trim();
  const isCorrect =
    cleanedAnswer.toLowerCase() === attempt.correct_answer.trim().toLowerCase();

  const { error } = await supabase
    .from("saving_grace_attempts")
    .update({
      answer: cleanedAnswer,
      is_correct: isCorrect,
      answered_at: new Date().toISOString(),
    })
    .eq("round_id", round.id)
    .eq("team_id", penalty.team_id);

  if (error) {
    throw new Error(error.message);
  }

  return loadHostSavingGraceState(supabase, room);
}
