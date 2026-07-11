import "server-only";

import { randomInt } from "crypto";
import { DEFAULT_ROOM_SETTINGS } from "@/lib/config";
import type {
  AnswerOption,
  ConsequenceChoice,
  GamePhase,
  SavingGraceCategory,
  TeamScoreResult,
} from "@/lib/types";

export interface Settings {
  rounds: number;
  questionTimerSeconds: number;
  challengeSelectionSeconds: number;
  savingGraceCategorySeconds: number;
  savingGraceAnswerSeconds: number;
  lambSelectionSeconds: number;
  consequenceChoiceSeconds: number;
  bottleFlipSeconds: number;
  selectedQuestionPackId?: string;
  selectedChallengeDeckId?: string;
}

export interface TeamRow {
  id: string;
  team_index: number;
  name: string;
  color: string;
  score: number;
}

export interface PlayerRow {
  id: string;
  team_id: string | null;
  display_name: string;
  initials: string;
  avatar_url: string | null;
  join_order: number;
  status: string;
}

export interface VoteRow {
  player_id: string;
  answer_id: string;
}

export function readSettings(value: Record<string, unknown> | null | undefined): Settings {
  const settings = value || {};

  return {
    rounds: Number(settings.rounds) || DEFAULT_ROOM_SETTINGS.rounds,
    questionTimerSeconds:
      Number(settings.questionTimerSeconds) ||
      DEFAULT_ROOM_SETTINGS.questionTimerSeconds,
    challengeSelectionSeconds:
      Number(settings.challengeSelectionSeconds) ||
      DEFAULT_ROOM_SETTINGS.challengeSelectionSeconds,
    savingGraceCategorySeconds:
      Number(settings.savingGraceCategorySeconds) ||
      DEFAULT_ROOM_SETTINGS.savingGraceCategorySeconds,
    savingGraceAnswerSeconds:
      Number(settings.savingGraceAnswerSeconds) ||
      DEFAULT_ROOM_SETTINGS.savingGraceAnswerSeconds,
    lambSelectionSeconds:
      Number(settings.lambSelectionSeconds) ||
      DEFAULT_ROOM_SETTINGS.lambSelectionSeconds,
    consequenceChoiceSeconds:
      Number(settings.consequenceChoiceSeconds) ||
      DEFAULT_ROOM_SETTINGS.consequenceChoiceSeconds,
    bottleFlipSeconds:
      Number(settings.bottleFlipSeconds) ||
      DEFAULT_ROOM_SETTINGS.bottleFlipSeconds,
    selectedQuestionPackId:
      typeof settings.selectedQuestionPackId === "string"
        ? settings.selectedQuestionPackId
        : undefined,
    selectedChallengeDeckId:
      typeof settings.selectedChallengeDeckId === "string"
        ? settings.selectedChallengeDeckId
        : undefined,
  };
}

export function deadlineFromNow(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function isAfterDeadline(deadline: string | null) {
  return Boolean(deadline && Date.now() > Date.parse(deadline));
}

export function phaseUpdate(phase: GamePhase, durationSeconds?: number) {
  return {
    phase,
    phase_started_at: new Date().toISOString(),
    phase_ends_at: durationSeconds ? deadlineFromNow(durationSeconds) : null,
    is_paused: false,
    remaining_ms_when_paused: null,
    updated_at: new Date().toISOString(),
  };
}

export function randomItem<T>(items: T[]) {
  if (items.length === 0) {
    throw new Error("Cannot choose from an empty list.");
  }

  return items[randomInt(items.length)];
}

export function randomSample<T>(items: T[], count: number) {
  const remaining = [...items];
  const selected: T[] = [];

  while (selected.length < count && remaining.length > 0) {
    const index = randomInt(remaining.length);
    const [item] = remaining.splice(index, 1);
    selected.push(item);
  }

  return selected;
}

export function consequenceQuotas(rounds: number): Record<ConsequenceChoice, number> {
  const safeRounds = Math.max(1, Math.floor(rounds));
  const base = Math.floor(safeRounds / 3);
  const remainder = safeRounds % 3;

  return {
    CHALLENGE: base + (remainder >= 1 ? 1 : 0),
    DRINK: base + (remainder >= 2 ? 1 : 0),
    FLIP: base,
  };
}

export function computeTeamScores(
  teams: TeamRow[],
  players: PlayerRow[],
  votes: VoteRow[],
  correctAnswerId: string,
) {
  const activePlayers = players.filter(
    (player) => player.status === "active" && player.team_id,
  );
  const voteByPlayerId = new Map(votes.map((vote) => [vote.player_id, vote]));
  const scoreRows = teams.map((team) => {
    const eligible = activePlayers.filter((player) => player.team_id === team.id);
    const correctVotes = eligible.filter(
      (player) => voteByPlayerId.get(player.id)?.answer_id === correctAnswerId,
    ).length;
    const accuracy = eligible.length > 0 ? correctVotes / eligible.length : 0;

    return {
      teamId: team.id,
      teamIndex: team.team_index,
      name: team.name,
      color: team.color,
      correctVotes,
      eligiblePlayers: eligible.length,
      accuracy,
      outcome: "safe" as TeamScoreResult["outcome"],
    };
  });

  const accuracies = scoreRows.map((score) => score.accuracy);
  const highest = Math.max(...accuracies);
  const lowest = Math.min(...accuracies);
  const completeDraw = scoreRows.every((score) => score.accuracy === highest);

  const teamsWithOutcomes = scoreRows.map((score) => {
    if (completeDraw) {
      return { ...score, outcome: "draw" as const };
    }

    if (score.accuracy === highest) {
      return { ...score, outcome: "winner" as const };
    }

    if (score.accuracy === lowest) {
      return { ...score, outcome: "last" as const };
    }

    return score;
  });

  return {
    teams: teamsWithOutcomes,
    winnerTeamIds: completeDraw
      ? []
      : teamsWithOutcomes
          .filter((score) => score.outcome === "winner")
          .map((score) => score.teamId),
    lastPlaceTeamIds: completeDraw
      ? []
      : teamsWithOutcomes
          .filter((score) => score.outcome === "last")
          .map((score) => score.teamId),
    safeTeamIds: completeDraw
      ? []
      : teamsWithOutcomes
          .filter((score) => score.outcome === "safe")
          .map((score) => score.teamId),
    completeDraw,
  };
}

export function timeOfDayBucket(sentAt: string) {
  const hour = new Date(sentAt).getHours();

  if (hour >= 5 && hour < 12) {
    return "Morning";
  }

  if (hour >= 12 && hour < 18) {
    return "Afternoon";
  }

  return "Night";
}

export function reactionBucket(reactionCount: number) {
  if (reactionCount <= 0) {
    return "No reactions";
  }

  if (reactionCount <= 2) {
    return "One or two";
  }

  return "Three or more";
}

export function savingGracePrompt(
  category: SavingGraceCategory,
  question: {
    sent_at: string;
    next_sender_options: AnswerOption[];
    correct_next_sender_id: string | null;
    reaction_count: number;
  },
) {
  switch (category) {
    case "TIME_OF_DAY":
      return {
        prompt: "When was this message sent?",
        options: ["Morning", "Afternoon", "Night"],
        correctAnswer: timeOfDayBucket(question.sent_at),
      };
    case "NEXT_SENDER": {
      const correct = question.next_sender_options.find(
        (option) => option.id === question.correct_next_sender_id,
      );

      return {
        prompt: "Who sent the next message?",
        options: question.next_sender_options.map((option) => option.name),
        correctAnswer: correct?.name || "",
      };
    }
    case "REACTION_COUNT":
      return {
        prompt: "How many reactions did this message receive?",
        options: ["No reactions", "One or two", "Three or more"],
        correctAnswer: reactionBucket(question.reaction_count),
      };
  }
}
