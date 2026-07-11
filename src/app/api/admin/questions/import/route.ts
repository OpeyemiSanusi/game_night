import { isAdminRequest } from "@/lib/server/admin";
import { fail, ok } from "@/lib/server/http";
import { normalizeQuestionPackImport } from "@/lib/server/questions";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAdminRequest(request)) {
    return fail("Admin token is required.", 401);
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return fail("Expected JSON question data.");
  }

  let pack;

  try {
    pack = normalizeQuestionPackImport(payload);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Invalid import.", 400);
  }

  let supabase: ReturnType<typeof getSupabaseAdmin>;

  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Server is not configured.", 500);
  }

  const { data: insertedPack, error: packError } = await supabase
    .from("question_packs")
    .insert({
      name: pack.name,
      description: pack.description,
      enabled: true,
    })
    .select("id, name")
    .single<{ id: string; name: string }>();

  if (packError || !insertedPack) {
    return fail(packError?.message || "Question pack could not be created.", 500);
  }

  const rows = pack.questions.map((question) => ({
    pack_id: insertedPack.id,
    quote: question.quote,
    answer_options: question.answerOptions,
    correct_answer_id: question.correctAnswerId,
    sent_at: question.sentAt,
    next_sender_options: question.nextSenderOptions,
    correct_next_sender_id: question.correctNextSenderId,
    reaction_count: question.reactionCount,
    category: question.category,
    difficulty: question.difficulty,
    host_note: question.hostNote,
    enabled: true,
  }));
  const { error: questionsError } = await supabase.from("questions").insert(rows);

  if (questionsError) {
    return fail(questionsError.message, 500);
  }

  return ok({
    pack: insertedPack,
    importedQuestions: rows.length,
  });
}
