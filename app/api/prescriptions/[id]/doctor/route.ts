import { NextResponse } from "next/server";
import { canManage, fail, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/prescriptions/:id/doctor  { name } — a person confirms or types the doctor's name (may be blank).
export async function POST(request: Request, ctx: RouteContext<"/api/prescriptions/[id]/doctor">) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";

  const { data: rx } = await supabase.from("prescriptions").select("patient_id").eq("id", id).maybeSingle();
  if (!rx) return fail("Prescription not found", 404);
  if (!(await canManage(supabase, rx.patient_id))) return fail("Not allowed", 403);
  await supabaseAdmin().from("prescriptions").update({ doctor_name: name || null }).eq("id", id);
  return NextResponse.json({ ok: true });
}
