"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  playerTokenKey,
  readStoredToken,
} from "@/lib/client-storage";
import { resizeAvatar } from "@/lib/client-avatar";
import { usePublicRoomState } from "@/lib/use-public-room-state";
import { useSyncedTimer } from "@/lib/use-synced-timer";
import { Avatar } from "@/components/Avatar";
import { RoomStatusHeader } from "@/components/RoomStatusHeader";
import { TeamGrid } from "@/components/TeamGrid";
import { StateBadge } from "@/components/StateBadge";
import type {
  AnswerOption,
  ConsequenceChoice,
  PlayerPrivateState,
  PlayerPublic,
  PublicRoomState,
  SavingGraceCategory,
} from "@/lib/types";

interface PlayerRoomProps {
  roomCode: string;
}

interface PlayerStateResponse extends Partial<PlayerPrivateState> {
  publicState?: PublicRoomState;
  error?: string;
}

const categoryLabels: Record<SavingGraceCategory, string> = {
  TIME_OF_DAY: "Time of Day",
  NEXT_SENDER: "Who Replied Next?",
  REACTION_COUNT: "Reactions",
};

const consequenceLabels: Record<ConsequenceChoice, string> = {
  DRINK: "Drink",
  FLIP: "Flip",
  CHALLENGE: "Challenge",
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

function actionPath(roomCode: string, path: string) {
  return `/api/rooms/${encodeURIComponent(roomCode)}${path}`;
}

function readablePhase(phase: string) {
  return phase.replaceAll("_", " ").toLowerCase();
}

function getRoleMessage(playerState: PlayerPrivateState, publicState: PublicRoomState | null) {
  const phase = publicState?.phase || playerState.room.phase;

  if (playerState.role === "leader") {
    return "You are this round's Group Leader.";
  }

  if (playerState.role === "lamb") {
    return "You are the Sacrificial Lamb for this penalty.";
  }

  if (playerState.role === "rescuer") {
    return "You are the Rescuer for this flip.";
  }

  if (phase === "QUESTION_ACTIVE") {
    return "Vote before the timer ends. You can change your vote while voting is open.";
  }

  return playerState.message;
}

function OptionButton({
  option,
  selected,
  disabled,
  onClick,
}: {
  option: AnswerOption;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-16 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition disabled:opacity-60 ${
        selected
          ? "border-yellow-200 bg-yellow-200 text-black"
          : "border-white/10 bg-white/[0.07] text-white"
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
        size="md"
      />
      <span className="min-w-0 flex-1 truncate text-base font-black">
        {option.name}
      </span>
    </button>
  );
}

function PlayerPickButton({
  player,
  disabled,
  onClick,
}: {
  player: PlayerPublic;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-14 items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-left text-white disabled:opacity-60"
    >
      <Avatar player={player} size="md" />
      <span className="min-w-0 flex-1 truncate font-black">
        {player.displayName}
      </span>
    </button>
  );
}

function TeamMemberCard({ player }: { player: PlayerPublic }) {
  return (
    <div className="grid aspect-square min-h-28 place-items-center rounded-[1.25rem] border border-white/10 bg-white/[0.06] p-3 text-center">
      <Avatar player={player} size="lg" />
      <div className="mt-3 w-full truncate text-sm font-black text-white">
        {player.displayName}
      </div>
    </div>
  );
}

function StepTwoTopBar({
  state,
  team,
  seconds,
}: {
  state: PublicRoomState;
  team: PlayerPrivateState["team"];
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
          <div className="text-xs font-black uppercase text-black/45">Points</div>
          <div
            className="text-2xl font-black"
            style={{ fontFamily: "var(--game-comic-font)" }}
          >
            {team?.score || 0}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepTwoPrompt({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-48 place-items-center rounded-[1.75rem] bg-white p-6 text-center text-black shadow-[0_18px_45px_rgba(0,0,0,0.14)]">
      <h1
        className="text-3xl font-black leading-tight sm:text-4xl"
        style={{ fontFamily: "var(--game-comic-font)" }}
      >
        {children}
      </h1>
    </div>
  );
}

function StepTwoPlayerOption({
  player,
  selected,
  onClick,
}: {
  player: PlayerPublic;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid min-h-40 place-items-center rounded-[1.35rem] border-4 bg-white p-3 text-center transition ${
        selected ? "border-purple-700 shadow-[0_0_0_6px_rgba(126,34,206,0.22)]" : "border-white"
      }`}
    >
      <Avatar player={player} size="lg" />
      <span
        className={`mt-3 w-full truncate text-lg font-black ${
          selected ? "text-purple-700" : "text-black"
        }`}
        style={{ fontFamily: "var(--game-comic-font)" }}
      >
        {player.displayName}
      </span>
    </button>
  );
}

function StepTwoChoiceButton({
  label,
  remaining,
  selected,
  disabled,
  onClick,
}: {
  label: string;
  remaining?: number;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-24 rounded-[1.35rem] border-4 px-4 text-2xl font-black text-black transition disabled:cursor-not-allowed disabled:opacity-45 ${
        selected
          ? "border-purple-700 bg-white shadow-[0_0_0_6px_rgba(126,34,206,0.22)]"
          : "border-white bg-white/92"
      }`}
      style={{ fontFamily: "var(--game-comic-font)" }}
    >
      <span className="block">{label}</span>
      {typeof remaining === "number" ? (
        <span className="mt-1 block text-sm font-black text-black/45">
          {remaining} left
        </span>
      ) : null}
    </button>
  );
}

type LeaderChallengeOption = NonNullable<
  NonNullable<PlayerPrivateState["actions"]>["leaderChallengeOptions"]
>[number];

function StepTwoChallengeOption({
  challenge,
  selected,
  onClick,
}: {
  challenge: LeaderChallengeOption;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[1.35rem] border-4 bg-white p-4 text-left text-black transition ${
        selected ? "border-purple-700 shadow-[0_0_0_6px_rgba(126,34,206,0.22)]" : "border-white"
      }`}
    >
      <div
        className="text-xl font-black"
        style={{ fontFamily: "var(--game-comic-font)" }}
      >
        {challenge.title}
      </div>
      <div className="mt-2 text-sm font-bold leading-6 text-black/65">
        {challenge.instructions}
      </div>
    </button>
  );
}

function QuestionAnswerCard({
  option,
  selected,
  onClick,
}: {
  option: AnswerOption;
  selected: boolean;
  onClick: () => void;
}) {
  const player = {
    displayName: option.name,
    initials: option.name
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
    avatarUrl: option.avatarUrl || null,
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`grid min-h-40 place-items-center rounded-[1.35rem] border-4 bg-white p-3 text-center transition ${
        selected ? "border-purple-700 shadow-[0_0_0_6px_rgba(126,34,206,0.22)]" : "border-white"
      }`}
    >
      <Avatar player={player} size="lg" />
      <span
        className={`mt-3 w-full truncate text-lg font-black ${
          selected ? "text-purple-700" : "text-black"
        }`}
        style={{ fontFamily: "var(--game-comic-font)" }}
      >
        {option.name}
      </span>
    </button>
  );
}

type RoundResultTeam = NonNullable<PublicRoomState["roundResults"]>["teams"][number];

function playerOutcomeCopy(result: RoundResultTeam | undefined) {
  if (!result || result.outcome === "draw") {
    return {
      title: "This round was a draw",
      detail: "No team takes this one.",
    };
  }

  if (result.outcome === "winner") {
    return {
      title: "Your team won this round",
      detail: "+10 points",
    };
  }

  if (result.outcome === "last") {
    return {
      title: "Your team lost",
      detail: "Punishment is coming.",
    };
  }

  return {
    title: "Your group is mid",
    detail: "You are safe this round.",
  };
}

export function PlayerRoom({ roomCode }: PlayerRoomProps) {
  const normalizedRoomCode = roomCode.toUpperCase();
  const [playerState, setPlayerState] = useState<PlayerStateResponse | null>(
    null,
  );
  const [tokenMissing, setTokenMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [selectedStepTwoLambId, setSelectedStepTwoLambId] = useState("");
  const [selectedStepTwoChallengeId, setSelectedStepTwoChallengeId] = useState("");
  const [selectedStepTwoConsequence, setSelectedStepTwoConsequence] =
    useState<ConsequenceChoice | "">("");
  const [selectedQuestionVoteId, setSelectedQuestionVoteId] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastPrivateSyncVersionRef = useRef<number | null>(null);
  const tokenKey = useMemo(
    () => playerTokenKey(normalizedRoomCode),
    [normalizedRoomCode],
  );
  const { state, realtimeEnabled } = usePublicRoomState(
    normalizedRoomCode,
    playerState?.publicState || null,
  );
  const publicState = state || playerState?.publicState || null;
  const typedPlayerState =
    playerState?.player && playerState.room ? (playerState as PlayerPrivateState) : null;
  const timer = useSyncedTimer(publicState?.timer);
  const actions = typedPlayerState?.actions || {};

  async function loadPlayerState(options: { quiet?: boolean } = {}) {
    const playerToken = readStoredToken(tokenKey);

    if (!playerToken) {
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
        `/api/rooms/${encodeURIComponent(normalizedRoomCode)}/player-state`,
        {
          headers: { "x-player-token": playerToken },
          cache: "no-store",
        },
      );
      const payload = (await response.json()) as PlayerStateResponse;

      if (!response.ok || !payload.player || !payload.room) {
        throw new Error(payload.error || "Player state could not be loaded.");
      }

      setPlayerState(payload);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Player state could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadPlayerState();
    }, 0);

    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalizedRoomCode, tokenKey]);

  useEffect(() => {
    if (!publicState?.version || !typedPlayerState) {
      return;
    }

    if (lastPrivateSyncVersionRef.current === publicState.version) {
      return;
    }

    lastPrivateSyncVersionRef.current = publicState.version;
    const timeout = window.setTimeout(() => {
      void loadPlayerState({ quiet: true });
    }, 0);

    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicState?.version]);

  useEffect(() => {
    if (!typedPlayerState) {
      return;
    }

    const heartbeatInterval = window.setInterval(() => {
      void loadPlayerState({ quiet: true });
    }, 5000);

    return () => window.clearInterval(heartbeatInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typedPlayerState?.player.id]);

  async function postPlayer(path: string, body: Record<string, unknown>, busy: string) {
    const token = readStoredToken(tokenKey);

    if (!token) {
      setTokenMissing(true);
      return;
    }

    setBusyAction(busy);
    setError(null);

    try {
      const response = await fetch(actionPath(normalizedRoomCode, path), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-player-token": token,
        },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Action failed.");
      }

      await loadPlayerState();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Action failed.");
    } finally {
      setBusyAction(null);
    }
  }

  async function uploadAvatar(file: File) {
    const token = readStoredToken(tokenKey);

    if (!token) {
      setTokenMissing(true);
      return;
    }

    setBusyAction("AVATAR");
    setError(null);

    try {
      const avatar = await resizeAvatar(file);
      const formData = new FormData();
      formData.set("avatar", avatar);

      const response = await fetch(actionPath(normalizedRoomCode, "/avatar"), {
        method: "POST",
        headers: { "x-player-token": token },
        body: formData,
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Avatar upload failed.");
      }

      await loadPlayerState();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Avatar upload failed.",
      );
    } finally {
      setBusyAction(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  if (tokenMissing) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-4 py-8">
        <div className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-6 text-center">
          <h1 className="text-2xl font-black text-white">Join this room</h1>
          <p className="mt-3 text-white/60">
            This browser does not have a player session for {normalizedRoomCode}.
          </p>
          <Link
            href={`/join?room=${normalizedRoomCode}`}
            className="mt-6 inline-flex h-12 items-center justify-center rounded-2xl bg-pink-300 px-5 font-black text-black"
          >
            Join Room
          </Link>
        </div>
      </main>
    );
  }

  if (
    typedPlayerState &&
    publicState &&
    (publicState.phase === "LOBBY" || publicState.phase === "TEAM_SETUP")
  ) {
    const team = typedPlayerState.team;

    return (
      <main className="mx-auto grid min-h-dvh w-full max-w-xl content-start gap-7 px-4 py-8">
        {error ? (
          <div className="rounded-[1.25rem] border border-red-300/30 bg-red-500/10 p-4 font-semibold text-red-100">
            {error}
          </div>
        ) : null}

        <section className="pt-4 text-center">
          <div className="text-sm font-black uppercase tracking-[0.24em] text-white/45">
            Waiting for game to start
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busyAction === "AVATAR"}
            className="mx-auto mt-6 rounded-full disabled:opacity-60"
            aria-label="Upload avatar"
          >
            <Avatar player={typedPlayerState.player} size="lg" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                void uploadAvatar(file);
              }
            }}
          />
          <h1 className="mt-5 text-3xl font-black leading-tight text-white">
            You are in{" "}
            <span style={{ color: team?.color || "#ffffff" }}>
              {team?.name || "a team"}
            </span>
          </h1>
          {busyAction === "AVATAR" ? (
            <div className="mt-3 text-sm font-bold text-white/50">
              Uploading photo...
            </div>
          ) : null}
        </section>

        <section className="grid gap-3">
          <h2 className="text-base font-black text-white">Team members</h2>
          {team?.players.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {team.players.map((player) => (
                <TeamMemberCard key={player.id} player={player} />
              ))}
            </div>
          ) : (
            <div className="rounded-[1.25rem] border border-white/10 bg-[var(--game-card)] p-5 text-center font-bold text-white/55">
              Waiting for players to join
            </div>
          )}
        </section>
      </main>
    );
  }

  if (
    typedPlayerState &&
    publicState &&
    publicState.phase === "CHALLENGE_SELECTION"
  ) {
    const isLeader = typedPlayerState.role === "leader";
    const lambDone = Boolean(actions.selectedLambPlayerId);
    const challengeDone = Boolean(actions.selectedChallengeId);
    const selectedLambId =
      selectedStepTwoLambId || actions.selectedLambPlayerId || "";
    const selectedChallengeId =
      selectedStepTwoChallengeId || actions.selectedChallengeId || "";
    const selectedConsequence =
      selectedStepTwoConsequence || actions.myConsequenceChoice || "";
    const challenge = actions.leaderChallengeOptions?.find(
      (option) => option.challengeId === selectedChallengeId,
    );
    const leaderWaiting = isLeader && lambDone && challengeDone;
    const playerWaiting = !isLeader && Boolean(actions.myConsequenceChoice);

    return (
      <main
        className="min-h-dvh px-4 py-6 text-black"
        style={{ background: "var(--step-two-gradient)" }}
      >
        <div className="mx-auto grid w-full max-w-3xl gap-6">
          <StepTwoTopBar
            state={publicState}
            team={typedPlayerState.team}
            seconds={timer.seconds}
          />

          {error ? (
            <div className="rounded-[1.25rem] border border-red-200 bg-white px-4 py-3 font-bold text-red-700">
              {error}
            </div>
          ) : null}

          {isLeader ? (
            <div className="text-center">
              <div
                className="text-xl font-black text-white drop-shadow"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                You are the group leader
              </div>
            </div>
          ) : null}

          {isLeader && !lambDone ? (
            <>
              <StepTwoPrompt>Pick a sacrificial lamb</StepTwoPrompt>
              {(actions.lambOptions || []).length > 0 ? (
                <>
                  <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {(actions.lambOptions || []).map((player) => (
                      <StepTwoPlayerOption
                        key={player.id}
                        player={player}
                        selected={selectedLambId === player.id}
                        onClick={() => setSelectedStepTwoLambId(player.id)}
                      />
                    ))}
                  </section>
                  <button
                    type="button"
                    disabled={!selectedLambId || Boolean(busyAction)}
                    onClick={() =>
                      void postPlayer(
                        "/leader/sacrificial-lamb",
                        { lambPlayerId: selectedLambId },
                        `LAMB_${selectedLambId}`,
                      )
                    }
                    className="h-16 rounded-[1.25rem] bg-purple-700 px-6 text-2xl font-black text-white shadow-[0_18px_40px_rgba(80,20,140,0.35)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ fontFamily: "var(--game-comic-font)" }}
                  >
                    {busyAction?.startsWith("LAMB_") ? "Saving..." : "Done"}
                  </button>
                </>
              ) : (
                <StepTwoPrompt>Waiting for a teammate to join your team</StepTwoPrompt>
              )}
            </>
          ) : null}

          {isLeader && lambDone && !challengeDone ? (
            <>
              <StepTwoPrompt>
                Pick a challenge for{" "}
                {actions.leaderChallengeOptions?.[0]?.targetTeamName || "their group"}
              </StepTwoPrompt>
              <section className="grid gap-3">
                {(actions.leaderChallengeOptions || []).map((option) => (
                  <StepTwoChallengeOption
                    key={option.challengeId}
                    challenge={option}
                    selected={selectedChallengeId === option.challengeId}
                    onClick={() => setSelectedStepTwoChallengeId(option.challengeId)}
                  />
                ))}
              </section>
              <button
                type="button"
                disabled={!challenge || Boolean(busyAction)}
                onClick={() =>
                  challenge
                    ? void postPlayer(
                        "/leader/challenge",
                        {
                          assignmentId: challenge.assignmentId,
                          challengeId: challenge.challengeId,
                        },
                        `CHALLENGE_${challenge.challengeId}`,
                      )
                    : undefined
                }
                className="h-16 rounded-[1.25rem] bg-purple-700 px-6 text-2xl font-black text-white shadow-[0_18px_40px_rgba(80,20,140,0.35)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                {busyAction?.startsWith("CHALLENGE_") ? "Saving..." : "Done"}
              </button>
            </>
          ) : null}

          {!isLeader && !playerWaiting ? (
            <>
              <StepTwoPrompt>Pick your punishment</StepTwoPrompt>
              <section className="grid gap-3 sm:grid-cols-3">
                {(actions.consequenceOptions || []).map((choice) => (
                  <StepTwoChoiceButton
                    key={choice}
                    label={consequenceLabels[choice]}
                    remaining={actions.consequenceRemaining?.[choice]}
                    selected={selectedConsequence === choice}
                    disabled={actions.consequenceRemaining?.[choice] === 0}
                    onClick={() => setSelectedStepTwoConsequence(choice)}
                  />
                ))}
              </section>
              <button
                type="button"
                disabled={!selectedConsequence || Boolean(busyAction)}
                onClick={() =>
                  selectedConsequence
                    ? void postPlayer(
                        "/player/consequence",
                        { choice: selectedConsequence },
                        `CONSEQUENCE_${selectedConsequence}`,
                      )
                    : undefined
                }
                className="h-16 rounded-[1.25rem] bg-purple-700 px-6 text-2xl font-black text-white shadow-[0_18px_40px_rgba(80,20,140,0.35)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                {busyAction?.startsWith("CONSEQUENCE_") ? "Saving..." : "Done"}
              </button>
            </>
          ) : null}

          {leaderWaiting || playerWaiting ? (
            <StepTwoPrompt>Waiting for player selection</StepTwoPrompt>
          ) : null}
        </div>
      </main>
    );
  }

  const currentQuestion = publicState?.question;
  const selectedVote = typedPlayerState?.myVote || null;
  const submittedVoteName = actions.answerOptions?.find(
    (option) => option.id === selectedVote,
  )?.name;

  if (
    typedPlayerState &&
    publicState &&
    publicState.phase === "QUESTION_ACTIVE" &&
    currentQuestion
  ) {
    const voteId = selectedQuestionVoteId || selectedVote || "";
    const selectedAnswer = actions.answerOptions?.find(
      (option) => option.id === voteId,
    );

    return (
      <main
        className="min-h-dvh px-4 py-6 text-black"
        style={{ background: "var(--step-two-gradient)" }}
      >
        <div className="mx-auto grid w-full max-w-3xl gap-6">
          <StepTwoTopBar
            state={publicState}
            team={typedPlayerState.team}
            seconds={timer.seconds}
          />

          {error ? (
            <div className="rounded-[1.25rem] border border-red-200 bg-white px-4 py-3 font-bold text-red-700">
              {error}
            </div>
          ) : null}

          <div
            className="text-center text-3xl font-black text-white drop-shadow"
            style={{ fontFamily: "var(--game-comic-font)" }}
          >
            Who Said?
          </div>

          <StepTwoPrompt>{currentQuestion.quote}</StepTwoPrompt>

          {selectedVote ? (
            <StepTwoPrompt>Waiting for review</StepTwoPrompt>
          ) : (
            <>
              <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {(actions.answerOptions || []).map((option) => (
                  <QuestionAnswerCard
                    key={option.id}
                    option={option}
                    selected={voteId === option.id}
                    onClick={() => setSelectedQuestionVoteId(option.id)}
                  />
                ))}
              </section>
              <button
                type="button"
                disabled={!selectedAnswer || Boolean(busyAction)}
                onClick={() =>
                  selectedAnswer
                    ? void postPlayer(
                        "/vote",
                        { answerId: selectedAnswer.id },
                        `VOTE_${selectedAnswer.id}`,
                      )
                    : undefined
                }
                className="h-16 rounded-[1.25rem] bg-purple-700 px-6 text-2xl font-black text-white shadow-[0_18px_40px_rgba(80,20,140,0.35)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                {busyAction?.startsWith("VOTE_") ? "Saving..." : "Done"}
              </button>
            </>
          )}
        </div>
      </main>
    );
  }

  if (
    typedPlayerState &&
    publicState &&
    (publicState.phase === "ANSWER_REVEAL" || publicState.phase === "ROUND_DRAW") &&
    publicState.roundResults
  ) {
    const result = publicState.roundResults.teams.find(
      (team) => team.teamId === typedPlayerState.team?.id,
    );
    const copy = playerOutcomeCopy(result);

    return (
      <main
        className="min-h-dvh px-4 py-6 text-black"
        style={{ background: "var(--step-two-gradient)" }}
      >
        <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-3xl content-center gap-6">
          {error ? (
            <div className="rounded-[1.25rem] border border-red-200 bg-white px-4 py-3 font-bold text-red-700">
              {error}
            </div>
          ) : null}

          <section className="grid grid-cols-2 gap-3">
            <div className="grid min-h-20 place-items-center rounded-[1.25rem] bg-white px-3 text-center text-black shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
              <div>
                <div className="text-xs font-black uppercase text-black/45">Round</div>
                <div
                  className="text-2xl font-black"
                  style={{ fontFamily: "var(--game-comic-font)" }}
                >
                  {publicState.currentRoundNumber}/{publicState.totalRounds}
                </div>
              </div>
            </div>
            <div className="grid min-h-20 place-items-center rounded-[1.25rem] bg-white px-3 text-center text-black shadow-[0_12px_30px_rgba(0,0,0,0.12)]">
              <div>
                <div className="text-xs font-black uppercase text-black/45">Points</div>
                <div
                  className="text-2xl font-black"
                  style={{ fontFamily: "var(--game-comic-font)" }}
                >
                  {typedPlayerState.team?.score || 0}
                </div>
              </div>
            </div>
          </section>

          <section className="grid min-h-72 place-items-center rounded-[1.75rem] bg-white p-6 text-center text-black shadow-[0_18px_45px_rgba(0,0,0,0.14)]">
            <div>
              <h1
                className="text-4xl font-black leading-tight sm:text-6xl"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                {copy.title}
              </h1>
              <div
                className="mt-5 text-3xl font-black text-purple-700"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                {copy.detail}
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (
    typedPlayerState &&
    publicState &&
    isPunishmentPhase(publicState.phase)
  ) {
    return (
      <main
        className="min-h-dvh px-4 py-6 text-black"
        style={{ background: "var(--step-two-gradient)" }}
      >
        <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-3xl content-center gap-6">
          <section className="grid min-h-72 place-items-center rounded-[1.75rem] bg-white p-6 text-center text-black shadow-[0_18px_45px_rgba(0,0,0,0.14)]">
            <div>
              <h1
                className="text-4xl font-black leading-tight sm:text-6xl"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                Waiting for punishments
              </h1>
              <div className="mt-4 font-black text-black/45">
                Watch the game master screen.
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  if (
    typedPlayerState &&
    publicState &&
    publicState.phase === "FINAL_RESULTS"
  ) {
    const winners = publicState.leaderboard.filter((team) =>
      publicState.finalWinnerTeamIds?.includes(team.teamId),
    );
    const winnerNames = winners.map((team) => team.name).join(", ") || "No winner";
    const myTeamWon = Boolean(
      typedPlayerState.team &&
        publicState.finalWinnerTeamIds?.includes(typedPlayerState.team.id),
    );

    return (
      <main
        className="min-h-dvh px-4 py-6 text-black"
        style={{ background: "var(--step-two-gradient)" }}
      >
        <div className="mx-auto grid min-h-[calc(100dvh-3rem)] w-full max-w-3xl content-center gap-6">
          <section className="grid min-h-72 place-items-center rounded-[1.75rem] bg-white p-6 text-center text-black shadow-[0_18px_45px_rgba(0,0,0,0.14)]">
            <div>
              <h1
                className="text-4xl font-black leading-tight sm:text-6xl"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                {winnerNames}
              </h1>
              <div
                className="mt-5 text-3xl font-black text-purple-700"
                style={{ fontFamily: "var(--game-comic-font)" }}
              >
                {myTeamWon ? "Your team won the game" : "won the game"}
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-5xl gap-5 px-4 py-5">
      {publicState ? (
        <RoomStatusHeader
          state={publicState}
          realtimeEnabled={realtimeEnabled}
        />
      ) : null}

      {loading ? (
        <div className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-6 font-bold text-white/70">
          Restoring player session...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-[1.5rem] border border-red-300/30 bg-red-500/10 p-5 font-semibold text-red-100">
          {error}
        </div>
      ) : null}

      {typedPlayerState ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busyAction === "AVATAR"}
              className="rounded-full disabled:opacity-60"
              aria-label="Upload avatar"
            >
              <Avatar player={typedPlayerState.player} size="lg" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  void uploadAvatar(file);
                }
              }}
            />
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap gap-2">
                <StateBadge label={typedPlayerState.role} tone="green" />
                <StateBadge
                  label={typedPlayerState.team?.name || "No team yet"}
                  tone="yellow"
                />
              </div>
              <h1 className="truncate text-2xl font-black text-white">
                {typedPlayerState.player.displayName}
              </h1>
              <p className="mt-1 text-sm font-semibold text-white/55">
                {getRoleMessage(typedPlayerState, publicState)}
              </p>
            </div>
          </div>

          {busyAction === "AVATAR" ? (
            <div className="mt-4 rounded-2xl bg-black/25 p-3 text-sm font-bold text-white/60">
              Uploading photo...
            </div>
          ) : null}
        </section>
      ) : null}

      {publicState?.timer.phaseEndsAt ? (
        <section className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-[1.5rem] border border-cyan-300/20 bg-cyan-300/10 p-5">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.22em] text-cyan-100/60">
              Timer
            </div>
            <div className="mt-1 font-bold text-white/60">
              {publicState.timer.isPaused
                ? "Paused"
                : timer.isExpired
                  ? "Time is up"
                  : "Synced with the room"}
            </div>
          </div>
          <div className="min-w-24 rounded-2xl bg-black/35 px-5 py-3 text-center text-4xl font-black text-cyan-100">
            {timer.seconds ?? "--"}
          </div>
        </section>
      ) : null}

      {currentQuestion ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card-strong)] p-5">
          <div className="mb-3 flex flex-wrap gap-2">
            <StateBadge label={`Round ${currentQuestion.roundNumber}`} tone="cyan" />
            {selectedVote ? (
              <StateBadge label="Vote submitted" tone="green" />
            ) : (
              <StateBadge label="Waiting on vote" tone="neutral" />
            )}
          </div>
          <h2 className="text-2xl font-black leading-tight text-white">
            {currentQuestion.quote}
          </h2>
          {actions.canVote && actions.answerOptions ? (
            <div className="mt-5 grid gap-3">
              {actions.answerOptions.map((option) => (
                <OptionButton
                  key={option.id}
                  option={option}
                  selected={selectedVote === option.id}
                  disabled={Boolean(busyAction)}
                  onClick={() =>
                    void postPlayer("/vote", { answerId: option.id }, `VOTE_${option.id}`)
                  }
                />
              ))}
            </div>
          ) : null}
          {!actions.canVote && submittedVoteName ? (
            <p className="mt-4 rounded-2xl bg-black/25 p-3 font-bold text-white/65">
              Your vote: {submittedVoteName}
            </p>
          ) : null}
        </section>
      ) : null}

      {typedPlayerState && publicState?.roundResults ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
          <div className="text-xs font-black uppercase tracking-[0.22em] text-white/40">
            Answer
          </div>
          <h2 className="mt-2 text-2xl font-black text-yellow-100">
            {publicState.roundResults.revealedAnswer?.correctAnswerName}
          </h2>
          <p className="mt-2 font-bold text-white/60">
            {selectedVote === publicState.roundResults.revealedAnswer?.correctAnswerId
              ? "You were correct."
              : "Your vote was not correct."}
          </p>
        </section>
      ) : null}

      {actions.leaderChallengeOptions?.length ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
          <div className="mb-3 flex flex-wrap gap-2">
            <StateBadge label="Group Leader" tone="pink" />
            <StateBadge label="Choose Challenge" tone="cyan" />
            <StateBadge
              label={`For ${actions.leaderChallengeOptions[0].targetTeamName}`}
              tone="yellow"
            />
          </div>
          <div className="grid gap-3">
            {actions.leaderChallengeOptions.map((challenge) => (
              <button
                key={challenge.challengeId}
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() =>
                  void postPlayer(
                    "/leader/challenge",
                    {
                      assignmentId: challenge.assignmentId,
                      challengeId: challenge.challengeId,
                    },
                    `CHALLENGE_${challenge.challengeId}`,
                  )
                }
                className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 text-left text-white disabled:opacity-60"
              >
                <div className="font-black">{challenge.title}</div>
                <div className="mt-1 text-sm font-semibold leading-6 text-white/60">
                  {challenge.instructions}
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {actions.savingGraceCategories?.length ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
          <div className="mb-3 flex flex-wrap gap-2">
            <StateBadge label="Saving Grace" tone="yellow" />
            <StateBadge label="Leader Picks Category" tone="pink" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {actions.savingGraceCategories.map((category) => (
              <button
                key={category}
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() =>
                  void postPlayer(
                    "/leader/saving-grace-category",
                    { category },
                    `SG_${category}`,
                  )
                }
                className="min-h-16 rounded-2xl bg-yellow-200 px-4 font-black text-black disabled:opacity-60"
              >
                {categoryLabels[category]}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {actions.savingGraceQuestion ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
          <div className="mb-3 flex flex-wrap gap-2">
            <StateBadge
              label={categoryLabels[actions.savingGraceQuestion.category]}
              tone="yellow"
            />
          </div>
          <h2 className="text-2xl font-black text-white">
            {actions.savingGraceQuestion.prompt}
          </h2>
          <div className="mt-5 grid gap-3">
            {actions.savingGraceQuestion.options.map((answer) => (
              <button
                key={answer}
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() =>
                  void postPlayer(
                    "/leader/saving-grace-answer",
                    { answer },
                    `SG_ANSWER_${answer}`,
                  )
                }
                className="min-h-14 rounded-2xl border border-white/10 bg-white/[0.07] px-4 text-left font-black text-white disabled:opacity-60"
              >
                {answer}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {actions.lambOptions?.length ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
          <div className="mb-3 flex flex-wrap gap-2">
            <StateBadge label="Sacrificial Lamb" tone="pink" />
            <StateBadge label="Leader Chooses" tone="cyan" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {actions.lambOptions.map((player) => (
              <PlayerPickButton
                key={player.id}
                player={player}
                disabled={Boolean(busyAction)}
                onClick={() =>
                  void postPlayer(
                    "/leader/sacrificial-lamb",
                    { lambPlayerId: player.id },
                    `LAMB_${player.id}`,
                  )
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      {actions.consequenceOptions?.length ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
          <div className="mb-3 flex flex-wrap gap-2">
            <StateBadge label="Choose Consequence" tone="pink" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {actions.consequenceOptions.map((choice) => (
              <button
                key={choice}
                type="button"
                disabled={Boolean(busyAction)}
                onClick={() =>
                  void postPlayer(
                    "/player/consequence",
                    { choice },
                    `CONSEQUENCE_${choice}`,
                  )
                }
                className="min-h-16 rounded-2xl bg-pink-300 px-4 text-xl font-black text-black disabled:opacity-60"
              >
                {consequenceLabels[choice]}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {actions.rescuerOptions?.length ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
          <div className="mb-3 flex flex-wrap gap-2">
            <StateBadge label="Choose Rescuer" tone="green" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {actions.rescuerOptions.map((player) => (
              <PlayerPickButton
                key={player.id}
                player={player}
                disabled={Boolean(busyAction)}
                onClick={() =>
                  void postPlayer(
                    "/player/rescuer",
                    { rescuerPlayerId: player.id },
                    `RESCUER_${player.id}`,
                  )
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      {!currentQuestion &&
      !actions.leaderChallengeOptions?.length &&
      !actions.savingGraceCategories?.length &&
      !actions.savingGraceQuestion &&
      !actions.lambOptions?.length &&
      !actions.consequenceOptions?.length &&
      !actions.rescuerOptions?.length &&
      publicState ? (
        <section className="rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-5">
          <div className="text-xs font-black uppercase tracking-[0.22em] text-white/40">
            Current Phase
          </div>
          <div className="mt-1 text-xl font-black text-white">
            {readablePhase(publicState.phase)}
          </div>
        </section>
      ) : null}

      {publicState ? <TeamGrid state={publicState} compact /> : null}
    </main>
  );
}
