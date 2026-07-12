import { getSupabaseAdmin } from "@/lib/supabase/server";
import { fail, ok } from "@/lib/server/http";
import { normalizePlayerDisplayName } from "@/lib/server/player-dedupe";
import { rebuildPublicRoomState } from "@/lib/server/room-state";
import { normalizeRoomCode } from "@/lib/validation";
import type { PublicRoomState } from "@/lib/types";

export const runtime = "nodejs";

function hasDuplicateVisiblePlayerNames(state: PublicRoomState) {
  const seenNames = new Set<string>();

  for (const player of state.players) {
    if (player.status === "inactive") {
      continue;
    }

    const normalizedName = normalizePlayerDisplayName(player.displayName);

    if (seenNames.has(normalizedName)) {
      return true;
    }

    seenNames.add(normalizedName);
  }

  return false;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode: rawRoomCode } = await context.params;
  const roomCode = normalizeRoomCode(rawRoomCode);

  if (!roomCode) {
    return fail("Enter a valid room code.", 400);
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;

  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Server is not configured.", 500);
  }

  const { data, error } = await supabase
    .from("public_room_state")
    .select("state")
    .eq("room_code", roomCode)
    .maybeSingle<{ state: PublicRoomState }>();

  if (error) {
    return fail(error.message, 500);
  }

  if (!data) {
    return fail("Room not found. Check the code and try again.", 404);
  }

  const publicState = hasDuplicateVisiblePlayerNames(data.state)
    ? await rebuildPublicRoomState(data.state.roomId)
    : data.state;

  return ok({ publicState });
}
