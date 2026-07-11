import { TEAM_PALETTE } from "@/lib/config";
import { requireHost } from "@/lib/server/auth";
import { readSettings, randomSample } from "@/lib/server/game-utils";
import { fail, ok, readJsonObject } from "@/lib/server/http";
import { rebuildPublicRoomState } from "@/lib/server/room-state";

export const runtime = "nodejs";

type TeamConfigAction =
  | "AUTO_BALANCE"
  | "MOVE_PLAYER"
  | "UPDATE_TEAM"
  | "SET_SETTINGS";

function cleanColor(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode } = await context.params;
  const auth = await requireHost(request, roomCode);

  if (auth.response || !auth.supabase || !auth.room) {
    return auth.response || fail("Host auth failed.", 401);
  }

  const body = await readJsonObject(request);

  if (!body) {
    return fail("JSON body is required.");
  }

  const action = body.action as TeamConfigAction | undefined;

  if (!action) {
    return fail("Team config action is required.");
  }

  try {
    if (action === "AUTO_BALANCE") {
      const [{ data: teams, error: teamsError }, { data: players, error: playersError }] =
        await Promise.all([
          auth.supabase
            .from("teams")
            .select("id, team_index")
            .eq("room_id", auth.room.id)
            .order("team_index", { ascending: true })
            .returns<Array<{ id: string; team_index: number }>>(),
          auth.supabase
            .from("players")
            .select("id")
            .eq("room_id", auth.room.id)
            .eq("status", "active")
            .order("join_order", { ascending: true })
            .returns<Array<{ id: string }>>(),
        ]);

      if (teamsError) {
        throw new Error(teamsError.message);
      }

      if (playersError) {
        throw new Error(playersError.message);
      }

      const shuffledPlayers = randomSample(players || [], players?.length || 0);
      const base = Math.floor(shuffledPlayers.length / (teams?.length || 1));
      const remainder = shuffledPlayers.length % (teams?.length || 1);
      let cursor = 0;

      for (const team of teams || []) {
        const targetSize = base + (team.team_index < remainder ? 1 : 0);
        const targetPlayers = shuffledPlayers.slice(cursor, cursor + targetSize);
        cursor += targetSize;

        for (const player of targetPlayers) {
          const { error } = await auth.supabase
            .from("players")
            .update({ team_id: team.id })
            .eq("id", player.id);

          if (error) {
            throw new Error(error.message);
          }
        }
      }
    }

    if (action === "MOVE_PLAYER") {
      const playerId = typeof body.playerId === "string" ? body.playerId : "";
      const teamId = typeof body.teamId === "string" ? body.teamId : "";

      if (!playerId || !teamId) {
        return fail("playerId and teamId are required.");
      }

      const { error } = await auth.supabase
        .from("players")
        .update({ team_id: teamId })
        .eq("id", playerId)
        .eq("room_id", auth.room.id);

      if (error) {
        throw new Error(error.message);
      }
    }

    if (action === "UPDATE_TEAM") {
      const teamId = typeof body.teamId === "string" ? body.teamId : "";
      const name =
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim().slice(0, 40)
          : null;
      const color = cleanColor(body.color);

      if (!teamId) {
        return fail("teamId is required.");
      }

      const { error } = await auth.supabase
        .from("teams")
        .update({
          ...(name ? { name } : {}),
          ...(color ? { color } : {}),
        })
        .eq("id", teamId)
        .eq("room_id", auth.room.id);

      if (error) {
        throw new Error(error.message);
      }
    }

    if (action === "SET_SETTINGS") {
      const settings = readSettings(auth.room.settings);
      const nextSettings = {
        ...settings,
        rounds: Number(body.rounds) || settings.rounds,
        questionTimerSeconds:
          Number(body.questionTimerSeconds) || settings.questionTimerSeconds,
        selectedQuestionPackId:
          typeof body.selectedQuestionPackId === "string"
            ? body.selectedQuestionPackId
            : settings.selectedQuestionPackId,
        selectedChallengeDeckId:
          typeof body.selectedChallengeDeckId === "string"
            ? body.selectedChallengeDeckId
            : settings.selectedChallengeDeckId,
      };
      const { error } = await auth.supabase
        .from("rooms")
        .update({ settings: nextSettings })
        .eq("id", auth.room.id);

      if (error) {
        throw new Error(error.message);
      }
    }

    if (action === "UPDATE_TEAM" && typeof body.resetColorIndex === "number") {
      const palette = TEAM_PALETTE[body.resetColorIndex];
      await auth.supabase
        .from("teams")
        .update({ color: palette.color, name: palette.name, icon: palette.icon })
        .eq("room_id", auth.room.id)
        .eq("team_index", body.resetColorIndex);
    }

    const publicState = await rebuildPublicRoomState(auth.room.id);
    return ok({ publicState });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Team config failed.", 400);
  }
}
