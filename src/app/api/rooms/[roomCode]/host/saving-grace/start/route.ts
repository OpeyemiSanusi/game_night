import { requireHost } from "@/lib/server/auth";
import {
  isHostSavingGraceCategory,
  startHostSavingGraceAttempt,
} from "@/lib/server/host-saving-grace";
import { fail, ok, readJsonObject } from "@/lib/server/http";

export const runtime = "nodejs";

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
  const category = body?.category;

  if (!isHostSavingGraceCategory(category)) {
    return fail("Valid Saving Grace category is required.");
  }

  try {
    const savingGrace = await startHostSavingGraceAttempt(
      auth.supabase,
      auth.room,
      category,
    );

    return ok({ savingGrace });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Saving Grace failed.", 400);
  }
}
