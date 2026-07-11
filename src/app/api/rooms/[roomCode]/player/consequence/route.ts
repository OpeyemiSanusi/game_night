import { requirePlayer } from "@/lib/server/auth";
import { chooseConsequence } from "@/lib/server/game-engine";
import { fail, ok, readJsonObject } from "@/lib/server/http";
import type { ConsequenceChoice } from "@/lib/types";

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
  const choice =
    body?.choice === "DRINK" || body?.choice === "CHALLENGE"
      ? (body.choice as ConsequenceChoice)
      : null;

  if (!choice) {
    return fail("Valid consequence choice is required.");
  }

  try {
    const publicState = await chooseConsequence(
      auth.supabase,
      auth.room,
      auth.player,
      choice,
    );
    return ok({ publicState });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Consequence failed.", 400);
  }
}
