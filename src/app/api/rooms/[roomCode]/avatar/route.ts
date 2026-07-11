import { requirePlayer } from "@/lib/server/auth";
import { fail, ok } from "@/lib/server/http";
import { rebuildPublicRoomState } from "@/lib/server/room-state";

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

  const formData = await request.formData();
  const file = formData.get("avatar");

  if (!(file instanceof File)) {
    return fail("avatar file is required.");
  }

  if (file.size > 600_000) {
    return fail("Avatar must be below 600KB after compression.");
  }

  const path = `avatars/${auth.room.id}/${auth.player.id}.webp`;
  const { error: uploadError } = await auth.supabase.storage
    .from("avatars")
    .upload(path, file, {
      contentType: file.type || "image/webp",
      upsert: true,
    });

  if (uploadError) {
    return fail(uploadError.message, 500);
  }

  const { data } = auth.supabase.storage.from("avatars").getPublicUrl(path);
  const { error: updateError } = await auth.supabase
    .from("players")
    .update({ avatar_url: data.publicUrl })
    .eq("id", auth.player.id);

  if (updateError) {
    return fail(updateError.message, 500);
  }

  const publicState = await rebuildPublicRoomState(auth.room.id);
  return ok({ avatarUrl: data.publicUrl, publicState });
}
