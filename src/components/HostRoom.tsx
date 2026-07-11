"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { hostTokenKey, readStoredToken } from "@/lib/client-storage";
import { usePublicRoomState } from "@/lib/use-public-room-state";
import { useSyncedTimer } from "@/lib/use-synced-timer";
import { Avatar } from "@/components/Avatar";
import { RoomStatusHeader } from "@/components/RoomStatusHeader";
import { TeamGrid } from "@/components/TeamGrid";
import { StateBadge } from "@/components/StateBadge";
import type {
  AnswerOption,
  HostAction,
  HostPrivateState,
  HostSavingGraceCategory,
  HostSavingGraceHostState,
  PublicRoomState,
} from "@/lib/types";

interface HostRoomProps {
  roomCode: string;
  view?: "host" | "setup";
}

interface HostStateResponse extends Partial<HostPrivateState> {
  error?: string;
}

const PHASE_ACTIONS: Partial<Record<PublicRoomState["phase"], HostAction[]>> = {
  LOBBY: ["LOCK_TEAMS"],
  TEAM_SETUP: ["START_GAME"],
  CHALLENGE_SELECTION: ["SHOW_QUESTION"],
  QUESTION_ACTIVE: ["LOCK_VOTING"],
  VOTING_LOCKED: ["REVEAL_ANSWER"],
  ANSWER_REVEAL: ["START_PENALTY_QUEUE"],
  ROUND_DRAW: ["NEXT_ROUND"],
  SAVING_GRACE_CATEGORY: ["START_SAVING_GRACE_ACTIVE"],
  SAVING_GRACE_ACTIVE: ["REVEAL_SAVING_GRACE"],
  SAVING_GRACE_RESULT: ["START_LAMB_SELECTION", "NEXT_ROUND"],
  SACRIFICIAL_LAMB_SELECTION: ["REVEAL_SACRIFICIAL_LAMB"],
  SACRIFICIAL_LAMB_REVEAL: ["START_CONSEQUENCE_CHOICE"],
  CONSEQUENCE_CHOICE: ["START_PENALTY_QUEUE"],
  DRINK_CONFIRMATION: ["CONFIRM_DRINK"],
  CHALLENGE_REVEAL: ["START_CHALLENGE"],
  CHALLENGE_ACTIVE: ["CHALLENGE_PASSED", "CHALLENGE_FAILED"],
  RESCUER_SELECTION: ["START_BOTTLE_FLIP"],
  BOTTLE_FLIP_ACTIVE: ["BOTTLE_LANDED", "BOTTLE_MISSED"],
  PIE_CONFIRMATION: ["CONFIRM_PIE"],
  ROUND_COMPLETE: ["NEXT_ROUND", "END_GAME"],
};

const consequenceLabels = {
  DRINK: "Drink",
  FLIP: "Flip",
  CHALLENGE: "Challenge",
} as const;

const hostSavingGraceCategoryLabels: Record<HostSavingGraceCategory, string> = {
  TIME_OF_DAY: "Time of Day",
  NEXT_SENDER: "Who Texted Next",
};

const punishmentPhases: PublicRoomState["phase"][] = [
  "DRINK_CONFIRMATION",
  "CHALLENGE_REVEAL",
  "CHALLENGE_ACTIVE",
  "BOTTLE_FLIP_ACTIVE",
  "PIE_CONFIRMATION",
];

function isPunishmentPhase(phase: PublicRoomState["phase"]) {
  return punishmentPhases.includes(phase);
}

function labelForAction(action: HostAction) {
  return action
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function HostLobbyTeams({ state }: { state: PublicRoomState }) {
  return (
    <section className="grid gap-3 lg:grid-cols-4">
      {state.teams.map((team) => (
        <div
          key={team.id}
          className="min-h-64 rounded-[1.25rem] border border-white/10 bg-[var(--game-card)] p-4"
          style={{ borderTop: `5px solid ${team.color}` }}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-xl font-black text-white">
                {team.name}
              </h2>
              <div className="mt-1 text-sm font-bold text-white/45">
                {team.playerCount} players
              </div>
            </div>
            <div
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-black text-black"
              style={{ backgroundColor: team.color }}
            >
              {team.icon}
            </div>
          </div>

          {team.players.length ? (
            <div className="grid gap-2">
              {team.players.map((player) => (
                <div
                  key={player.id}
                  className="flex min-w-0 items-center gap-3 rounded-xl bg-white/[0.06] px-3 py-2"
                >
                  <Avatar player={player} size="sm" />
                  <span className="min-w-0 flex-1 truncate font-bold text-white">
                    {player.displayName}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/15 px-3 py-8 text-center text-sm font-bold text-white/35">
              Waiting for players
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

function getStepTwoReadiness(state: PublicRoomState) {
  const leaderByTeamId = new Map(
    (state.leaders || []).map((leader) => [leader.teamId, leader.playerId]),
  );
  const penaltyByTeamId = new Map(
    (state.penalties || []).map((penalty) => [penalty.teamId, penalty]),
  );
  const teams = state.teams.map((team) => {
    const leaderId = leaderByTeamId.get(team.id) || null;
    const penalty = penaltyByTeamId.get(team.id);
    const consequenceReadyIds = new Set(
      penalty?.selection?.consequencePlayerIds || [],
    );
    const players = team.players
      .filter((player) => player.status === "active")
      .map((player) => {
        const isLeader = player.id === leaderId;
        const ready = isLeader
          ? Boolean(
              penalty?.selection?.lambSelected &&
                penalty.selection.challengeSelected,
            )
          : consequenceReadyIds.has(player.id);

        return { player, isLeader, ready };
      });

    return {
      team,
      players,
      ready: players.length > 0 && players.every((item) => item.ready),
    };
  });

  return {
    teams,
    allReady:
      state.lobby.activePlayerCount > 0 &&
      teams.every((team) => team.ready),
  };
}

function HostStepTwoTopBar({
  state,
  seconds,
}: {
  state: PublicRoomState;
  seconds: number | null;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="grid min-h-20 place-items-center rounded-[1.25rem] bg-white px-3 text-center text-black shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
        <div>
          <div className="text-xs font-black uppercase text-black/45">Round</div>
          <div
            className="text-2xl font-black"
            style={{ fontFamily: "var(--game-comic-font)" }}
          >
            {state.currentRoundNumber}/{state.totalRounds}
          </div>
        </div>
      </div>
      <div className="grid min-h-20 place-items-center rounded-[1.25rem] bg-white px-3 text-center text-black shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
        <div>
          <div className="text-xs font-black uppercase text-black/45">Timer</div>
          <div
            className="text-4xl font-black leading-none"
            style={{ fontFamily: "var(--game-comic-font)" }}
          >
            {String(seconds ?? 0).padStart(2, "0")}
          </div>
        </div>
      </div>
      <div className="grid min-h-20 place-items-center rounded-[1.25rem] bg-white px-3 text-center text-black shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
        <div>
          <div className="text-xs font-black uppercase text-black/45">Teams</div>
          <div
            className="text-2xl font-black"
            style={{ fontFamily: "var(--game-comic-font)" }}
          >
            {state.teamCount}
          </div>
        </div>
      </div>
    </div>
  );
}

function HostStepTwoTeams({
  readiness,
}: {
  readiness: ReturnType<typeof getStepTwoReadiness>;
}) {
  return (
    <section className="grid gap-3 lg:grid-cols-4">
      {readiness.teams.map(({ team, players }) => (
        <div
          key={team.id}
          className="rounded-[1.25rem] bg-white p-4 text-black shadow-[0_16px_38px_rgba(0,0,0,0.14)]"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2
                className="truncate text-xl font-black"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                {team.name}
              </h2>
              <div className="mt-1 text-sm font-bold text-black/45">
                {players.filter((item) => item.ready).length}/{players.length} ready
              </div>
            </div>
            <div
              className="h-5 w-5 shrink-0 rounded-full"
              style={{ backgroundColor: team.color }}
            />
          </div>

          <div className="grid gap-2">
            {players.map(({ player, isLeader, ready }) => (
              <div
                key={player.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-xl bg-black/[0.05] px-2 py-2"
              >
                <Avatar player={player} size="sm" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-black">
                    {player.displayName}
                  </div>
                  {isLeader ? (
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-black/40">
                      Leader
                    </div>
                  ) : null}
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                    ready ? "bg-emerald-500 text-white" : "bg-black/10 text-black/45"
                  }`}
                >
                  {ready ? "Ready" : "Waiting"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

function getQuestionReadiness(state: PublicRoomState) {
  const submittedPlayerIds = new Set(state.voteProgress?.submittedPlayerIds || []);
  const teams = state.teams.map((team) => {
    const players = team.players
      .filter((player) => player.status === "active")
      .map((player) => ({
        player,
        ready: submittedPlayerIds.has(player.id),
      }));

    return {
      team,
      players,
      ready: players.length > 0 && players.every((item) => item.ready),
    };
  });

  return {
    teams,
    allReady:
      Boolean(state.voteProgress?.eligible) &&
      (state.voteProgress?.submitted || 0) >= (state.voteProgress?.eligible || 0),
  };
}

function HostQuestionTopBar({
  state,
  seconds,
}: {
  state: PublicRoomState;
  seconds: number | null;
}) {
  const remaining = Math.max(state.totalRounds - state.currentRoundNumber, 0);

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="grid min-h-20 place-items-center rounded-[1.25rem] bg-white px-3 text-center text-black shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
        <div>
          <div className="text-xs font-black uppercase text-black/45">Round</div>
          <div
            className="text-2xl font-black"
            style={{ fontFamily: "var(--game-comic-font)" }}
          >
            {state.currentRoundNumber}/{state.totalRounds}
          </div>
        </div>
      </div>
      <div className="grid min-h-20 place-items-center rounded-[1.25rem] bg-white px-3 text-center text-black shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
        <div>
          <div className="text-xs font-black uppercase text-black/45">Timer</div>
          <div
            className="text-4xl font-black leading-none"
            style={{ fontFamily: "var(--game-comic-font)" }}
          >
            {String(seconds ?? 0).padStart(2, "0")}
          </div>
        </div>
      </div>
      <div className="grid min-h-20 place-items-center rounded-[1.25rem] bg-white px-3 text-center text-black shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
        <div>
          <div className="text-xs font-black uppercase text-black/45">Left</div>
          <div
            className="text-2xl font-black"
            style={{ fontFamily: "var(--game-comic-font)" }}
          >
            {remaining}
          </div>
        </div>
      </div>
    </div>
  );
}

function HostQuestionTeams({
  readiness,
}: {
  readiness: ReturnType<typeof getQuestionReadiness>;
}) {
  return (
    <section className="grid gap-3 lg:grid-cols-4">
      {readiness.teams.map(({ team, players }) => (
        <div
          key={team.id}
          className="rounded-[1.25rem] bg-white p-4 text-black shadow-[0_16px_38px_rgba(0,0,0,0.14)]"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2
                className="truncate text-xl font-black"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                {team.name}
              </h2>
              <div className="mt-1 text-sm font-bold text-black/45">
                {players.filter((item) => item.ready).length}/{players.length} ready
              </div>
            </div>
            <div
              className="h-5 w-5 shrink-0 rounded-full"
              style={{ backgroundColor: team.color }}
            />
          </div>

          <div className="grid gap-2">
            {players.map(({ player, ready }) => (
              <div
                key={player.id}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-xl bg-black/[0.05] px-2 py-2"
              >
                <Avatar player={player} size="sm" />
                <div className="truncate text-sm font-black text-black">
                  {player.displayName}
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${
                    ready ? "bg-emerald-500 text-white" : "bg-black/10 text-black/45"
                  }`}
                >
                  {ready ? "Ready" : "Waiting"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

type RoundResultTeam = NonNullable<PublicRoomState["roundResults"]>["teams"][number];

function outcomeCopy(outcome: RoundResultTeam["outcome"]) {
  if (outcome === "winner") {
    return "Won this round";
  }

  if (outcome === "last") {
    return "Lost this round";
  }

  if (outcome === "draw") {
    return "Tied this round";
  }

  return "Mid this round";
}

function HostResultTeamCard({
  result,
  score,
}: {
  result: RoundResultTeam;
  score: number;
}) {
  const isWinner = result.outcome === "winner";
  const previousScore = Math.max(0, score - (isWinner ? 10 : 0));
  const [shownScore, setShownScore] = useState(previousScore);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setShownScore(score);
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [score]);

  return (
    <div
      className="rounded-[1.25rem] bg-white p-4 text-black shadow-[0_16px_38px_rgba(0,0,0,0.14)]"
      style={{ borderTop: `8px solid ${result.color}` }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="truncate text-2xl font-black"
            style={{ fontFamily: "var(--game-comic-font)" }}
          >
            {result.name}
          </h2>
          <div className="mt-1 text-sm font-black uppercase text-black/45">
            {outcomeCopy(result.outcome)}
          </div>
        </div>
        {isWinner ? (
          <div className="rounded-xl bg-emerald-500 px-3 py-2 text-lg font-black text-white">
            +10
          </div>
        ) : null}
      </div>
      <div
        className={`mt-5 text-5xl font-black transition-all duration-500 ${
          shownScore === score ? "scale-100 opacity-100" : "scale-95 opacity-55"
        }`}
        style={{ fontFamily: "var(--game-comic-font)" }}
      >
        {shownScore}
      </div>
    </div>
  );
}

function HostFinalResults({ state }: { state: PublicRoomState }) {
  const sorted = [...state.leaderboard].sort((left, right) => right.score - left.score);
  const winners = sorted.filter((team) =>
    state.finalWinnerTeamIds?.includes(team.teamId),
  );
  const winnerNames = winners.map((team) => team.name).join(", ") || "No winner";

  return (
    <main
      className="min-h-dvh px-4 py-6 text-black sm:px-6 lg:px-8"
      style={{ background: "var(--step-two-gradient)" }}
    >
      <div className="mx-auto grid w-full max-w-7xl gap-6">
        <section className="grid min-h-72 place-items-center rounded-[1.75rem] bg-white p-6 text-center shadow-[0_18px_45px_rgba(0,0,0,0.14)]">
          <div>
            <div
              className="text-5xl font-black leading-tight sm:text-7xl"
              style={{ fontFamily: "var(--game-comic-font)" }}
            >
              {winnerNames}
            </div>
            <div className="mt-4 text-xl font-black text-black/50">
              won the game
            </div>
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-4">
          {sorted.map((team, index) => (
            <div
              key={team.teamId}
              className="rounded-[1.25rem] bg-white p-4 text-black shadow-[0_16px_38px_rgba(0,0,0,0.14)]"
              style={{ borderTop: `8px solid ${team.color}` }}
            >
              <div className="text-sm font-black uppercase text-black/45">
                Rank {index + 1}
              </div>
              <div
                className="mt-1 truncate text-2xl font-black"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                {team.name}
              </div>
              <div
                className="mt-5 text-5xl font-black"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                {team.score}
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

function actionForPunishmentPhase(
  phase: PublicRoomState["phase"],
): HostAction | null {
  if (phase === "DRINK_CONFIRMATION") {
    return "CONFIRM_DRINK";
  }

  if (phase === "CHALLENGE_REVEAL") {
    return "START_CHALLENGE";
  }

  if (phase === "CHALLENGE_ACTIVE") {
    return "CHALLENGE_PASSED";
  }

  if (phase === "BOTTLE_FLIP_ACTIVE") {
    return "BOTTLE_LANDED";
  }

  if (phase === "PIE_CONFIRMATION") {
    return "CONFIRM_PIE";
  }

  return null;
}

function labelForPunishmentPhase(phase: PublicRoomState["phase"]) {
  if (phase === "CHALLENGE_REVEAL") {
    return "Start Challenge";
  }

  if (phase === "CHALLENGE_ACTIVE") {
    return "Done";
  }

  return "Next";
}

function initialsForName(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function SavingGraceOptionButton({
  option,
  disabled,
  onClick,
}: {
  option: AnswerOption;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-14 items-center gap-3 rounded-[1rem] border border-black/10 bg-black/[0.05] px-3 py-2 text-left font-black text-black transition hover:bg-black/[0.08] disabled:opacity-50"
    >
      <Avatar
        player={{
          displayName: option.name,
          initials: initialsForName(option.name) || "?",
          avatarUrl: option.avatarUrl || null,
        }}
        size="sm"
      />
      <span className="min-w-0 flex-1 truncate">{option.name}</span>
    </button>
  );
}

function HostSavingGraceModal({
  savingGrace,
  busyAction,
  onClose,
  onStart,
  onAnswer,
}: {
  savingGrace: HostSavingGraceHostState;
  busyAction: string | null;
  onClose: () => void;
  onStart: (category: HostSavingGraceCategory) => void;
  onAnswer: (answer: string) => void;
}) {
  const attempt = savingGrace.activeAttempt;
  const answered = Boolean(attempt?.answer);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/55 px-4 py-6">
      <section className="grid w-full max-w-lg gap-4 rounded-[1.35rem] bg-white p-5 text-black shadow-[0_24px_70px_rgba(0,0,0,0.28)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black uppercase text-black/45">
              {savingGrace.teamName}
            </div>
            <h2
              className="mt-1 text-2xl font-black"
              style={{ fontFamily: "var(--game-comic-font)" }}
            >
              Saving Grace
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/[0.08] text-xl font-black text-black"
            aria-label="Close Saving Grace"
          >
            x
          </button>
        </div>

        {!attempt ? (
          <>
            <div className="rounded-[1rem] bg-yellow-100 px-4 py-3 text-sm font-black text-black/70">
              {savingGrace.remaining} Saving Grace uses left
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(["TIME_OF_DAY", "NEXT_SENDER"] as HostSavingGraceCategory[]).map(
                (category) => (
                  <button
                    key={category}
                    type="button"
                    disabled={savingGrace.remaining <= 0 || Boolean(busyAction)}
                    onClick={() => onStart(category)}
                    className="min-h-16 rounded-[1rem] bg-purple-700 px-4 text-left text-lg font-black text-white shadow-[0_12px_26px_rgba(80,20,140,0.25)] disabled:cursor-not-allowed disabled:opacity-45"
                    style={{ fontFamily: "var(--game-comic-font)" }}
                  >
                    {hostSavingGraceCategoryLabels[category]}
                  </button>
                ),
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-yellow-200 px-3 py-1 text-xs font-black uppercase text-black">
                {hostSavingGraceCategoryLabels[attempt.category]}
              </span>
              <span className="rounded-full bg-black/[0.08] px-3 py-1 text-xs font-black uppercase text-black/60">
                {savingGrace.remaining} left
              </span>
            </div>
            <h3
              className="text-2xl font-black leading-tight"
              style={{ fontFamily: "var(--game-comic-font)" }}
            >
              {attempt.prompt}
            </h3>

            {answered ? (
              <div
                className={`rounded-[1rem] px-4 py-3 font-black ${
                  attempt.isCorrect
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-red-100 text-red-800"
                }`}
              >
                {attempt.isCorrect ? "Correct" : "Wrong"}
                <div className="mt-1 text-sm">
                  Answer: {attempt.correctAnswer || "Unknown"}
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                {attempt.options.map((option) => (
                  <SavingGraceOptionButton
                    key={option.id}
                    option={option}
                    disabled={Boolean(busyAction)}
                    onClick={() => onAnswer(option.name)}
                  />
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={onClose}
              className="h-12 rounded-[1rem] bg-black px-4 font-black text-white"
            >
              Close
            </button>
          </>
        )}
      </section>
    </div>
  );
}

function HostPenaltyReveal({
  state,
  revealed,
  busyAction,
  savingGrace,
  onReveal,
  onAction,
  onStartSavingGrace,
  onAnswerSavingGrace,
}: {
  state: PublicRoomState;
  revealed: boolean;
  busyAction: string | null;
  savingGrace: HostSavingGraceHostState | null | undefined;
  onReveal: () => void;
  onAction: (action: HostAction) => void;
  onStartSavingGrace: (category: HostSavingGraceCategory) => void;
  onAnswerSavingGrace: (answer: string) => void;
}) {
  const penalty = state.activePenalty;
  const action = actionForPunishmentPhase(state.phase);
  const [savingGraceOpenPenaltyId, setSavingGraceOpenPenaltyId] = useState<
    string | null
  >(null);
  const savingGraceOpen = Boolean(
    penalty?.id && savingGraceOpenPenaltyId === penalty.id,
  );

  return (
    <main
      className="h-dvh overflow-hidden px-4 py-4 text-black sm:px-6"
      style={{ background: "var(--step-two-gradient)" }}
    >
      <div className="mx-auto grid h-full w-full max-w-5xl content-center gap-3">
        <section className="grid gap-3 text-center">
          <div
            className="text-2xl font-black text-white drop-shadow sm:text-3xl"
            style={{ fontFamily: "var(--game-comic-font)" }}
          >
            Punishment
          </div>

          <button
            type="button"
            onClick={onReveal}
            disabled={revealed || !penalty}
            className="mx-auto grid aspect-square w-full max-w-[min(46vh,22rem)] place-items-center overflow-hidden rounded-[1.35rem] bg-white p-3 shadow-[0_18px_45px_rgba(0,0,0,0.14)] disabled:cursor-default"
          >
            {penalty ? (
              <div className="relative h-full w-full overflow-hidden rounded-[1.25rem] bg-black/10">
                {penalty.lambAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={penalty.lambAvatarUrl}
                    alt=""
                    className={`h-full w-full object-cover transition duration-500 ${
                      revealed ? "blur-0 scale-100" : "blur-xl scale-110"
                    }`}
                    style={{ imageRendering: revealed ? "auto" : "pixelated" }}
                  />
                ) : (
                  <div
                    className={`grid h-full w-full place-items-center bg-purple-700 text-8xl font-black text-white transition duration-500 ${
                      revealed ? "blur-0 scale-100" : "blur-xl scale-110"
                    }`}
                    style={{ fontFamily: "var(--game-comic-font)" }}
                  >
                    {penalty.lambInitials || "?"}
                  </div>
                )}
                {!revealed ? (
                  <div className="absolute inset-0 grid place-items-center bg-black/25">
                    <div
                      className="rounded-[1.25rem] bg-white px-5 py-3 text-xl font-black text-black"
                      style={{ fontFamily: "var(--game-comic-font)" }}
                    >
                      Tap to reveal
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div
                className="text-3xl font-black"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                No punishment
              </div>
            )}
          </button>

          {penalty && revealed ? (
            <section className="rounded-[1.35rem] bg-white p-4 text-center shadow-[0_18px_45px_rgba(0,0,0,0.14)]">
              <div className="text-sm font-black uppercase text-black/45">
                {penalty.teamName}
              </div>
              <h1
                className="mt-1 text-3xl font-black leading-tight sm:text-4xl"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                {penalty.lambName || "Selected player"}
              </h1>
              <div
                className="mt-2 text-2xl font-black text-purple-700"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                {penalty.consequenceChoice
                  ? consequenceLabels[penalty.consequenceChoice]
                  : "Punishment"}
              </div>
              {penalty.challenge ? (
                <div className="mx-auto mt-3 max-w-2xl rounded-[1rem] bg-black/[0.06] p-3 text-left">
                  <div className="text-lg font-black text-black">
                    {penalty.challenge.title}
                  </div>
                  <div className="mt-1 line-clamp-2 text-sm font-bold leading-5 text-black/60">
                    {penalty.challenge.instructions}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {action && revealed ? (
            <div
              className={`mx-auto grid w-full max-w-sm gap-3 ${
                savingGrace ? "sm:grid-cols-2" : ""
              }`}
            >
              {savingGrace ? (
                <button
                  type="button"
                  onClick={() => setSavingGraceOpenPenaltyId(penalty?.id || null)}
                  disabled={
                    Boolean(busyAction) ||
                    (!savingGrace.activeAttempt && savingGrace.remaining <= 0)
                  }
                  className="h-14 rounded-[1.25rem] bg-yellow-200 px-4 text-base font-black text-black shadow-[0_12px_28px_rgba(0,0,0,0.14)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ fontFamily: "var(--game-comic-font)" }}
                >
                  Saving Grace: {savingGrace.remaining}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => onAction(action)}
                disabled={Boolean(busyAction)}
                className="h-14 rounded-[1.25rem] bg-purple-700 px-6 text-xl font-black text-white shadow-[0_18px_40px_rgba(80,20,140,0.35)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                {busyAction === action ? "Moving..." : labelForPunishmentPhase(state.phase)}
              </button>
            </div>
          ) : null}
        </section>
      </div>
      {savingGraceOpen && savingGrace ? (
        <HostSavingGraceModal
          savingGrace={savingGrace}
          busyAction={busyAction}
          onClose={() => setSavingGraceOpenPenaltyId(null)}
          onStart={onStartSavingGrace}
          onAnswer={onAnswerSavingGrace}
        />
      ) : null}
    </main>
  );
}

export function HostRoom({ roomCode, view = "host" }: HostRoomProps) {
  const normalizedRoomCode = roomCode.toUpperCase();
  const [hostState, setHostState] = useState<HostPrivateState | null>(null);
  const [tokenMissing, setTokenMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [rounds, setRounds] = useState(10);
  const [questionTimerSeconds, setQuestionTimerSeconds] = useState(60);
  const [selectedQuestionPackId, setSelectedQuestionPackId] = useState("");
  const [selectedChallengeDeckId, setSelectedChallengeDeckId] = useState("");
  const [revealedPenaltyIds, setRevealedPenaltyIds] = useState<Record<string, boolean>>({});
  const lastHostSyncVersionRef = useRef<number | null>(null);
  const autoAdvancedSelectionVersionRef = useRef<number | null>(null);
  const autoAdvancedQuestionVersionRef = useRef<number | null>(null);
  const { state, realtimeEnabled } = usePublicRoomState(
    normalizedRoomCode,
    hostState?.publicState || null,
  );
  const publicState = state || hostState?.publicState || null;
  const timer = useSyncedTimer(publicState?.timer);
  const tokenKey = useMemo(() => hostTokenKey(normalizedRoomCode), [normalizedRoomCode]);
  const activePenaltyId = publicState?.activePenalty?.id || null;

  async function fetchHostState(options: { quiet?: boolean } = {}) {
    const token = readStoredToken(tokenKey);

    if (!token) {
      setTokenMissing(true);
      setLoading(false);
      return;
    }

    if (!options.quiet) {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await fetch(
        `/api/rooms/${encodeURIComponent(normalizedRoomCode)}/host-state`,
        {
          headers: { "x-host-token": token },
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as HostStateResponse;

      if (!response.ok || !payload.room || !payload.publicState) {
        throw new Error(payload.error || "Host state could not be loaded.");
      }

      setHostState(payload as HostPrivateState);
      setRounds(Number(payload.room.settings.rounds) || 10);
      setQuestionTimerSeconds(
        Number(payload.room.settings.questionTimerSeconds) || 60,
      );
      setSelectedQuestionPackId(
        typeof payload.room.settings.selectedQuestionPackId === "string"
          ? payload.room.settings.selectedQuestionPackId
          : "",
      );
      setSelectedChallengeDeckId(
        typeof payload.room.settings.selectedChallengeDeckId === "string"
          ? payload.room.settings.selectedChallengeDeckId
          : "",
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Host state could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchHostState();
    }, 0);

    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedRoomCode, tokenKey]);

  useEffect(() => {
    if (!publicState?.version || !hostState) {
      return;
    }

    if (lastHostSyncVersionRef.current === publicState.version) {
      return;
    }

    lastHostSyncVersionRef.current = publicState.version;
    const timeout = window.setTimeout(() => {
      void fetchHostState({ quiet: true });
    }, 0);

    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicState?.version]);

  async function postJson(path: string, body: Record<string, unknown>, busy: string) {
    const token = readStoredToken(tokenKey);

    if (!token) {
      setTokenMissing(true);
      return false;
    }

    setBusyAction(busy);
    setError(null);

    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-host-token": token,
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Action failed.");
      }

      await fetchHostState();
      return true;
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed.");
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  function runHostAction(action: HostAction) {
    return postJson(
      `/api/rooms/${encodeURIComponent(normalizedRoomCode)}/host/action`,
      { action },
      action,
    );
  }

  function runTeamConfig(body: Record<string, unknown>, label: string) {
    return postJson(
      `/api/rooms/${encodeURIComponent(normalizedRoomCode)}/host/team-config`,
      body,
      label,
    );
  }

  function runSavingGraceStart(category: HostSavingGraceCategory) {
    return postJson(
      `/api/rooms/${encodeURIComponent(
        normalizedRoomCode,
      )}/host/saving-grace/start`,
      { category },
      `SAVING_GRACE_${category}`,
    );
  }

  function runSavingGraceAnswer(answer: string) {
    return postJson(
      `/api/rooms/${encodeURIComponent(
        normalizedRoomCode,
      )}/host/saving-grace/answer`,
      { answer },
      "SAVING_GRACE_ANSWER",
    );
  }

  function revealActivePenalty() {
    if (!activePenaltyId) {
      return;
    }

    setRevealedPenaltyIds((current) => ({
      ...current,
      [activePenaltyId]: true,
    }));
  }

  async function startGameFromLobby() {
    if (publicState?.phase === "LOBBY") {
      const locked = await runHostAction("LOCK_TEAMS");

      if (!locked) {
        return;
      }
    }

    await runHostAction("START_GAME");
  }

  async function reviewQuestion() {
    const locked = await runHostAction("LOCK_VOTING");

    if (!locked) {
      return;
    }

    await runHostAction("REVEAL_ANSWER");
  }

  useEffect(() => {
    if (
      publicState?.phase !== "CHALLENGE_SELECTION" ||
      !timer.isExpired ||
      busyAction ||
      autoAdvancedSelectionVersionRef.current === publicState.version
    ) {
      return;
    }

    autoAdvancedSelectionVersionRef.current = publicState.version;
    void runHostAction("SHOW_QUESTION");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicState?.phase, publicState?.version, timer.isExpired, busyAction]);

  useEffect(() => {
    if (
      publicState?.phase !== "QUESTION_ACTIVE" ||
      !timer.isExpired ||
      busyAction ||
      autoAdvancedQuestionVersionRef.current === publicState.version
    ) {
      return;
    }

    autoAdvancedQuestionVersionRef.current = publicState.version;
    void reviewQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicState?.phase, publicState?.version, timer.isExpired, busyAction]);

  if (tokenMissing) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col justify-center px-4 py-8">
        <div className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-6 text-center">
          <h1 className="text-2xl font-black text-white">Host token missing</h1>
          <p className="mt-3 text-white/60">
            Create this room from the landing page on this browser to access the
            private host dashboard.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex h-12 items-center justify-center rounded-2xl bg-cyan-300 px-5 font-black text-black"
          >
            Create a Room
          </Link>
        </div>
      </main>
    );
  }

  const phaseActions = publicState ? PHASE_ACTIONS[publicState.phase] || [] : [];

  if (
    hostState &&
    publicState &&
    (publicState.phase === "LOBBY" || publicState.phase === "TEAM_SETUP")
  ) {
    return (
      <main className="mx-auto grid min-h-dvh w-full max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 rounded-[1.25rem] border border-white/10 bg-[var(--game-card)] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-black text-white">Who Said?</h1>
            <p className="mt-1 font-bold text-white/50">
              {publicState.lobby.activePlayerCount} players joined
            </p>
          </div>
          <div className="rounded-2xl bg-black/30 px-4 py-3 text-left sm:text-right">
            <div className="text-xs font-black uppercase tracking-[0.24em] text-white/40">
              PIN
            </div>
            <div className="text-3xl font-black tracking-[0.16em] text-yellow-200">
              {publicState.roomCode}
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-[1.25rem] border border-red-300/30 bg-red-500/10 p-5 font-semibold text-red-100">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[1.25rem] border border-white/10 bg-[var(--game-card)] p-5">
            <h2 className="text-xl font-black text-white">Game Settings</h2>
            <div className="mt-4 grid gap-3">
              <select
                value={selectedQuestionPackId}
                onChange={(event) => setSelectedQuestionPackId(event.target.value)}
                className="h-12 rounded-2xl border border-white/10 bg-black/30 px-3 font-bold text-white"
              >
                <option value="">Any enabled question pack</option>
                {hostState.game?.packs.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {pack.name}
                  </option>
                ))}
              </select>
              <select
                value={selectedChallengeDeckId}
                onChange={(event) => setSelectedChallengeDeckId(event.target.value)}
                className="h-12 rounded-2xl border border-white/10 bg-black/30 px-3 font-bold text-white"
              >
                <option value="">Any enabled challenge deck</option>
                {hostState.game?.challengeDecks.map((deck) => (
                  <option key={deck.id} value={deck.id}>
                    {deck.name}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-sm font-bold text-white/60">
                  Rounds
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={rounds}
                    onChange={(event) => setRounds(Number(event.target.value))}
                    className="h-12 rounded-2xl border border-white/10 bg-black/30 px-3 font-bold text-white"
                  />
                </label>
                <label className="grid gap-1 text-sm font-bold text-white/60">
                  Vote seconds
                  <input
                    type="number"
                    min={15}
                    max={60}
                    value={questionTimerSeconds}
                    onChange={(event) =>
                      setQuestionTimerSeconds(Number(event.target.value))
                    }
                    className="h-12 rounded-2xl border border-white/10 bg-black/30 px-3 font-bold text-white"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() =>
                  void runTeamConfig(
                    {
                      action: "SET_SETTINGS",
                      rounds,
                      questionTimerSeconds,
                      selectedQuestionPackId,
                      selectedChallengeDeckId,
                    },
                    "SET_SETTINGS",
                  )
                }
                disabled={Boolean(busyAction)}
                className="h-12 rounded-2xl bg-white/10 px-4 font-black text-white disabled:opacity-60"
              >
                {busyAction === "SET_SETTINGS" ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </div>

          <div className="rounded-[1.25rem] border border-white/10 bg-[var(--game-card)] p-5">
            <h2 className="text-xl font-black text-white">Manual Move</h2>
            <div className="mt-4 grid max-h-80 gap-3 overflow-auto pr-1">
              {publicState.players.length ? (
                publicState.players.map((player) => (
                  <div
                    key={player.id}
                    className="grid gap-2 rounded-2xl bg-white/[0.06] p-3 sm:grid-cols-[1fr_180px] sm:items-center"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar player={player} size="sm" />
                      <span className="truncate font-black text-white">
                        {player.displayName}
                      </span>
                    </div>
                    <select
                      value={player.teamId || ""}
                      onChange={(event) =>
                        void runTeamConfig(
                          {
                            action: "MOVE_PLAYER",
                            playerId: player.id,
                            teamId: event.target.value,
                          },
                          "MOVE_PLAYER",
                        )
                      }
                      className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 font-bold text-white"
                    >
                      {publicState.teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl bg-white/[0.04] p-5 text-center font-bold text-white/45">
                  Waiting for players to join
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-xl font-black text-white">Groups</h2>
            <button
              type="button"
              onClick={() =>
                void runTeamConfig({ action: "AUTO_BALANCE" }, "AUTO_BALANCE")
              }
              disabled={Boolean(busyAction)}
              className="h-12 rounded-2xl bg-white/10 px-5 font-black text-white disabled:opacity-60"
            >
              {busyAction === "AUTO_BALANCE" ? "Balancing..." : "Auto-Balance"}
            </button>
          </div>
          <HostLobbyTeams state={publicState} />
        </section>

        <section className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <button
            type="button"
            onClick={() => void startGameFromLobby()}
            disabled={Boolean(busyAction)}
            className="h-16 rounded-2xl bg-cyan-300 px-6 text-xl font-black text-black transition active:scale-[0.99] disabled:opacity-60"
          >
            {busyAction === "START_GAME" || busyAction === "LOCK_TEAMS"
              ? "Starting..."
              : "Start Game"}
          </button>
          <button
            type="button"
            onClick={() => window.open(`/display/${publicState.roomCode}`, "_blank")}
            className="h-16 rounded-2xl bg-yellow-200 px-6 text-base font-black text-black"
          >
            Open Display
          </button>
        </section>
      </main>
    );
  }

  if (hostState && publicState && publicState.phase === "CHALLENGE_SELECTION") {
    const readiness = getStepTwoReadiness(publicState);

    return (
      <main
        className="min-h-dvh px-4 py-6 text-black sm:px-6 lg:px-8"
        style={{ background: "var(--step-two-gradient)" }}
      >
        <div className="mx-auto grid w-full max-w-7xl gap-6">
          <HostStepTwoTopBar state={publicState} seconds={timer.seconds} />

          {error ? (
            <div className="rounded-[1.25rem] border border-red-200 bg-white px-4 py-3 font-bold text-red-700">
              {error}
            </div>
          ) : null}

          <section className="grid gap-4 rounded-[1.75rem] bg-white p-6 text-center shadow-[0_18px_45px_rgba(0,0,0,0.14)]">
            <h1
              className="text-3xl font-black leading-tight sm:text-4xl"
              style={{ fontFamily: "var(--game-comic-font)" }}
            >
              Waiting for player selection
            </h1>
            <p className="font-bold text-black/50">
              Missing choices are picked automatically when the timer ends.
            </p>
            <button
              type="button"
              onClick={() => void runHostAction("SHOW_QUESTION")}
              disabled={!readiness.allReady || Boolean(busyAction)}
              className="mx-auto h-14 w-full max-w-sm rounded-[1.25rem] bg-purple-700 px-6 text-xl font-black text-white shadow-[0_18px_40px_rgba(80,20,140,0.35)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ fontFamily: "var(--game-comic-font)" }}
            >
              {busyAction === "SHOW_QUESTION" ? "Moving..." : "Next"}
            </button>
          </section>

          <HostStepTwoTeams readiness={readiness} />
        </div>
      </main>
    );
  }

  if (
    hostState &&
    publicState &&
    publicState.phase === "QUESTION_ACTIVE" &&
    publicState.question
  ) {
    const readiness = getQuestionReadiness(publicState);
    const canReview = readiness.allReady || timer.isExpired;

    return (
      <main
        className="min-h-dvh px-4 py-6 text-black sm:px-6 lg:px-8"
        style={{ background: "var(--step-two-gradient)" }}
      >
        <div className="mx-auto grid w-full max-w-7xl gap-6">
          <HostQuestionTopBar state={publicState} seconds={timer.seconds} />

          {error ? (
            <div className="rounded-[1.25rem] border border-red-200 bg-white px-4 py-3 font-bold text-red-700">
              {error}
            </div>
          ) : null}

          <section className="grid gap-5 text-center">
            <div
              className="text-3xl font-black text-white drop-shadow sm:text-4xl"
              style={{ fontFamily: "var(--game-comic-font)" }}
            >
              Who Said?
            </div>

            <div className="grid min-h-56 place-items-center rounded-[1.75rem] bg-white p-6 text-black shadow-[0_18px_45px_rgba(0,0,0,0.14)] sm:min-h-72">
              <h1
                className="max-w-4xl text-3xl font-black leading-tight sm:text-5xl"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                {publicState.question.quote}
              </h1>
            </div>

            <button
              type="button"
              onClick={() => void reviewQuestion()}
              disabled={!canReview || Boolean(busyAction)}
              className="mx-auto h-14 w-full max-w-sm rounded-[1.25rem] bg-purple-700 px-6 text-xl font-black text-white shadow-[0_18px_40px_rgba(80,20,140,0.35)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ fontFamily: "var(--game-comic-font)" }}
            >
              {busyAction === "LOCK_VOTING" || busyAction === "REVEAL_ANSWER"
                ? "Reviewing..."
                : "Review"}
            </button>
          </section>

          <HostQuestionTeams readiness={readiness} />
        </div>
      </main>
    );
  }

  if (
    hostState &&
    publicState &&
    (publicState.phase === "ANSWER_REVEAL" || publicState.phase === "ROUND_DRAW") &&
    publicState.roundResults
  ) {
    const results = publicState.roundResults;
    const winners = results.teams.filter((team) => team.outcome === "winner");
    const losers = results.teams.filter((team) => team.outcome === "last");
    const isDraw = results.completeDraw || publicState.phase === "ROUND_DRAW";
    const nextAction: HostAction = losers.length > 0 ? "START_PENALTY_QUEUE" : "NEXT_ROUND";
    const winnerText = isDraw
      ? "This round was a draw"
      : `${winners.map((team) => team.name).join(", ")} won this round`;
    const loserText =
      losers.length > 0
        ? `${losers.map((team) => team.name).join(", ")} lost this round`
        : "No team takes a punishment this round";

    return (
      <main
        className="min-h-dvh px-4 py-6 text-black sm:px-6 lg:px-8"
        style={{ background: "var(--step-two-gradient)" }}
      >
        <div className="mx-auto grid w-full max-w-7xl gap-6">
          {error ? (
            <div className="rounded-[1.25rem] border border-red-200 bg-white px-4 py-3 font-bold text-red-700">
              {error}
            </div>
          ) : null}

          <section className="grid gap-4 rounded-[1.75rem] bg-white p-6 text-center shadow-[0_18px_45px_rgba(0,0,0,0.14)]">
            <div className="text-sm font-black uppercase text-black/45">
              Round {publicState.currentRoundNumber}/{publicState.totalRounds}
            </div>
            <h1
              className="text-3xl font-black leading-tight sm:text-5xl"
              style={{ fontFamily: "var(--game-comic-font)" }}
            >
              {winnerText}
            </h1>
            <p className="text-xl font-black text-black/55">{loserText}</p>
            {results.revealedAnswer ? (
              <div className="font-bold text-black/45">
                Answer: {results.revealedAnswer.correctAnswerName}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => void runHostAction(nextAction)}
              disabled={Boolean(busyAction)}
              className="mx-auto h-14 w-full max-w-sm rounded-[1.25rem] bg-purple-700 px-6 text-xl font-black text-white shadow-[0_18px_40px_rgba(80,20,140,0.35)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
              style={{ fontFamily: "var(--game-comic-font)" }}
            >
              {busyAction === nextAction ? "Moving..." : "Next"}
            </button>
          </section>

          <section className="grid gap-3 lg:grid-cols-4">
            {results.teams.map((result) => (
              <HostResultTeamCard
                key={`${result.teamId}-${publicState.leaderboard.find(
                  (team) => team.teamId === result.teamId,
                )?.score || 0}`}
                result={result}
                score={
                  publicState.leaderboard.find(
                    (team) => team.teamId === result.teamId,
                  )?.score || 0
                }
              />
            ))}
          </section>
        </div>
      </main>
    );
  }

  if (
    hostState &&
    publicState &&
    isPunishmentPhase(publicState.phase)
  ) {
    return (
      <HostPenaltyReveal
        state={publicState}
        revealed={activePenaltyId ? Boolean(revealedPenaltyIds[activePenaltyId]) : false}
        busyAction={busyAction}
        savingGrace={hostState.game?.savingGrace}
        onReveal={revealActivePenalty}
        onAction={(action) => void runHostAction(action)}
        onStartSavingGrace={(category) => void runSavingGraceStart(category)}
        onAnswerSavingGrace={(answer) => void runSavingGraceAnswer(answer)}
      />
    );
  }

  if (hostState && publicState && publicState.phase === "ROUND_COMPLETE") {
    const isFinalRound = publicState.currentRoundNumber >= publicState.totalRounds;
    const nextAction: HostAction = isFinalRound ? "END_GAME" : "NEXT_ROUND";

    return (
      <main
        className="grid h-dvh overflow-hidden px-4 py-6 text-black sm:px-6 lg:px-8"
        style={{ background: "var(--step-two-gradient)" }}
      >
        <div className="mx-auto grid h-full w-full max-w-5xl content-center gap-6">
          {error ? (
            <div className="rounded-[1.25rem] border border-red-200 bg-white px-4 py-3 font-bold text-red-700">
              {error}
            </div>
          ) : null}

          <section className="grid min-h-72 place-items-center rounded-[1.75rem] bg-white p-6 text-center shadow-[0_18px_45px_rgba(0,0,0,0.14)]">
            <div>
              <div className="text-sm font-black uppercase text-black/45">
                Round {publicState.currentRoundNumber}/{publicState.totalRounds}
              </div>
              <h1
                className="mt-3 text-4xl font-black leading-tight sm:text-6xl"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                Round complete
              </h1>
              <button
                type="button"
                onClick={() => void runHostAction(nextAction)}
                disabled={Boolean(busyAction)}
                className="mt-8 h-16 w-full min-w-72 rounded-[1.25rem] bg-purple-700 px-6 text-2xl font-black text-white shadow-[0_18px_40px_rgba(80,20,140,0.35)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                {busyAction === nextAction
                  ? "Moving..."
                  : isFinalRound
                    ? "Show Winner"
                    : "Next Question"}
              </button>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (hostState && publicState && publicState.phase === "FINAL_RESULTS") {
    return <HostFinalResults state={publicState} />;
  }

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:px-8">
      {publicState ? (
        <RoomStatusHeader
          state={publicState}
          realtimeEnabled={realtimeEnabled}
        />
      ) : null}

      {loading ? (
        <div className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-6 font-bold text-white/70">
          Loading host dashboard...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[1.5rem] border border-red-300/30 bg-red-500/10 p-5 font-semibold text-red-100">
          {error}
        </div>
      ) : null}

      {hostState && publicState ? (
        <>
          <section className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
            <div className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
              <div className="mb-4 flex flex-wrap gap-2">
                <StateBadge label={view === "setup" ? "Setup" : "Host"} tone="pink" />
                <StateBadge
                  label={`${publicState.lobby.activePlayerCount} active`}
                  tone="yellow"
                />
              </div>
              <h2 className="text-2xl font-black text-white">
                {hostState.nextRecommendedAction}
              </h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {phaseActions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    onClick={() => void runHostAction(action)}
                    disabled={Boolean(busyAction)}
                    className="h-13 rounded-2xl bg-cyan-300 px-4 font-black text-black disabled:opacity-60"
                  >
                    {busyAction === action ? "Working..." : labelForAction(action)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => window.open(`/display/${publicState.roomCode}`, "_blank")}
                  className="h-13 rounded-2xl bg-yellow-200 px-4 font-black text-black"
                >
                  Open Public Display
                </button>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-5">
                {(["PAUSE", "RESUME", "ADD_5", "ADD_10", "END_TIMER"] as HostAction[]).map(
                  (action) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => void runHostAction(action)}
                      disabled={Boolean(busyAction)}
                      className="h-11 rounded-2xl bg-white/10 px-3 text-sm font-black text-white disabled:opacity-50"
                    >
                      {labelForAction(action)}
                    </button>
                  ),
                )}
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
              <h2 className="text-xl font-black text-white">Game Setup</h2>
              <div className="mt-4 grid gap-3">
                <select
                  value={selectedQuestionPackId}
                  onChange={(event) => setSelectedQuestionPackId(event.target.value)}
                  className="h-12 rounded-2xl border border-white/10 bg-black/30 px-3 font-bold text-white"
                >
                  <option value="">Any enabled question pack</option>
                  {hostState.game?.packs.map((pack) => (
                    <option key={pack.id} value={pack.id}>
                      {pack.name}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedChallengeDeckId}
                  onChange={(event) => setSelectedChallengeDeckId(event.target.value)}
                  className="h-12 rounded-2xl border border-white/10 bg-black/30 px-3 font-bold text-white"
                >
                  <option value="">Any enabled challenge deck</option>
                  {hostState.game?.challengeDecks.map((deck) => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-sm font-bold text-white/60">
                    Rounds
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={rounds}
                      onChange={(event) => setRounds(Number(event.target.value))}
                      className="h-12 rounded-2xl border border-white/10 bg-black/30 px-3 font-bold text-white"
                    />
                  </label>
                  <label className="grid gap-1 text-sm font-bold text-white/60">
                    Vote seconds
                    <input
                      type="number"
                      min={15}
                      max={60}
                      value={questionTimerSeconds}
                      onChange={(event) =>
                        setQuestionTimerSeconds(Number(event.target.value))
                      }
                      className="h-12 rounded-2xl border border-white/10 bg-black/30 px-3 font-bold text-white"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    void runTeamConfig(
                      {
                        action: "SET_SETTINGS",
                        rounds,
                        questionTimerSeconds,
                        selectedQuestionPackId,
                        selectedChallengeDeckId,
                      },
                      "SET_SETTINGS",
                    )
                  }
                  className="h-12 rounded-2xl bg-white/10 px-4 font-black text-white"
                >
                  Save Setup
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void runTeamConfig({ action: "AUTO_BALANCE" }, "AUTO_BALANCE")
                  }
                  className="h-12 rounded-2xl bg-pink-300 px-4 font-black text-black"
                >
                  Auto-Balance Teams
                </button>
              </div>
            </div>
          </section>

          {hostState.game?.currentQuestion ? (
            <section className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
              <div className="text-xs font-black uppercase tracking-[0.22em] text-white/40">
                Host Preview
              </div>
              <h2 className="mt-2 text-xl font-black text-white">
                {hostState.game.currentQuestion.quote}
              </h2>
              <p className="mt-2 font-bold text-white/55">
                Question loaded for this round.
              </p>
            </section>
          ) : null}

          <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
            <TeamGrid state={publicState} />
            <div className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
              <h2 className="text-xl font-black text-white">Manual Moves</h2>
              <div className="mt-4 grid max-h-[680px] gap-3 overflow-auto pr-1">
                {publicState.players.map((player) => (
                  <div
                    key={player.id}
                    className="grid gap-2 rounded-2xl bg-white/[0.06] p-3"
                  >
                    <div className="font-black text-white">{player.displayName}</div>
                    <select
                      value={player.teamId || ""}
                      onChange={(event) =>
                        void runTeamConfig(
                          {
                            action: "MOVE_PLAYER",
                            playerId: player.id,
                            teamId: event.target.value,
                          },
                          "MOVE_PLAYER",
                        )
                      }
                      className="h-11 rounded-xl border border-white/10 bg-black/30 px-3 font-bold text-white"
                    >
                      {publicState.teams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
