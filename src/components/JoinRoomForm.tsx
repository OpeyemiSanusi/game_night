"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { playerTokenKey, writeStoredToken } from "@/lib/client-storage";
import { resizeAvatar } from "@/lib/client-avatar";

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [roomCode, setRoomCode] = useState(initialRoomCode.toUpperCase());
  const [displayName, setDisplayName] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [step, setStep] = useState<"pin" | "profile">("pin");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    return () => {
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarPreview]);

  function normalizedRoomCode() {
    return roomCode.replace(/[^a-z0-9]/gi, "").toUpperCase();
  }

  function continueToProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizedRoomCode();

    if (!normalized) {
      setError("Enter the game PIN.");
      return;
    }

    setRoomCode(normalized);
    setError(null);
    setStep("profile");
  }

  async function uploadAvatar(room: string, token: string, file: File) {
    const avatar = await resizeAvatar(file);
    const formData = new FormData();
    formData.set("avatar", avatar);

    await fetch(`/api/rooms/${encodeURIComponent(room)}/avatar`, {
      method: "POST",
      headers: { "x-player-token": token },
      body: formData,
    });
  }

  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const normalized = normalizedRoomCode();

    try {
      const response = await fetch(
        `/api/rooms/${encodeURIComponent(normalized)}/join`,
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

      if (avatarFile) {
        try {
          await uploadAvatar(payload.room.roomCode, payload.playerToken, avatarFile);
        } catch {
          // Joining should not fail because optional photo storage is unavailable.
        }
      }

      router.push(`/play/${payload.room.roomCode}`);
    } catch (joinError) {
      setError(
        joinError instanceof Error ? joinError.message : "Could not join room.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === "pin") {
    return (
      <form
        onSubmit={continueToProfile}
        className="w-full rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-6"
      >
        <div className="grid gap-4">
          <label className="grid gap-2">
            <span className="text-sm font-bold text-white/70">Game PIN</span>
            <input
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              className="h-16 rounded-2xl border border-white/10 bg-black/30 px-4 text-center text-2xl font-black uppercase tracking-[0.25em] text-white outline-none ring-pink-300/40 transition focus:ring-4"
              maxLength={8}
              autoCapitalize="characters"
              inputMode="text"
              required
            />
          </label>

          {error ? (
            <div className="rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            className="h-14 rounded-2xl bg-pink-300 px-5 text-base font-black text-black transition active:scale-[0.99]"
          >
            Continue
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      onSubmit={joinRoom}
      className="w-full rounded-[1.5rem] border border-white/10 bg-[var(--game-card)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-6"
    >
      <div className="grid gap-5">
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="grid h-32 w-32 place-items-center overflow-hidden rounded-[1.25rem] border border-white/15 bg-black/30 text-center text-sm font-black text-white/65 ring-pink-300/40 transition focus:outline-none focus:ring-4"
            aria-label="Choose profile photo"
          >
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarPreview}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span>Image</span>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;
              const previewUrl = file ? URL.createObjectURL(file) : null;
              setAvatarFile(file);
              setAvatarPreview(previewUrl);
            }}
          />
        </div>

        <label className="grid gap-2">
          <span className="text-sm font-bold text-white/70">Your name</span>
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="h-14 rounded-2xl border border-white/10 bg-black/30 px-4 text-base font-bold text-white outline-none ring-pink-300/40 transition focus:ring-4"
            maxLength={32}
            required
          />
        </label>

        {error ? (
          <div className="rounded-2xl border border-red-300/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-[0.8fr_1.2fr] gap-3">
          <button
            type="button"
            onClick={() => setStep("pin")}
            disabled={isSubmitting}
            className="h-14 rounded-2xl bg-white/10 px-5 text-base font-black text-white transition active:scale-[0.99] disabled:opacity-60"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="h-14 rounded-2xl bg-pink-300 px-5 text-base font-black text-black transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Joining..." : "Join Game"}
          </button>
        </div>
      </div>
    </form>
  );
}
