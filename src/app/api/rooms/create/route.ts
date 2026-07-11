import { DEFAULT_ROOM_SETTINGS, TEAM_PALETTE } from "@/lib/config";
import { getAppUrl } from "@/lib/config";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { fail, ok, readJsonObject } from "@/lib/server/http";
import { rebuildPublicRoomState } from "@/lib/server/room-state";
import { hashToken, makeRoomCode, makeToken } from "@/lib/server/tokens";
import { cleanTitle, parseTeamCount } from "@/lib/validation";

export const runtime = "nodejs";

interface RoomCreateRow {
  id: string;
  room_code: string;
  title: string;
  team_count: number;
}

async function makeAvailableRoomCode(
  supabase: ReturnType<typeof getSupabaseAdmin>,
) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = makeRoomCode();
    const { data, error } = await supabase
      .from("rooms")
      .select("id")
      .eq("room_code", code)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    if (!data) {
      return code;
    }
  }

  throw new Error("Could not generate a unique room code. Try again.");
}

export async function POST(request: Request) {
  const body = await readJsonObject(request);

  if (!body) {
    return fail("Expected a JSON object.");
  }

  const teamCount = parseTeamCount(body.teamCount);

  if (!teamCount) {
    return fail("teamCount must be an integer from 3 to 8.");
  }

  const title = cleanTitle(body.title);

  let supabase: ReturnType<typeof getSupabaseAdmin>;

  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Server is not configured.", 500);
  }

  try {
    const hostToken = makeToken();
    const roomCode = await makeAvailableRoomCode(supabase);

    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .insert({
        room_code: roomCode,
        title,
        team_count: teamCount,
        host_token_hash: hashToken(hostToken),
        settings: DEFAULT_ROOM_SETTINGS,
      })
      .select("id, room_code, title, team_count")
      .single<RoomCreateRow>();

    if (roomError || !room) {
      throw new Error(roomError?.message || "Room could not be created.");
    }

    const teamRows = Array.from({ length: teamCount }, (_, teamIndex) => {
      const palette = TEAM_PALETTE[teamIndex];

      return {
        room_id: room.id,
        team_index: teamIndex,
        name: palette.name,
        color: palette.color,
        icon: palette.icon,
      };
    });

    const { error: teamsError } = await supabase.from("teams").insert(teamRows);

    if (teamsError) {
      throw new Error(teamsError.message);
    }

    await supabase.from("game_events").insert({
      room_id: room.id,
      event_type: "ROOM_CREATED",
      payload: { teamCount },
    });

    const publicState = await rebuildPublicRoomState(room.id);
    const baseUrl = getAppUrl().replace(/\/$/, "");

    return ok(
      {
        room: {
          id: room.id,
          roomCode: room.room_code,
          title: room.title,
          teamCount: room.team_count,
        },
        hostToken,
        publicState,
        urls: {
          host: `${baseUrl}/host/${room.room_code}`,
          setup: `${baseUrl}/setup/${room.room_code}`,
          display: `${baseUrl}/display/${room.room_code}`,
          join: `${baseUrl}/join?room=${room.room_code}`,
        },
      },
      201,
    );
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Room could not be created.",
      500,
    );
  }
}
