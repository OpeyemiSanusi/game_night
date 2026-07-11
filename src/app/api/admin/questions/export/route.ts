import { isAdminRequest } from "@/lib/server/admin";
import { fail, ok } from "@/lib/server/http";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!isAdminRequest(request)) {
    return fail("Admin token is required.", 401);
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;

  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Server is not configured.", 500);
  }

  const { data: packs, error: packsError } = await supabase
    .from("question_packs")
    .select("id, name, description, enabled")
    .order("created_at", { ascending: false });

  if (packsError) {
    return fail(packsError.message, 500);
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select(
      "id, pack_id, quote, answer_options, correct_answer_id, sent_at, next_sender_options, correct_next_sender_id, reaction_count, category, difficulty, host_note, enabled",
    )
    .order("created_at", { ascending: false });

  if (questionsError) {
    return fail(questionsError.message, 500);
  }

  return ok({ packs: packs || [], questions: questions || [] });
}
