import { NextResponse } from "next/server";
import { canView, fail, requireUser } from "@/lib/server/auth";
import { type Brand, findSaving, type Generic } from "@/components/emergency/generic-match";

type Row = {
  id: string;
  slot_times: string[];
  prescription_items: { status: string; medicine_catalog: Brand & { id: string } };
};

// GET /api/savings?patient=<id> — brand vs Jan Aushadhi generic, VERIFIED active medicines only.
// Medicines with a missing price or no exact generic are left out (never guessed).
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const patientId = new URL(request.url).searchParams.get("patient") || user.id;
  if (!(await canView(supabase, patientId))) return fail("Not allowed", 403);

  const { data } = await supabase
    .from("schedules")
    .select("id, slot_times, prescription_items!inner(status, medicine_catalog!inner(id, name, ingredients, strength, mrp, pack_size))")
    .eq("patient_id", patientId)
    .eq("active", true)
    .eq("prescription_items.status", "verified");
  const rows = ((data ?? []) as unknown as Row[]).filter((r) => r.prescription_items.status === "verified");

  const ingredients = [...new Set(rows.flatMap((r) => r.prescription_items.medicine_catalog.ingredients))];
  const { data: generics } = ingredients.length
    ? await supabase.from("generic_products").select("ja_code, name, ingredients, strength, mrp, pack_size").overlaps("ingredients", ingredients)
    : { data: [] };

  const items = rows.flatMap((r) => {
    const brand = r.prescription_items.medicine_catalog;
    const dosesPerDay = r.slot_times.length;
    const saving = findSaving(brand, (generics ?? []) as Generic[], dosesPerDay);
    if (!saving || saving.yearly <= 0) return [];
    return [{ scheduleId: r.id, name: brand.name, strength: brand.strength, dosesPerDay, ...saving }];
  });

  return NextResponse.json({
    total: items.reduce((sum, i) => sum + i.yearly, 0),
    items: items.sort((a, b) => b.yearly - a.yearly),
    medicinesChecked: rows.length,
  });
}
