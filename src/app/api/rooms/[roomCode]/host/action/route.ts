import { requireHost } from "@/lib/server/auth";
import { runHostAction } from "@/lib/server/game-engine";
import { fail, ok, readJsonObject } from "@/lib/server/http";
import type { HostAction } from "@/lib/types";

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
  const action = typeof body?.action === "string" ? (body.action as HostAction) : null;

  if (!action) {
    return fail("Host action is required.");
  }

  try {
    const publicState = await runHostAction(auth.supabase, auth.room, action);
    return ok({ publicState });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Host action failed.", 400);
  }
}
