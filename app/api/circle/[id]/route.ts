import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/server/auth";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/circle/:id { consent: "given" | "revoked" } — only the patient may allow or revoke.
// The DB trigger guard_consent enforces this too; we check first so the message is friendly.
export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { consent?: string };
  if (body.consent !== "given" && body.consent !== "revoked") return fail("Consent must be given or revoked");

  const { data: link } = await supabase.from("care_circle_members").select("id, patient_id").eq("id", id).maybeSingle();
  if (!link) return fail("Not found", 404);
  if (link.patient_id !== user.id) return fail("Only the person whose medicines these are can allow or revoke access", 403);

  const { data, error } = await supabase.from("care_circle_members").update({ consent: body.consent }).eq("id", id).select("id, consent").maybeSingle();
  if (error || !data) return fail("Only the person whose medicines these are can allow or revoke access", 403);
  return NextResponse.json(data);
}

// DELETE /api/circle/:id — the patient removes someone, or a member leaves.
export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;
  const { id } = await ctx.params;
  const { data, error } = await supabase.from("care_circle_members").delete().eq("id", id).select("id");
  if (error) return fail("Could not remove. Please try again.");
  if (!data?.length) return fail("Not found", 404);
  return NextResponse.json({ ok: true });
}
