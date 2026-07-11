"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  playerTokenKey,
  readStoredToken,
} from "@/lib/client-storage";
import { usePublicRoomState } from "@/lib/use-public-room-state";
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
  CHALLENGE: "Challenge",
};

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

async function resizeAvatar(file: File) {
  const imageUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = imageUrl;
    });

    const size = Math.min(image.naturalWidth, image.naturalHeight);
    const sourceX = Math.max(0, (image.naturalWidth - size) / 2);
    const sourceY = Math.max(0, (image.naturalHeight - size) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas is not available in this browser.");
    }

    context.drawImage(image, sourceX, sourceY, size, size, 0, 0, 512, 512);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/webp", 0.82);
    });

    if (!blob) {
      throw new Error("Could not compress that image.");
    }

    return new File([blob], "avatar.webp", { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
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

export function PlayerRoom({ roomCode }: PlayerRoomProps) {
  const normalizedRoomCode = roomCode.toUpperCase();
  const [playerState, setPlayerState] = useState<PlayerStateResponse | null>(
    null,
  );
  const [tokenMissing, setTokenMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tokenKey = useMemo(
    () => playerTokenKey(normalizedRoomCode),
    [normalizedRoomCode],
  );
  const { state, realtimeEnabled } = usePublicRoomState(
    normalizedRoomCode,
    playerState?.publicState || null,
  );
  const publicState = state || playerState?.publicState || null;

  async function loadPlayerState() {
    const playerToken = readStoredToken(tokenKey);

    if (!playerToken) {
      setTokenMissing(true);
      setLoading(false);
      return;
    }

    setLoading(true);
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

  const typedPlayerState =
    playerState?.player && playerState.room ? (playerState as PlayerPrivateState) : null;
  const actions = typedPlayerState?.actions || {};
  const currentQuestion = publicState?.question;
  const selectedVote = typedPlayerState?.myVote || null;
  const submittedVoteName = actions.answerOptions?.find(
    (option) => option.id === selectedVote,
  )?.name;

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
          <div className="grid gap-3 sm:grid-cols-2">
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
          <div className="grid gap-3 sm:grid-cols-2">
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
