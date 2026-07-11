"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_TEAM_COUNT } from "@/lib/config";
import { hostTokenKey, writeStoredToken } from "@/lib/client-storage";

interface CreateRoomResponse {
  room?: {
    roomCode: string;
  };
  hostToken?: string;
  urls?: {
    host: string;
  };
  error?: string;
}

export function CreateRoomForm() {
  const router = useRouter();
  const [title, setTitle] = useState("Who Said That?");
  const [teamCount, setTeamCount] = useState(DEFAULT_TEAM_COUNT);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/rooms/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, teamCount }),
      });
      const payload = (await response.json()) as CreateRoomResponse;

      if (!response.ok || !payload.room || !payload.hostToken) {
        throw new Error(payload.error || "Room could not be created.");
      }

      writeStoredToken(hostTokenKey(payload.room.roomCode), payload.hostToken);
      router.push(`/host/${payload.room.roomCode}`);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Room could not be created.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={createRoom}
      className="w-full rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-6"
    >
      <div className="grid gap-4">
        <label className="grid gap-2">
          <span className="text-sm font-bold text-white/70">Game title</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="h-13 rounded-2xl border border-white/10 bg-black/30 px-4 text-base font-bold text-white outline-none ring-cyan-300/40 transition focus:ring-4"
            maxLength={80}
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-bold text-white/70">
            Number of teams
          </span>
          <select
            value={teamCount}
            onChange={(event) => setTeamCount(Number(event.target.value))}
            className="h-13 rounded-2xl border border-white/10 bg-black/30 px-4 text-base font-bold text-white outline-none ring-cyan-300/40 transition focus:ring-4"
          >
            {[3, 4, 5, 6, 7, 8].map((count) => (
              <option key={count} value={count}>
                {count} teams
              </option>
            ))}
          </select>
        </label>

        {error ? (
          <div className="rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="h-14 rounded-2xl bg-cyan-300 px-5 text-base font-black text-black transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? "Creating Room..." : "Create Host Room"}
        </button>
      </div>
    </form>
  );
}
