"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { playerTokenKey, writeStoredToken } from "@/lib/client-storage";

interface JoinRoomResponse {
  room?: {
    roomCode: string;
  };
  playerToken?: string;
  error?: string;
}

interface JoinRoomFormProps {
  initialRoomCode?: string;
}

export function JoinRoomForm({ initialRoomCode = "" }: JoinRoomFormProps) {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState(initialRoomCode.toUpperCase());
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const normalizedRoomCode = roomCode.replace(/[^a-z0-9]/gi, "").toUpperCase();

    try {
      const response = await fetch(
        `/api/rooms/${encodeURIComponent(normalizedRoomCode)}/join`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ displayName }),
        },
      );
      const payload = (await response.json()) as JoinRoomResponse;

      if (!response.ok || !payload.room || !payload.playerToken) {
        throw new Error(payload.error || "Could not join room.");
      }

      writeStoredToken(playerTokenKey(payload.room.roomCode), payload.playerToken);
      router.push(`/play/${payload.room.roomCode}`);
    } catch (joinError) {
      setError(
        joinError instanceof Error ? joinError.message : "Could not join room.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={joinRoom}
      className="w-full rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-6"
    >
      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-bold text-white/70">Room code</span>
          <input
            value={roomCode}
            onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
            className="h-14 rounded-2xl border border-white/10 bg-black/30 px-4 text-center text-2xl font-black uppercase tracking-[0.25em] text-white outline-none ring-pink-300/40 transition focus:ring-4"
            maxLength={8}
            autoCapitalize="characters"
            inputMode="text"
            required
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-bold text-white/70">Display name</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="h-14 rounded-2xl border border-white/10 bg-black/30 px-4 text-base font-bold text-white outline-none ring-pink-300/40 transition focus:ring-4"
            maxLength={32}
            required
          />
        </label>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-semibold text-white/55">
          Photo upload lands in the next phase. For now, your initials will be
          used in rosters and answer options.
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="h-14 rounded-2xl bg-pink-300 px-5 text-base font-black text-black transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Joining..." : "Join Game"}
        </button>
      </div>
    </form>
  );
}
