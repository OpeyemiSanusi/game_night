import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { fail } from "@/lib/server/http";
import { hashToken, tokenHashesMatch } from "@/lib/server/tokens";
import { normalizeRoomCode } from "@/lib/validation";
import type { GamePhase, PlayerStatus } from "@/lib/types";

export interface RoomAuthRow {
  id: string;
  room_code: string;
  title: string;
  phase: GamePhase;
  team_count: number;
  current_round_number: number;
  settings: Record<string, unknown>;
  host_token_hash: string;
  phase_started_at: string | null;
  phase_ends_at: string | null;
  is_paused: boolean;
  remaining_ms_when_paused: number | null;
}

export interface PlayerAuthRow {
  id: string;
  room_id: string;
  team_id: string | null;
  display_name: string;
  initials: string;
  avatar_url: string | null;
  token_hash: string;
  join_order: number;
  status: PlayerStatus;
  is_connected: boolean;
}

export async function loadRoomByCode(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  rawRoomCode: string,
) {
  const roomCode = normalizeRoomCode(rawRoomCode);

  if (!roomCode) {
    return { response: fail("Enter a valid room code.", 400) };
  }

  const { data: room, error } = await supabase
    .from("rooms")
    .select(
      "id, room_code, title, phase, team_count, current_round_number, settings, host_token_hash, phase_started_at, phase_ends_at, is_paused, remaining_ms_when_paused",
    )
    .eq("room_code", roomCode)
    .maybeSingle<RoomAuthRow>();

  if (error) {
    return { response: fail(error.message, 500) };
  }

  if (!room) {
    return { response: fail("Room not found. Check the code and try again.", 404) };
  }

  return { room };
}

export async function requireHost(
  request: Request,
  rawRoomCode: string,
) {
  let supabase: ReturnType<typeof getSupabaseAdmin>;

  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    return {
      response: fail(
        error instanceof Error ? error.message : "Server is not configured.",
        500,
      ),
    };
  }

  const loaded = await loadRoomByCode(supabase, rawRoomCode);

  if (loaded.response || !loaded.room) {
    return { response: loaded.response };
  }

  const token = request.headers.get("x-host-token");

  if (!token || !tokenHashesMatch(token, loaded.room.host_token_hash)) {
    return { response: fail("Host session is not valid for this room.", 401) };
  }

  return { supabase, room: loaded.room };
}

export async function requirePlayer(
  request: Request,
  rawRoomCode: string,
) {
  let supabase: ReturnType<typeof getSupabaseAdmin>;

  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    return {
      response: fail(
        error instanceof Error ? error.message : "Server is not configured.",
        500,
      ),
    };
  }

  const loaded = await loadRoomByCode(supabase, rawRoomCode);

  if (loaded.response || !loaded.room) {
    return { response: loaded.response };
  }

  const token = request.headers.get("x-player-token");

  if (!token) {
    return { response: fail("Player token is required.", 401) };
  }

  const { data: player, error } = await supabase
    .from("players")
    .select(
      "id, room_id, team_id, display_name, initials, avatar_url, token_hash, join_order, status, is_connected",
    )
    .eq("room_id", loaded.room.id)
    .eq("token_hash", hashToken(token))
    .maybeSingle<PlayerAuthRow>();

  if (error) {
    return { response: fail(error.message, 500) };
  }

  if (!player) {
    return { response: fail("Player session was not found for this room.", 401) };
  }

  return { supabase, room: loaded.room, player };
}
