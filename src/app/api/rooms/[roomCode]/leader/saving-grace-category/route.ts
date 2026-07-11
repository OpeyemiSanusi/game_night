import { requirePlayer } from "@/lib/server/auth";
import { selectSavingGraceCategory } from "@/lib/server/game-engine";
import { fail, ok, readJsonObject } from "@/lib/server/http";
import type { SavingGraceCategory } from "@/lib/types";

export const runtime = "nodejs";

const CATEGORIES = ["TIME_OF_DAY", "NEXT_SENDER", "REACTION_COUNT"];

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
  const category =
    typeof body?.category === "string" && CATEGORIES.includes(body.category)
      ? (body.category as SavingGraceCategory)
      : null;

  if (!category) {
    return fail("Valid category is required.");
  }

  try {
    const publicState = await selectSavingGraceCategory(
      auth.supabase,
      auth.room,
      auth.player,
      category,
    );
    return ok({ publicState });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Category failed.", 400);
  }
}
