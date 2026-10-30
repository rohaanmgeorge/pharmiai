import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/server/auth";

// GET /api/chat/history?patient= — the last 60 messages (oldest first) for this conversation.
// DELETE /api/chat/history — "Clear history" (only your own messages; RLS enforces it).
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const patientId = new URL(request.url).searchParams.get("patient") || user.id;
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, role, text, cards, general, created_at")
    .eq("patient_id", patientId)
    .order("id", { ascending: false }) // insertion order: a question is always saved before its answer
    .limit(60);
  if (error) return fail("Could not load your conversation", 500);
  return NextResponse.json({ messages: (data ?? []).reverse() });
}

export async function DELETE(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { error } = await auth.supabase.from("chat_messages").delete().eq("user_id", auth.user.id);
  if (error) return fail("Could not clear", 500);
  return NextResponse.json({ ok: true });
}
