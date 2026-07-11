import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import type { AnswerOption } from "@/lib/types";

export const ANSWER_OPTION_AVATAR_BUCKET = "answer-option-avatars";

export interface QuestionImportInput {
  quote: unknown;
  sentAt: unknown;
  timeOfDay?: unknown;
  answerOptions: unknown;
  correctAnswerId: unknown;
  nextSenderOptions: unknown;
  correctNextSenderId: unknown;
  reactionCount: unknown;
  category?: unknown;
  difficulty?: unknown;
  hostNote?: unknown;
}

export interface QuestionPackImportInput {
  name?: unknown;
  description?: unknown;
  questions?: unknown;
}

export interface NormalizedQuestionImport {
  quote: string;
  sentAt: string;
  timeOfDay: string | null;
  answerOptions: AnswerOption[];
  correctAnswerId: string;
  nextSenderOptions: AnswerOption[];
  correctNextSenderId: string;
  reactionCount: number;
  category: string | null;
  difficulty: number | null;
  hostNote: string | null;
}

export interface NormalizedPackImport {
  name: string;
  description: string | null;
  questions: NormalizedQuestionImport[];
}

function cleanString(value: unknown, maxLength = 5000) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function cleanTimeOfDay(value: unknown) {
  const cleaned = cleanString(value, 20);

  return cleaned === "Morning" || cleaned === "Afternoon" || cleaned === "Night"
    ? cleaned
    : null;
}

export function answerOptionId(label: string) {
  const id = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return id || "option";
}

export async function hydrateAnswerOptions(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  options: AnswerOption[],
) {
  const labels = [...new Set(options.map((option) => option.name).filter(Boolean))];

  if (labels.length === 0) {
    return options;
  }

  const { data, error } = await supabase
    .from("answer_option_people")
    .select("label, avatar_path")
    .in("label", labels)
    .returns<Array<{ label: string; avatar_path: string | null }>>();

  if (error || !data) {
    return options;
  }

  const avatarPathByLabel = new Map(
    data
      .filter((person) => person.avatar_path)
      .map((person) => [person.label, person.avatar_path as string]),
  );

  return options.map((option) => {
    if (option.avatarUrl) {
      return option;
    }

    const avatarPath = avatarPathByLabel.get(option.name);

    if (!avatarPath) {
      return option;
    }

    const { data: publicUrl } = supabase.storage
      .from(ANSWER_OPTION_AVATAR_BUCKET)
      .getPublicUrl(avatarPath);

    return {
      ...option,
      avatarUrl: publicUrl.publicUrl,
    };
  });
}

function normalizeOptions(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length < 3 || value.length > 4) {
    throw new Error(`${label} must contain 3 or 4 options.`);
  }

  const seen = new Set<string>();

  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${label}[${index}] must be an object.`);
    }

    const record = item as Record<string, unknown>;
    const id = cleanString(record.id, 120);
    const name = cleanString(record.name, 120);

    if (!id || !name) {
      throw new Error(`${label}[${index}] needs id and name.`);
    }

    if (seen.has(id)) {
      throw new Error(`${label} contains duplicate id "${id}".`);
    }

    seen.add(id);

    return {
      id,
      name,
      avatarUrl:
        typeof record.avatarUrl === "string" && record.avatarUrl.trim()
          ? record.avatarUrl.trim()
          : null,
    };
  });
}

export function normalizeQuestionPackImport(
  input: unknown,
): NormalizedPackImport {
  const root =
    Array.isArray(input) ? { questions: input, name: "Imported Pack" } : input;

  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new Error("Import must be an array of questions or an object.");
  }

  const record = root as QuestionPackImportInput;
  const rawQuestions = record.questions;

  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new Error("Import must include at least one question.");
  }

  const questions = rawQuestions.map((rawQuestion, index) => {
    if (!rawQuestion || typeof rawQuestion !== "object" || Array.isArray(rawQuestion)) {
      throw new Error(`Question ${index + 1} must be an object.`);
    }

    const question = rawQuestion as QuestionImportInput;
    const quote = cleanString(question.quote);
    const sentAtRaw = cleanString(question.sentAt, 80);
    const timeOfDay = cleanTimeOfDay(question.timeOfDay);
    const correctAnswerId = cleanString(question.correctAnswerId, 120);
    const correctNextSenderId = cleanString(question.correctNextSenderId, 120);
    const reactionCount = Number(question.reactionCount);
    const answerOptions = normalizeOptions(question.answerOptions, "answerOptions");
    const nextSenderOptions = normalizeOptions(
      question.nextSenderOptions,
      "nextSenderOptions",
    );

    if (!quote) {
      throw new Error(`Question ${index + 1} needs a non-empty quote.`);
    }

    if (!sentAtRaw || Number.isNaN(Date.parse(sentAtRaw))) {
      throw new Error(`Question ${index + 1} needs a valid sentAt timestamp.`);
    }

    if (!correctAnswerId || !answerOptions.some((option) => option.id === correctAnswerId)) {
      throw new Error(`Question ${index + 1} correctAnswerId must match an answer option.`);
    }

    if (
      !correctNextSenderId ||
      !nextSenderOptions.some((option) => option.id === correctNextSenderId)
    ) {
      throw new Error(
        `Question ${index + 1} correctNextSenderId must match a next-sender option.`,
      );
    }

    if (!Number.isInteger(reactionCount) || reactionCount < 0) {
      throw new Error(`Question ${index + 1} reactionCount must be 0 or more.`);
    }

    const difficulty = question.difficulty == null ? null : Number(question.difficulty);

    return {
      quote,
      sentAt: new Date(sentAtRaw).toISOString(),
      timeOfDay,
      answerOptions,
      correctAnswerId,
      nextSenderOptions,
      correctNextSenderId,
      reactionCount,
      category: cleanString(question.category, 120),
      difficulty:
        difficulty && Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5
          ? difficulty
          : null,
      hostNote: cleanString(question.hostNote, 1000),
    };
  });

  return {
    name: cleanString(record.name, 120) || "Imported Pack",
    description: cleanString(record.description, 500),
    questions,
  };
}
