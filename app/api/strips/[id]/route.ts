import { NextResponse } from "next/server";
import { findDuplicateIngredients } from "@/lib/safety/medication-math";
import { normalizeName, normalizeStrength } from "@/lib/safety/match";
import { slotOf } from "@/lib/safety/slots";
import { expiryBadge, formatExpiry } from "@/lib/safety/strip";
import { canManage, fail, requireUser, signedPhoto } from "@/lib/server/auth";
import { istDate } from "@/lib/server/time";
import { factSource } from "@/lib/safety/medication-math";

type ActiveSchedule = {
  id: string;
  slot_times: string[];
  stock: number;
  prescription_items: { catalog_id: string; medicine_catalog: { name: string; ingredients: string[] } };
};

// GET /api/strips/:id — the strip review: photo, both readings, status, matching reminders,
// duplicate warning, expiry badge, and (Verified only) medicine facts + Jan Aushadhi price from the DB.
export async function GET(request: Request, ctx: RouteContext<"/api/strips/[id]">) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;
  const { id } = await ctx.params;

  const { data: strip } = await supabase
    .from("strips")
    .select("id, patient_id, image_path, reading_a, reading_b, catalog_id, candidates, status, reasons, expiry_read, expiry_month, batch, quantity, schedule_id, state, confirmed_at")
    .eq("id", id)
    .maybeSingle();
  if (!strip) return fail("Medicine not found", 404);

  // "Is this one of my medicines?" = an active reminder for the SAME catalog entry (exact id only).
  const { data: active } = await supabase
    .from("schedules")
    .select("id, slot_times, stock, prescription_items!inner(catalog_id, medicine_catalog!inner(name, ingredients))")
    .eq("patient_id", strip.patient_id)
    .eq("active", true);
  const schedules = (active ?? []) as unknown as ActiveSchedule[];
  const matching = strip.catalog_id
    ? schedules
        .filter((s) => s.prescription_items.catalog_id === strip.catalog_id)
        .map((s) => ({
          id: s.id,
          name: s.prescription_items.medicine_catalog.name,
          stock: s.stock,
          slots: [...new Set(s.slot_times.map((t) => slotOf(t)))],
        }))
    : [];

  // The catalog entry both readings agreed on (facts only come from here, never from AI text).
  const { data: entry } = strip.catalog_id
    ? await supabase.from("medicine_catalog").select("*").eq("id", strip.catalog_id).maybeSingle()
    : { data: null };

  // Duplicate ingredients: this strip's medicine against the other active medicines.
  let duplicates: { ingredient: string; names: string[] }[] = [];
  if (entry) {
    const meds = [
      { id: entry.id as string, name: entry.name as string, ingredients: entry.ingredients as string[] },
      ...schedules.map((s) => ({ id: s.prescription_items.catalog_id, name: s.prescription_items.medicine_catalog.name, ingredients: s.prescription_items.medicine_catalog.ingredients })),
    ];
    const nameOf = new Map(meds.map((m) => [m.id, m.name]));
    duplicates = findDuplicateIngredients(meds)
      .filter((d) => d.medicines.includes(entry.id))
      .map((d) => ({ ingredient: d.ingredient, names: d.medicines.map((m) => nameOf.get(m) ?? m) }));
  }

  // Medicine facts and the generic price: Verified only.
  let info: { uses: string | null; sideEffects: string | null; source: string } | null = null;
  let generic: { name: string; mrp: number; packSize: number; brandMrp: number | null; brandPackSize: number | null } | null = null;
  if (strip.status === "verified" && entry) {
    const { data: profile } = await supabase.from("profiles").select("lang").eq("id", strip.patient_id).maybeSingle();
    const lang = (profile?.lang as string) ?? "en";
    // Patient's language first; English if that translation is not curated yet.
    info = {
      uses: entry[`uses_${lang}`] ?? entry.uses_en ?? null,
      sideEffects: entry[`side_effects_${lang}`] ?? entry.side_effects_en ?? null,
      source: factSource(entry),
    };
    // Jan Aushadhi alternative: exactly the same ingredients AND the same strength.
    const { data: generics } = await supabase.from("generic_products").select("name, ingredients, strength, mrp, pack_size").contains("ingredients", entry.ingredients);
    const sameSet = (x: string[], y: string[]) => x.length === y.length && x.map(normalizeName).sort().join("|") === y.map(normalizeName).sort().join("|");
    const g = (generics ?? []).find((p) => sameSet(p.ingredients, entry.ingredients) && normalizeStrength(p.strength) === normalizeStrength(entry.strength));
    if (g) generic = { name: g.name, mrp: Number(g.mrp), packSize: g.pack_size, brandMrp: entry.mrp === null ? null : Number(entry.mrp), brandPackSize: entry.pack_size };
  }

  // The expiry badge only uses a CONFIRMED month.
  const confirmedExpiry = strip.status === "verified" ? strip.expiry_month : null;
  const { badge, daysLeft } = expiryBadge(confirmedExpiry, istDate());

  const { image_path, ...rest } = strip;
  return NextResponse.json({
    strip: {
      ...rest,
      photoUrl: await signedPhoto(supabase, image_path),
      expiry: formatExpiry(confirmedExpiry),
      expiryReadLabel: formatExpiry(strip.expiry_read),
      badge: strip.state === "expired" ? "expired" : badge,
      daysLeft,
      name: entry?.name ?? null,
    },
    matching,
    duplicates,
    info,
    generic,
    canManage: await canManage(supabase, strip.patient_id),
  });
}
