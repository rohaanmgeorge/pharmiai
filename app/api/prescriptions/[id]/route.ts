import { NextResponse } from "next/server";
import { canManage, fail, requireUser, signedPhoto } from "@/lib/server/auth";
import { findDuplicateIngredients } from "@/lib/safety/medication-math";

// GET /api/prescriptions/:id — the review screen: photo, every line with its status, duplicates.
export async function GET(request: Request, ctx: RouteContext<"/api/prescriptions/[id]">) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;
  const { id } = await ctx.params;

  const { data: rx } = await supabase
    .from("prescriptions")
    .select("id, patient_id, image_path, state, doctor_name, doctor_read, created_at, approved_at, approved_by")
    .eq("id", id)
    .maybeSingle();
  if (!rx) return fail("Prescription not found", 404);

  const { data: items } = await supabase
    .from("prescription_items")
    .select("id, text_a, text_b, catalog_id, candidates, strength, dose_code, duration_days, food, status, reasons, confirmed_at, verified_by, ai_notes")
    .eq("prescription_id", id)
    .order("created_at");

  // Duplicate ingredients: this prescription's matched medicines + the patient's active ones.
  const ids = [...new Set((items ?? []).map((i) => i.catalog_id).filter(Boolean))] as string[];
  const { data: active } = await supabase
    .from("schedules")
    .select("prescription_items!inner(catalog_id)")
    .eq("patient_id", rx.patient_id)
    .eq("active", true);
  const activeIds = (active ?? []).map((s) => (s.prescription_items as unknown as { catalog_id: string }).catalog_id);
  const allIds = [...new Set([...ids, ...activeIds])];
  const { data: catalog } = allIds.length
    ? await supabase.from("medicine_catalog").select("id, name, ingredients").in("id", allIds)
    : { data: [] };
  const duplicates = findDuplicateIngredients(catalog ?? []).filter((d) => d.medicines.some((m) => ids.includes(m)));

  return NextResponse.json({
    prescription: { ...rx, photoUrl: await signedPhoto(supabase, rx.image_path) },
    items: items ?? [],
    duplicates: duplicates.map((d) => ({ ingredient: d.ingredient, names: d.medicines.map((m) => catalog?.find((c) => c.id === m)?.name ?? m) })),
    canManage: await canManage(supabase, rx.patient_id),
  });
}
