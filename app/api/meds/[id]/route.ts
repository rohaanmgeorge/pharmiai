import { NextResponse } from "next/server";
import { fail, requireUser, signedPhoto } from "@/lib/server/auth";
import { daysOfStockLeft, findDuplicateIngredients } from "@/lib/safety/medication-math";
import { expandShorthand } from "@/lib/safety/shorthand";
import { findSaving, type Generic } from "@/components/emergency/generic-match";

type Catalog = {
  id: string;
  name: string;
  ingredients: string[];
  strength: string;
  form: string;
  mrp: number | null;
  pack_size: number | null;
  source: string;
  reviewer: string;
  reviewed_at: string;
} & Record<`uses_${"en" | "ml" | "hi"}` | `side_effects_${"en" | "ml" | "hi"}`, string | null>;

type Item = { status: string; dose_code: string | null; strength: string | null; food: string | null; duration_days: number | null; medicine_catalog: Catalog };

// GET /api/meds/:id (id = schedule id) — medicine detail. Zero-Guess: only for VERIFIED
// medicines, and every fact (uses, side effects, prices) comes from DB rows, never AI text.
export async function GET(request: Request, ctx: RouteContext<"/api/meds/[id]">) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const { id } = await ctx.params;

  // User client: RLS "view schedules" (can_view) decides if this person may see it.
  const { data: s } = await supabase
    .from("schedules")
    .select(
      "id, patient_id, slot_times, start_date, end_date, stock, pill_photo_path, active, prescription_items!inner(status, dose_code, strength, food, duration_days, medicine_catalog!inner(*))",
    )
    .eq("id", id)
    .maybeSingle();
  if (!s) return fail("Medicine not found", 404);
  const item = s.prescription_items as unknown as Item;
  if (item.status !== "verified") return fail("Details are shown only for verified medicines", 403);
  const med = item.medicine_catalog;

  // Facts in the reader's language, falling back to English.
  const { data: me } = await supabase.from("profiles").select("lang").eq("id", user.id).maybeSingle();
  const lang = (me?.lang ?? "en") as "en" | "ml" | "hi";
  const uses = med[`uses_${lang}`] ?? med.uses_en;
  const sideEffects = med[`side_effects_${lang}`] ?? med.side_effects_en;

  // Duplicate ingredients against the patient's OTHER active medicines.
  const { data: others } = await supabase
    .from("schedules")
    .select("id, prescription_items!inner(medicine_catalog!inner(id, name, ingredients))")
    .eq("patient_id", s.patient_id)
    .eq("active", true)
    .neq("id", id);
  const list = [
    { id: med.id, name: med.name, ingredients: med.ingredients },
    ...(others ?? []).map((o) => (o.prescription_items as unknown as { medicine_catalog: { id: string; name: string; ingredients: string[] } }).medicine_catalog),
  ];
  const duplicates = findDuplicateIngredients(list)
    .filter((d) => d.medicines.includes(med.id))
    .map((d) => ({ ingredient: d.ingredient, names: d.medicines.filter((m) => m !== med.id).map((m) => list.find((x) => x.id === m)?.name ?? m) }));

  const dosesPerDay = (s.slot_times as string[]).length;
  const { data: generics } = await supabase.from("generic_products").select("ja_code, name, ingredients, strength, mrp, pack_size").overlaps("ingredients", med.ingredients);
  const saving = findSaving(med, (generics ?? []) as Generic[], dosesPerDay);

  const shorthand = expandShorthand(item.dose_code);
  return NextResponse.json({
    id: s.id,
    patientId: s.patient_id,
    name: med.name,
    ingredients: med.ingredients,
    strength: item.strength ?? med.strength,
    form: med.form,
    doseCode: item.dose_code,
    doseMeaning: shorthand?.meaning ?? null,
    food: item.food,
    durationDays: item.duration_days,
    slotTimes: (s.slot_times as string[]).map((t) => t.slice(0, 5)),
    startDate: s.start_date,
    endDate: s.end_date,
    active: s.active,
    stock: s.stock,
    daysLeft: daysOfStockLeft(s.stock, dosesPerDay),
    photoUrl: await signedPhoto(supabase, s.pill_photo_path),
    uses,
    sideEffects,
    source: med.source,
    reviewer: med.reviewer,
    reviewedAt: med.reviewed_at,
    duplicates,
    saving: saving && saving.yearly > 0 ? saving : null,
  });
}
