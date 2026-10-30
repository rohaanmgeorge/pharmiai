import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/server/auth";
import { checkContact } from "@/components/emergency/contact-input";

// PATCH /api/contacts/:id — change any field. RLS ("manage contacts" = can_manage) decides
// whether this user may: a row they can't manage simply isn't updated, so we answer 404.
export async function PATCH(request: Request, ctx: RouteContext<"/api/contacts/[id]">) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;
  const { id } = await ctx.params;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = checkContact(body, true);
  if ("error" in checked) return fail(checked.error);
  if (Object.keys(checked.value).length === 0) return fail("Nothing to change");

  const { data, error } = await supabase
    .from("emergency_contacts")
    .update(checked.value)
    .eq("id", id)
    .select("id, patient_id, name, phone, email, relation, priority, lang")
    .maybeSingle();
  if (error) return fail("Could not save the contact. Please try again.", 500);
  if (!data) return fail("Contact not found", 404);
  return NextResponse.json({ contact: data });
}

// DELETE /api/contacts/:id
export async function DELETE(request: Request, ctx: RouteContext<"/api/contacts/[id]">) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;
  const { id } = await ctx.params;

  const { data, error } = await supabase.from("emergency_contacts").delete().eq("id", id).select("id");
  if (error) return fail("Could not remove the contact. Please try again.", 500);
  if (!data?.length) return fail("Contact not found", 404);
  return NextResponse.json({ ok: true });
}
