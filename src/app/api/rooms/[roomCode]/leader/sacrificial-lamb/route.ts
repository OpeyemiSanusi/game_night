import { requirePlayer } from "@/lib/server/auth";
import { selectSacrificialLamb } from "@/lib/server/game-engine";
import { fail, ok, readJsonObject } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ roomCode: string }> },
) {
  const { roomCode } = await context.params;
  const auth = await requirePlayer(request, roomCode);

  if (auth.response || !auth.supabase || !auth.room || !auth.player) {
    return auth.response || fail("Player auth failed.", 401);
  }

  const body = await readJsonObject(request);
  const lambPlayerId = typeof body?.lambPlayerId === "string" ? body.lambPlayerId : "";

  if (!lambPlayerId) {
    return fail("lambPlayerId is required.");
  }

  try {
    const publicState = await selectSacrificialLamb(
      auth.supabase,
      auth.room,
      auth.player,
      lambPlayerId,
    );
    return ok({ publicState });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Lamb selection failed.", 400);
  }
}
