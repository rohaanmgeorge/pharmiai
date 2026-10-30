import { NextResponse } from "next/server";
import { identifyMedicines } from "@/lib/ai/identify-medicine";
import { fail, requireUser } from "@/lib/server/auth";
import { cityOf, saveIdentified } from "@/lib/server/catalog";

export const maxDuration = 30;

// POST /api/catalog/identify { name } — Gemini identifies a medicine typed by the person and we save
// it to the shared list (labelled AI, not pharmacist-reviewed). The person still picks and confirms it.
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (name.length < 2) return fail("Please type the medicine name");
  try {
    const found = await identifyMedicines([name], await cityOf(supabase, user.id));
    const saved = await saveIdentified(found, null);
    if (!saved.length) return NextResponse.json({ results: [], message: "Gemini could not identify this as a medicine sold in India. Check the spelling on the strip." });
    const { data } = await supabase.from("medicine_catalog").select("id, name, ingredients, strength, form, manufacturer, reviewed").in("id", saved.map((s) => s.id));
    return NextResponse.json({ results: data ?? [] });
  } catch {
    return fail("The AI is busy right now. Please try again in a minute.", 503);
  }
}
