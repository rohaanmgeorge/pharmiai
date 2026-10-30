import { NextResponse } from "next/server";
import { canManage, fail, requireUser } from "@/lib/server/auth";
import { ensureDoseEvents } from "@/lib/server/doses";
import { addDays, istDate } from "@/lib/server/time";
import { safetyLog } from "@/lib/safety/log";
import { findDuplicateIngredients } from "@/lib/safety/medication-math";
import { expandShorthand, normalizeCode } from "@/lib/safety/shorthand";
import { reminderTimes } from "@/lib/safety/slots";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/manual-medicines — add a medicine without a prescription photo.
// { patientId?, catalogId, doseCode, durationDays, food?, stock?, doctorName?, acceptDuplicate? }
// The person picked the exact database entry, a dose from the fixed table and the days: every
// field is human-entered, so it is Verified and gets the same reminders, stock and checks.
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const patientId = typeof b.patientId === "string" && b.patientId ? b.patientId : user.id;
  const catalogId = typeof b.catalogId === "string" ? b.catalogId : "";
  const doseCode = typeof b.doseCode === "string" ? normalizeCode(b.doseCode) : "";
  const durationDays = Number(b.durationDays);
  const food = b.food === "before" || b.food === "after" ? b.food : null;
  const stock = b.stock === undefined || b.stock === "" ? 0 : Number(b.stock);
  const doctorName = typeof b.doctorName === "string" ? b.doctorName.trim().slice(0, 80) : "";

  if (!catalogId) return fail("Please choose the medicine from the list");
  const shorthand = expandShorthand(doseCode);
  if (!shorthand) return fail("Please choose how often to take it");
  const times = reminderTimes(doseCode);
  if (!times) return fail("'When needed' medicines don't get reminders. Choose a fixed time instead, or skip adding it.");
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365) return fail("Days must be between 1 and 365");
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000) return fail("Tablets you have must be between 0 and 1000");
  if (!(await canManage(supabase, patientId))) return fail("You can't add medicines for this person", 403);

  const { data: med } = await supabase.from("medicine_catalog").select("id, name, ingredients, strength").eq("id", catalogId).maybeSingle();
  if (!med) return fail("That medicine is not in our list", 404);

  // Safety check: same active ingredient as something already being taken.
  const { data: active } = await supabase
    .from("schedules")
    .select("prescription_items!inner(medicine_catalog!inner(id, name, ingredients))")
    .eq("patient_id", patientId)
    .eq("active", true);
  const current = (active ?? []).map((s) => (s.prescription_items as unknown as { medicine_catalog: { id: string; name: string; ingredients: string[] } }).medicine_catalog);
  if (current.some((c) => c.id === med.id)) return fail(`${med.name} already has reminders. Edit that one instead of adding it twice.`, 409);
  const dup = findDuplicateIngredients([...current, med]).filter((d) => d.medicines.includes(med.id));
  if (dup.length && b.acceptDuplicate !== true) {
    const names = dup.flatMap((d) => d.medicines).filter((id) => id !== med.id).map((id) => current.find((c) => c.id === id)?.name ?? id);
    return NextResponse.json(
      { error: "duplicate", duplicates: dup.map((d) => ({ ingredient: d.ingredient, names: [...new Set(names)] })) },
      { status: 409 },
    );
  }

  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  // A "prescription" row without a photo keeps the locker, family view and deletion working the same way.
  const { data: rx, error: rxErr } = await admin
    .from("prescriptions")
    .insert({ patient_id: patientId, uploaded_by: user.id, image_path: null, source: "manual", state: "approved", approved_by: user.id, approved_at: now, doctor_name: doctorName || null })
    .select("id")
    .single();
  if (rxErr || !rx) return fail("Could not save", 500);

  const { data: item, error: itemErr } = await admin
    .from("prescription_items")
    .insert({
      prescription_id: rx.id,
      patient_id: patientId,
      entry: "manual",
      text_a: med.name,
      catalog_id: med.id,
      strength: med.strength,
      dose_code: doseCode,
      duration_days: durationDays,
      food,
      status: "verified",
      confirmed_by: user.id,
      confirmed_at: now,
    })
    .select("id")
    .single();
  if (itemErr || !item) {
    await admin.from("prescriptions").delete().eq("id", rx.id);
    return fail("Could not save", 500);
  }

  const today = istDate();
  // Insert as the user, so RLS and the require_verified trigger both still apply.
  const { data: schedule, error: schErr } = await supabase
    .from("schedules")
    .insert({ patient_id: patientId, item_id: item.id, slot_times: times, start_date: today, end_date: addDays(today, durationDays - 1), stock })
    .select("id")
    .single();
  if (schErr || !schedule) {
    await admin.from("prescriptions").delete().eq("id", rx.id);
    return fail("Could not create reminders", 500);
  }

  await ensureDoseEvents(admin, [patientId]);
  await safetyLog([{ actor: user.id, patientId, itemId: item.id, event: "manual_entry", payload: { catalogId: med.id, doseCode, durationDays, duplicateAccepted: dup.length > 0 } }]);
  return NextResponse.json({ scheduleId: schedule.id, name: med.name, times, meaning: shorthand.meaning });
}
