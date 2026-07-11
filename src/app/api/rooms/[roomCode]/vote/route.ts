import { requirePlayer } from "@/lib/server/auth";
import { submitVote } from "@/lib/server/game-engine";
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
  const answerId = typeof body?.answerId === "string" ? body.answerId : "";

  if (!answerId) {
    return fail("answerId is required.");
  }

  try {
    const publicState = await submitVote(
      auth.supabase,
      auth.room,
      auth.player,
      answerId,
    );
    return ok({ publicState });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Vote failed.", 400);
  }
}
