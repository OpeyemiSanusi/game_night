import { requirePlayer } from "@/lib/server/auth";
import { selectLeaderChallenge } from "@/lib/server/game-engine";
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
  const assignmentId = typeof body?.assignmentId === "string" ? body.assignmentId : "";
  const challengeId = typeof body?.challengeId === "string" ? body.challengeId : "";

  if (!assignmentId || !challengeId) {
    return fail("assignmentId and challengeId are required.");
  }

  try {
    const publicState = await selectLeaderChallenge(
      auth.supabase,
      auth.room,
      auth.player,
      assignmentId,
      challengeId,
    );
    return ok({ publicState });
  } catch (error) {
    return fail(
      error instanceof Error ? error.message : "Challenge selection failed.",
      400,
    );
  }
}
