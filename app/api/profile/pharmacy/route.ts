import { NextResponse } from "next/server";
import { canManage, canView, fail, requireUser } from "@/lib/server/auth";

// GET   /api/profile/pharmacy?patient=<id>  → { name, phone, email, canManage }
// PATCH /api/profile/pharmacy?patient=<id>  { name, phone, email }
// Uses the user's own client: RLS + the guard_profile trigger allow the patient or a
// managing caregiver to change pharmacy details, and nothing else on the profile.
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const patientId = new URL(request.url).searchParams.get("patient") || user.id;
  if (!(await canView(supabase, patientId))) return fail("Not allowed", 403);

  const { data } = await supabase.from("profiles").select("pharmacy_name, pharmacy_phone, pharmacy_email").eq("id", patientId).maybeSingle();
  return NextResponse.json({
    name: data?.pharmacy_name ?? null,
    phone: data?.pharmacy_phone ?? null,
    email: data?.pharmacy_email ?? null,
    canManage: await canManage(supabase, patientId),
  });
}

const clean = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function PATCH(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const patientId = new URL(request.url).searchParams.get("patient") || user.id;
  if (!(await canManage(supabase, patientId))) return fail("Only the patient or a caregiver can change this", 403);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = clean(body.name, 80);
  const phone = clean(body.phone, 20);
  const email = clean(body.email, 120);
  if (phone && !/^\+?[\d\s-]{7,20}$/.test(phone)) return fail("Please check the phone number");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Please check the email address");
  if (!phone && !email) return fail("Add a phone number or an email");

  const { error } = await supabase
    .from("profiles")
    .update({ pharmacy_name: name, pharmacy_phone: phone, pharmacy_email: email })
    .eq("id", patientId);
  if (error) return fail("Could not save", 500);
  return NextResponse.json({ name, phone, email, canManage: true });
}
