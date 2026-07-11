import { getAppUrl } from "@/lib/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { fail, ok, readJsonObject } from "@/lib/server/http";
import { rebuildPublicRoomState } from "@/lib/server/room-state";
import { hashToken, makeToken } from "@/lib/server/tokens";
import {
  cleanDisplayName,
  makeInitials,
  normalizeRoomCode,
} from "@/lib/validation";
import type { GamePhase, PlayerStatus } from "@/lib/types";

export const runtime = "nodejs";

interface RoomRow {
  id: string;
  room_code: string;
  title: string;
  phase: GamePhase;
  team_count: number;
}

interface TeamRow {
  id: string;
  team_index: number;
}

interface PlayerRow {
  id: string;
  team_id: string | null;
  status: PlayerStatus;
  join_order: number;
}

interface NewPlayerRow {
  id: string;
  team_id: string | null;
  display_name: string;
  initials: string;
  join_order: number;
  status: PlayerStatus;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode: rawRoomCode } = await context.params;
  const roomCode = normalizeRoomCode(rawRoomCode);

  if (!roomCode) {
    return fail("Enter a valid room code.", 400);
  }

  const body = await readJsonObject(request);

  if (!body) {
    return fail("Expected a JSON object.");
  }

  const displayName = cleanDisplayName(body.displayName);

  if (!displayName) {
    return fail("Display name must be 1-32 characters.");
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;

  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Server is not configured.", 500);
  }

  try {
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, room_code, title, phase, team_count")
      .eq("room_code", roomCode)
      .maybeSingle<RoomRow>();

    if (roomError) {
      throw new Error(roomError.message);
    }

    if (!room) {
      return fail("Room not found. Check the code and try again.", 404);
    }

    const [{ data: teams, error: teamsError }, { data: players, error: playersError }] =
      await Promise.all([
        supabase
          .from("teams")
          .select("id, team_index")
          .eq("room_id", room.id)
          .order("team_index", { ascending: true })
          .returns<TeamRow[]>(),
        supabase
          .from("players")
          .select("id, team_id, status, join_order")
          .eq("room_id", room.id)
          .returns<PlayerRow[]>(),
      ]);

    if (teamsError) {
      throw new Error(teamsError.message);
    }

    if (playersError) {
      throw new Error(playersError.message);
    }

    const canJoinActive = room.phase === "LOBBY" || room.phase === "TEAM_SETUP";
    const teamId = canJoinActive
      ? [...(teams || [])].sort((left, right) => {
          const leftCount = (players || []).filter(
            (player) =>
              player.team_id === left.id && player.status === "active",
          ).length;
          const rightCount = (players || []).filter(
            (player) =>
              player.team_id === right.id && player.status === "active",
          ).length;

          return leftCount - rightCount || left.team_index - right.team_index;
        })[0]?.id || null
      : null;
    const joinOrder =
      Math.max(0, ...(players || []).map((player) => player.join_order)) + 1;
    const playerToken = makeToken();
    const status: PlayerStatus = canJoinActive ? "active" : "pending";

    const { data: player, error: playerError } = await supabase
      .from("players")
      .insert({
        room_id: room.id,
        team_id: teamId,
        display_name: displayName,
        initials: makeInitials(displayName),
        token_hash: hashToken(playerToken),
        join_order: joinOrder,
        status,
      })
      .select("id, team_id, display_name, initials, join_order, status")
      .single<NewPlayerRow>();

    if (playerError || !player) {
      throw new Error(playerError?.message || "Player could not join.");
    }

    await supabase.from("game_events").insert({
      room_id: room.id,
      actor_player_id: player.id,
      event_type: "PLAYER_JOINED",
      payload: { status },
    });

    const publicState = await rebuildPublicRoomState(room.id);
    const baseUrl = getAppUrl().replace(/\/$/, "");

    return ok(
      {
        room: {
          id: room.id,
          roomCode: room.room_code,
          title: room.title,
          phase: room.phase,
          teamCount: room.team_count,
        },
        player: {
          id: player.id,
          teamId: player.team_id,
          displayName: player.display_name,
          initials: player.initials,
          joinOrder: player.join_order,
          status: player.status,
        },
        playerToken,
        publicState,
        urls: {
          play: `${baseUrl}/play/${room.room_code}`,
          display: `${baseUrl}/display/${room.room_code}`,
        },
      },
      201,
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not join room.", 500);
  }
}
