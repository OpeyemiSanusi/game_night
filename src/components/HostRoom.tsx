"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { hostTokenKey, readStoredToken } from "@/lib/client-storage";
import { usePublicRoomState } from "@/lib/use-public-room-state";
import { RoomStatusHeader } from "@/components/RoomStatusHeader";
import { TeamGrid } from "@/components/TeamGrid";
import { StateBadge } from "@/components/StateBadge";
import type { HostAction, HostPrivateState, PublicRoomState } from "@/lib/types";

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
  ANSWER_REVEAL: ["START_SAVING_GRACE", "NEXT_ROUND"],
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

function labelForAction(action: HostAction) {
  return action
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function HostRoom({ roomCode, view = "host" }: HostRoomProps) {
  const normalizedRoomCode = roomCode.toUpperCase();
  const [hostState, setHostState] = useState<HostPrivateState | null>(null);
  const [tokenMissing, setTokenMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [rounds, setRounds] = useState(8);
  const [questionTimerSeconds, setQuestionTimerSeconds] = useState(25);
  const [selectedQuestionPackId, setSelectedQuestionPackId] = useState("");
  const [selectedChallengeDeckId, setSelectedChallengeDeckId] = useState("");
  const lastHostSyncVersionRef = useRef<number | null>(null);
  const { state, realtimeEnabled } = usePublicRoomState(
    normalizedRoomCode,
    hostState?.publicState || null,
  );
  const publicState = state || hostState?.publicState || null;
  const tokenKey = useMemo(() => hostTokenKey(normalizedRoomCode), [normalizedRoomCode]);

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
      setRounds(Number(payload.room.settings.rounds) || 8);
      setQuestionTimerSeconds(
        Number(payload.room.settings.questionTimerSeconds) || 25,
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
      return;
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
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed.");
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
