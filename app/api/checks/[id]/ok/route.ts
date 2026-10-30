import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/checks/:id/ok — the patient taps "I'm okay". Ends the check and counts as activity.
// Also called by the service worker's notification button (no body needed).
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const { id } = await ctx.params;
  const admin = supabaseAdmin();

  const { data: check } = await admin.from("wellness_checks").select("id, patient_id, state").eq("id", id).maybeSingle();
  if (!check) return fail("Check not found", 404);
  if (check.patient_id !== user.id) return fail("Only the person being checked on can answer this", 403);

  const now = new Date().toISOString();
  // Only an open check changes; answering twice is harmless.
  await admin.from("wellness_checks").update({ state: "ok", ended_at: now, ended_by: user.id }).eq("id", id).in("state", ["asking", "escalating"]);
  await admin.from("profiles").update({ last_activity_at: now }).eq("id", user.id);
  return NextResponse.json({ ok: true });
}
