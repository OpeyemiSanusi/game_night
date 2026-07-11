"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { PublicRoomState } from "@/lib/types";

interface PublicStateResponse {
  publicState?: PublicRoomState;
  error?: string;
}

export function usePublicRoomState(
  roomCode: string,
  initialState?: PublicRoomState | null,
) {
  const normalizedRoomCode = roomCode.toUpperCase();
  const [state, setState] = useState<PublicRoomState | null>(
    initialState || null,
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialState);
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadPublicState() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/rooms/${encodeURIComponent(normalizedRoomCode)}/public-state`,
          { cache: "no-store" },
        );
        const payload = (await response.json()) as PublicStateResponse;

        if (!response.ok || !payload.publicState) {
          throw new Error(payload.error || "Public state could not be loaded.");
        }

        if (isMounted) {
          setState(payload.publicState);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Public state could not be loaded.",
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadPublicState();

    return () => {
      isMounted = false;
    };
  }, [normalizedRoomCode]);

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();

    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel(`room:${normalizedRoomCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "public_room_state",
          filter: `room_code=eq.${normalizedRoomCode}`,
        },
        (payload) => {
          const record = payload.new as { state?: PublicRoomState };

          if (record.state) {
            setState(record.state);
          }
        },
      )
      .subscribe((status) => {
        setRealtimeEnabled(status === "SUBSCRIBED");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [normalizedRoomCode]);

  return { state, error, loading, realtimeEnabled };
}
