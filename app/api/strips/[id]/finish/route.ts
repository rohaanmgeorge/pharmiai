import { NextResponse } from "next/server";
import { safetyLog } from "@/lib/safety/log";
import { canManage, fail, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/strips/:id/finish — "I used this strip up". It leaves the Expiry list and gets no more alerts.
export async function POST(request: Request, ctx: RouteContext<"/api/strips/[id]/finish">) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const { id } = await ctx.params;

  const { data: strip } = await supabase.from("strips").select("id, patient_id").eq("id", id).maybeSingle();
  if (!strip) return fail("Medicine not found", 404);
  if (!(await canManage(supabase, strip.patient_id))) return fail("Not allowed", 403);

  const { error } = await supabaseAdmin().from("strips").update({ state: "finished", finished_at: new Date().toISOString() }).eq("id", id);
  if (error) return fail("Could not save", 500);

  await safetyLog([{ actor: user.id, patientId: strip.patient_id, event: "strip_finished", payload: { strip: id } }]);
  return NextResponse.json({ ok: true });
}
