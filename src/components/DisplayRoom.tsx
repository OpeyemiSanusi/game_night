"use client";

import { Avatar } from "@/components/Avatar";
import { StateBadge } from "@/components/StateBadge";
import { TeamGrid } from "@/components/TeamGrid";
import { usePublicRoomState } from "@/lib/use-public-room-state";
import { useSyncedTimer } from "@/lib/use-synced-timer";
import type {
  PenaltyPublic,
  PublicRoomState,
  TeamScoreResult,
} from "@/lib/types";

interface DisplayRoomProps {
  roomCode: string;
}

function formatPhase(phase: string) {
  return phase.replaceAll("_", " ");
}

function TimerPanel({ state }: { state: PublicRoomState }) {
  const timer = useSyncedTimer(state.timer);

  return (
    <div className="rounded-[1.5rem] bg-black/35 px-7 py-5 text-center">
      <div className="text-sm font-black uppercase tracking-[0.28em] text-white/40">
        Timer
      </div>
      <div className="mt-2 text-6xl font-black leading-none text-cyan-100 md:text-7xl">
        {timer.seconds == null ? "--" : timer.seconds}
      </div>
      <div className="mt-2 text-sm font-black uppercase tracking-[0.18em] text-white/40">
        {state.timer.isPaused ? "Paused" : timer.isExpired ? "Ended" : "Seconds"}
      </div>
    </div>
  );
}

function LeadersPanel({ state }: { state: PublicRoomState }) {
  if (!state.leaders?.length) {
    return null;
  }

  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
      <div className="mb-4 flex flex-wrap gap-2">
        <StateBadge label="Group Leaders" tone="pink" />
        <StateBadge label={`Round ${state.currentRoundNumber}`} tone="cyan" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {state.leaders.map((leader) => (
          <div
            key={`${leader.teamId}-${leader.playerId}`}
            className="flex items-center gap-3 rounded-2xl bg-white/[0.06] p-3"
            style={{ borderLeft: `5px solid ${leader.teamColor}` }}
          >
            <Avatar player={leader} size="md" />
            <div className="min-w-0">
              <div className="truncate font-black text-white">
                {leader.displayName}
              </div>
              <div className="truncate text-sm font-bold text-white/50">
                {leader.teamName}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuestionPanel({ state }: { state: PublicRoomState }) {
  if (!state.question) {
    return null;
  }

  return (
    <section className="rounded-[2rem] border border-white/10 bg-[var(--game-card-strong)] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.35)]">
      <div className="mb-4 flex flex-wrap gap-2">
        <StateBadge label={`Round ${state.question.roundNumber}`} tone="cyan" />
        {state.voteProgress ? (
          <StateBadge
            label={`${state.voteProgress.submitted}/${state.voteProgress.eligible} votes`}
            tone="green"
          />
        ) : null}
      </div>
      <h2 className="text-3xl font-black leading-tight text-white md:text-5xl">
        {state.question.quote}
      </h2>
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {state.question.answerOptions.map((option) => {
          const isCorrect =
            state.roundResults?.revealedAnswer?.correctAnswerId === option.id;

          return (
            <div
              key={option.id}
              className={`flex min-h-24 items-center gap-4 rounded-[1.25rem] border p-4 ${
                isCorrect
                  ? "border-yellow-200 bg-yellow-200 text-black"
                  : "border-white/10 bg-black/25 text-white"
              }`}
            >
              <Avatar
                player={{
                  displayName: option.name,
                  initials: option.name
                    .split(/\s+/)
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase(),
                  avatarUrl: option.avatarUrl || null,
                }}
                size="lg"
              />
              <div className="min-w-0 flex-1 text-xl font-black">
                {option.name}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function scoreTone(score: TeamScoreResult["outcome"]) {
  if (score === "winner") {
    return "border-emerald-300 bg-emerald-300/12";
  }

  if (score === "last") {
    return "border-pink-300 bg-pink-300/12";
  }

  if (score === "draw") {
    return "border-yellow-200 bg-yellow-200/12";
  }

  return "border-white/10 bg-white/[0.06]";
}

function ResultsPanel({ state }: { state: PublicRoomState }) {
  const results = state.roundResults;

  if (!results) {
    return null;
  }

  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
      <div className="mb-3 flex flex-wrap gap-2">
        <StateBadge label="Answer Revealed" tone="yellow" />
        {results.completeDraw ? (
          <StateBadge label="Full Draw" tone="neutral" />
        ) : null}
      </div>
      <h2 className="text-3xl font-black text-yellow-100">
        {results.revealedAnswer?.correctAnswerName}
      </h2>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {results.teams.map((team) => (
          <div
            key={team.teamId}
            className={`rounded-[1.25rem] border p-4 ${scoreTone(team.outcome)}`}
            style={{ borderTop: `5px solid ${team.color}` }}
          >
            <div className="text-sm font-black uppercase tracking-[0.18em] text-white/45">
              {team.outcome}
            </div>
            <div className="mt-1 truncate text-xl font-black text-white">
              {team.name}
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <div className="text-4xl font-black text-white">
                  {Math.round(team.accuracy * 100)}%
                </div>
                <div className="text-sm font-bold text-white/50">
                  {team.correctVotes}/{team.eligiblePlayers} correct
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SavingGracePanel({ state }: { state: PublicRoomState }) {
  if (!state.savingGrace) {
    return null;
  }

  const results = state.savingGrace.resultsByTeamId;

  return (
    <section className="rounded-[1.5rem] border border-yellow-200/30 bg-yellow-200/10 p-5">
      <div className="mb-3 flex flex-wrap gap-2">
        <StateBadge label="Saving Grace" tone="yellow" />
        <StateBadge
          label={`${state.savingGrace.answeredTeamIds.length}/${state.savingGrace.teamIds.length} answered`}
          tone="green"
        />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {state.savingGrace.teamIds.map((teamId) => {
          const team = state.teams.find((item) => item.id === teamId);
          const result = results?.[teamId];
          const category = state.savingGrace?.categoryByTeamId[teamId];

          return (
            <div
              key={teamId}
              className="rounded-[1.25rem] border border-white/10 bg-black/25 p-4"
              style={{ borderTop: `5px solid ${team?.color || "#ffffff"}` }}
            >
              <div className="truncate text-xl font-black text-white">
                {team?.name || "Team"}
              </div>
              <div className="mt-2 text-sm font-bold text-white/55">
                {result
                  ? result.isCorrect
                    ? "Escaped punishment"
                    : "Punishment continues"
                  : category
                    ? category.replaceAll("_", " ")
                    : "Choosing category"}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function PenaltyCard({ penalty }: { penalty: PenaltyPublic }) {
  return (
    <div
      className={`rounded-[1.25rem] border p-4 ${
        penalty.isActive
          ? "border-pink-300 bg-pink-300/12"
          : "border-white/10 bg-white/[0.06]"
      }`}
      style={{ borderTop: `5px solid ${penalty.teamColor}` }}
    >
      <div className="mb-2 flex flex-wrap gap-2">
        <StateBadge label={penalty.isActive ? "Active" : penalty.status} tone="pink" />
      </div>
      <div className="text-xl font-black text-white">{penalty.teamName}</div>
      {penalty.lambName ? (
        <div className="mt-2 text-sm font-bold text-white/60">
          Lamb: {penalty.lambName}
        </div>
      ) : null}
      {penalty.rescuerName ? (
        <div className="mt-1 text-sm font-bold text-white/60">
          Rescuer: {penalty.rescuerName}
        </div>
      ) : null}
      {penalty.challenge ? (
        <div className="mt-4 rounded-2xl bg-black/25 p-3">
          <div className="font-black text-white">{penalty.challenge.title}</div>
          <div className="mt-1 text-sm font-semibold leading-6 text-white/60">
            {penalty.challenge.instructions}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PenaltyPanel({ state }: { state: PublicRoomState }) {
  if (!state.penalties?.length) {
    return null;
  }

  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
      <div className="mb-4 flex flex-wrap gap-2">
        <StateBadge label="Penalty Queue" tone="pink" />
        {state.activePenalty ? (
          <StateBadge label={state.activePenalty.teamName} tone="yellow" />
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {state.penalties.map((penalty) => (
          <PenaltyCard key={penalty.id} penalty={penalty} />
        ))}
      </div>
    </section>
  );
}

function LeaderboardPanel({ state }: { state: PublicRoomState }) {
  const sorted = [...state.leaderboard].sort((a, b) => b.score - a.score);

  return (
    <section className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
      <div className="mb-4 flex flex-wrap gap-2">
        <StateBadge label="Leaderboard" tone="green" />
        {state.phase === "FINAL_RESULTS" ? (
          <StateBadge label="Final" tone="yellow" />
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {sorted.map((team, index) => {
          const isWinner = state.finalWinnerTeamIds?.includes(team.teamId);

          return (
            <div
              key={team.teamId}
              className={`rounded-[1.25rem] border p-4 ${
                isWinner ? "border-yellow-200 bg-yellow-200/12" : "border-white/10 bg-white/[0.06]"
              }`}
              style={{ borderTop: `5px solid ${team.color}` }}
            >
              <div className="text-sm font-black uppercase tracking-[0.18em] text-white/45">
                Rank {index + 1}
              </div>
              <div className="mt-1 truncate text-xl font-black text-white">
                {team.name}
              </div>
              <div className="mt-4 text-4xl font-black text-white">
                {team.score}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function DisplayRoom({ roomCode }: DisplayRoomProps) {
  const normalizedRoomCode = roomCode.toUpperCase();
  const { state, error, loading, realtimeEnabled } =
    usePublicRoomState(normalizedRoomCode);

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-[1600px] gap-5 px-5 py-5">
      {loading ? (
        <div className="grid min-h-[60vh] place-items-center rounded-[2rem] border border-white/10 bg-[var(--game-card)] text-2xl font-black text-white/70">
          Loading display...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[1.5rem] border border-red-300/30 bg-red-500/10 p-6 text-xl font-black text-red-100">
          {error}
        </div>
      ) : null}

      {state ? (
        <>
          <section className="grid gap-5 rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_20%_10%,rgba(0,209,255,0.20),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(255,200,87,0.18),transparent_24%),var(--game-card)] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.35)] lg:grid-cols-[1fr_auto_auto] lg:items-center">
            <div>
              <div className="mb-4 flex flex-wrap gap-2">
                <StateBadge label={formatPhase(state.phase)} tone="cyan" />
                <StateBadge
                  label={realtimeEnabled ? "Live" : "Refresh Ready"}
                  tone={realtimeEnabled ? "green" : "neutral"}
                />
              </div>
              <h1 className="text-5xl font-black leading-none text-white md:text-7xl">
                {state.title}
              </h1>
              <p className="mt-4 max-w-3xl text-xl font-bold text-white/60">
                Join at {state.lobby.joinUrl}
              </p>
            </div>

            <TimerPanel state={state} />

            <div className="rounded-[1.5rem] bg-black/35 px-7 py-5 text-center">
              <div className="text-sm font-black uppercase tracking-[0.28em] text-white/40">
                Room Code
              </div>
              <div className="mt-2 text-6xl font-black tracking-[0.18em] text-yellow-200 md:text-7xl">
                {state.roomCode}
              </div>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
              <div className="text-sm font-black uppercase tracking-[0.22em] text-white/40">
                Players
              </div>
              <div className="mt-2 text-4xl font-black text-white">
                {state.lobby.activePlayerCount}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
              <div className="text-sm font-black uppercase tracking-[0.22em] text-white/40">
                Teams
              </div>
              <div className="mt-2 text-4xl font-black text-white">
                {state.teamCount}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
              <div className="text-sm font-black uppercase tracking-[0.22em] text-white/40">
                Round
              </div>
              <div className="mt-2 text-4xl font-black text-white">
                {state.currentRoundNumber || "Lobby"}
              </div>
            </div>
          </section>

          <LeadersPanel state={state} />
          <QuestionPanel state={state} />
          <ResultsPanel state={state} />
          <SavingGracePanel state={state} />
          <PenaltyPanel state={state} />
          <LeaderboardPanel state={state} />
          <TeamGrid state={state} />
        </>
      ) : null}
    </main>
  );
}
