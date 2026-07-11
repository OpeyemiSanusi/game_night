import { ok } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET() {
  const now = Date.now();

  return ok({
    serverTime: new Date(now).toISOString(),
    epochMs: now,
  });
}
