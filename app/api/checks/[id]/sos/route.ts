import { NextResponse } from "next/server";
import { canManage, fail, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/checks/:id/sos — a caregiver decides this is now an emergency.
// Marks the check as "sos" and sends them to the SOS screen for that person.
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const { id } = await ctx.params;
  const admin = supabaseAdmin();

  const { data: check } = await admin.from("wellness_checks").select("id, patient_id, state").eq("id", id).maybeSingle();
  if (!check) return fail("Check not found", 404);
  if (!(await canManage(supabase, check.patient_id))) return fail("Only a caregiver can escalate to SOS", 403);

  await admin.from("wellness_checks").update({ state: "sos", ended_at: new Date().toISOString(), ended_by: user.id }).eq("id", id).in("state", ["asking", "escalating"]);
  return NextResponse.json({ url: `/sos?patient=${check.patient_id}` });
}
