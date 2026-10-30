import { NextResponse } from "next/server";
import { canView, fail, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

// POST /api/checks/:id/ack { ack: "checking" | "reached" } — a family member responds.
// "checking" holds the ladder for one more wait period (so contacts aren't alerted while you call).
// "reached" ends the check: nobody else is alerted.
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { ack?: string };
  if (body.ack !== "checking" && body.ack !== "reached") return fail("Unknown answer");

  const admin = supabaseAdmin();
  const { data: check } = await admin.from("wellness_checks").select("id, patient_id, state, level").eq("id", id).maybeSingle();
  if (!check || !(await canView(supabase, check.patient_id))) return fail("Check not found", 404);
  const open = check.state === "asking" || check.state === "escalating";
  if (!open) return NextResponse.json({ state: check.state }); // already over: nothing to do

  const now = new Date().toISOString();
  const { data: mine } = await admin.from("check_alerts").select("id").eq("check_id", id).eq("member_id", user.id).order("sent_at", { ascending: false }).limit(1);
  if (mine?.length) {
    await admin.from("check_alerts").update({ ack: body.ack, acked_by: user.id, acked_at: now }).eq("id", mine[0].id);
  } else {
    // Not alerted yet (e.g. opened the dashboard first). sent_at = acked_at marks it as self-made.
    await admin.from("check_alerts").insert({ check_id: id, patient_id: check.patient_id, level: check.level, member_id: user.id, channel: "push", sent_at: now, ack: body.ack, acked_by: user.id, acked_at: now });
  }

  const patch = body.ack === "reached" ? { state: "acknowledged", ended_at: now, ended_by: user.id } : { last_step_at: now };
  await admin.from("wellness_checks").update(patch).eq("id", id).in("state", ["asking", "escalating"]);
  return NextResponse.json({ state: body.ack === "reached" ? "acknowledged" : check.state });
}
