"use client";

import { useEffect, useState } from "react";
import type { PublicTimerState } from "@/lib/types";

interface TimeResponse {
  serverTime?: string;
  epochMs?: number;
}

async function readServerOffsetMs() {
  const startedAt = Date.now();
  const response = await fetch("/api/time", { cache: "no-store" });
  const endedAt = Date.now();
  const payload = (await response.json()) as TimeResponse;

  if (!response.ok || (!payload.serverTime && typeof payload.epochMs !== "number")) {
    throw new Error("Server time unavailable.");
  }

  const midpoint = startedAt + (endedAt - startedAt) / 2;
  const serverMs =
    typeof payload.epochMs === "number"
      ? payload.epochMs
      : new Date(payload.serverTime || "").getTime();

  return serverMs - midpoint;
}

export function useSyncedTimer(timer?: PublicTimerState | null) {
  const [offsetMs, setOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    let isMounted = true;

    async function sync() {
      try {
        const offset = await readServerOffsetMs();

        if (isMounted) {
          setOffsetMs(offset);
        }
      } catch {
        if (isMounted) {
          setOffsetMs(0);
        }
      }
    }

    void sync();
    const syncInterval = window.setInterval(() => void sync(), 180_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void sync();
      }
    };

    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      isMounted = false;
      window.clearInterval(syncInterval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    const tick = window.setInterval(() => setNowMs(Date.now()), 250);

    return () => window.clearInterval(tick);
  }, []);

  if (!timer?.phaseEndsAt) {
    return { remainingMs: null, seconds: null, isExpired: false };
  }

  const remainingMs = timer.isPaused
    ? Math.max(0, timer.remainingMsWhenPaused || 0)
    : Math.max(0, new Date(timer.phaseEndsAt).getTime() - (nowMs + offsetMs));

  return {
    remainingMs,
    seconds: Math.ceil(remainingMs / 1000),
    isExpired: remainingMs <= 0,
  };
}
