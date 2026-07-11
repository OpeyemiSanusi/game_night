import { requirePlayer } from "@/lib/server/auth";
import { submitSavingGraceAnswer } from "@/lib/server/game-engine";
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
  const answer = typeof body?.answer === "string" ? body.answer.trim() : "";

  if (!answer) {
    return fail("answer is required.");
  }

  try {
    const publicState = await submitSavingGraceAnswer(
      auth.supabase,
      auth.room,
      auth.player,
      answer,
    );
    return ok({ publicState });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Answer failed.", 400);
  }
}
