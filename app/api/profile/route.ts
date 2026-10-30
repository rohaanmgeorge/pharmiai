import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/server/auth";

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

/** "Penicillin, sulfa" or ["Penicillin"] → ["Penicillin", "sulfa"] (trimmed, no blanks, max 20). */
function list(v: unknown): string[] | null {
  const parts = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : null;
  if (!parts) return null;
  return parts
    .map((s) => String(s).trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 20);
}

// PATCH /api/profile { name?, lang?, bloodGroup?, allergies?, conditions?, city? } — my own profile.
// User client: RLS "update own profile" applies (caregivers can't change these fields).
export async function PATCH(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 80) return fail("Please enter your name");
    patch.name = name;
  }
  if (body.lang !== undefined) {
    if (!["en", "ml", "hi"].includes(body.lang as string)) return fail("Please choose a language");
    patch.lang = body.lang;
  }
  if (body.bloodGroup !== undefined) {
    const bg = typeof body.bloodGroup === "string" ? body.bloodGroup.trim().toUpperCase() : "";
    if (bg && !BLOOD_GROUPS.includes(bg)) return fail("Please choose a blood group");
    patch.blood_group = bg || null;
  }
  for (const [key, column] of [
    ["allergies", "allergies"],
    ["conditions", "conditions"],
  ] as const) {
    if (body[key] !== undefined) {
      const value = list(body[key]);
      if (!value) return fail(`Please list ${key} separated by commas`);
      patch[column] = value;
    }
  }
  if (body.city !== undefined) {
    // Used only for AI price estimates ("location-specific rates").
    const city = typeof body.city === "string" ? body.city.trim().slice(0, 80) : "";
    patch.city = city || null;
  }
  if (Object.keys(patch).length === 0) return fail("Nothing to change");

  const { data, error } = await supabase.from("profiles").update(patch).eq("id", user.id).select("name, lang, blood_group, allergies, conditions, city").single();
  if (error) return fail("Could not save. Please try again.", 500);
  return NextResponse.json({ profile: data });
}
