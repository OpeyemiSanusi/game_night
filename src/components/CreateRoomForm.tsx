"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DEFAULT_TEAM_COUNT, DEFAULT_TITLE } from "@/lib/config";
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
        body: JSON.stringify({
          title: DEFAULT_TITLE,
          teamCount: DEFAULT_TEAM_COUNT,
        }),
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
    <form onSubmit={createRoom} className="grid gap-3">
      {error ? (
        <div className="rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100">
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="h-16 rounded-2xl bg-cyan-300 px-6 text-lg font-black text-black transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Creating..." : "Create"}
      </button>
    </form>
  );
}
