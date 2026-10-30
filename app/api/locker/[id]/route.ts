import { NextResponse } from "next/server";
import { canManage, fail, requireUser, signedPhoto } from "@/lib/server/auth";
import { expandShorthand } from "@/lib/safety/shorthand";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Item = {
  id: string;
  dose_code: string;
  duration_days: number;
  food: "before" | "after" | null;
  medicine_catalog: { name: string; strength: string; form: string };
  schedules: { active: boolean } | { active: boolean }[] | null;
};

// GET /api/locker/:id — photo (60 s link), CONFIRMED medicines only, who approved and when.
// RLS: only people who can view this patient get a row back.
export async function GET(request: Request, ctx: RouteContext<"/api/locker/[id]">) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;
  const { id } = await ctx.params;

  const { data: rx } = await supabase
    .from("prescriptions")
    .select("id, patient_id, image_path, state, doctor_name, created_at, approved_by, approved_at")
    .eq("id", id)
    .maybeSingle();
  if (!rx) return fail("Prescription not found", 404);

  const { data } = await supabase
    .from("prescription_items")
    .select("id, dose_code, duration_days, food, medicine_catalog!inner(name, strength, form), schedules(active)")
    .eq("prescription_id", id)
    .eq("status", "verified")
    .order("created_at");
  const items = (data ?? []) as unknown as Item[];

  // Approver's name only. Admin read because a patient may not see a caregiver's profile row.
  let approvedByName: string | null = null;
  if (rx.approved_by) {
    const { data: p } = await supabaseAdmin().from("profiles").select("name").eq("id", rx.approved_by).maybeSingle();
    approvedByName = p?.name || "Family member";
  }

  const medicines = items.map((i) => {
    const s = expandShorthand(i.dose_code); // meaning from our fixed table, never AI
    return {
      id: i.id,
      name: i.medicine_catalog.name,
      strength: i.medicine_catalog.strength,
      form: i.medicine_catalog.form,
      doseCode: i.dose_code,
      doseMeaning: s ? (s.asNeeded ? "when needed" : s.meaning) : null,
      durationDays: i.duration_days,
      food: i.food,
      active: Array.isArray(i.schedules) ? i.schedules.some((x) => x.active) : Boolean(i.schedules?.active),
    };
  });

  return NextResponse.json({
    prescription: {
      id: rx.id,
      patientId: rx.patient_id,
      state: rx.state,
      date: rx.created_at,
      doctorName: rx.doctor_name,
      photoUrl: await signedPhoto(supabase, rx.image_path),
      approvedBy: approvedByName,
      approvedAt: rx.approved_at,
      active: medicines.some((m) => m.active),
    },
    medicines,
    canManage: await canManage(supabase, rx.patient_id),
  });
}
