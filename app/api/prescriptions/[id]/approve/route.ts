import { NextResponse } from "next/server";
import { canManage, fail, requireUser } from "@/lib/server/auth";
import { ensureDoseEvents } from "@/lib/server/doses";
import { addDays, istDate } from "@/lib/server/time";
import { safetyLog } from "@/lib/safety/log";
import { reminderTimes } from "@/lib/safety/slots";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/prescriptions/:id/approve  { stock?: { [itemId]: number } }
// Creates reminders for VERIFIED medicines only. The database trigger require_verified
// rejects anything else, even if this code had a bug.
export async function POST(request: Request, ctx: RouteContext<"/api/prescriptions/[id]/approve">) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { stock?: Record<string, unknown> };

  const { data: rx } = await supabase.from("prescriptions").select("id, patient_id").eq("id", id).maybeSingle();
  if (!rx) return fail("Prescription not found", 404);
  if (!(await canManage(supabase, rx.patient_id))) return fail("Not allowed", 403);

  const { data: items } = await supabase
    .from("prescription_items")
    .select("id, dose_code, duration_days, status, schedules(id)")
    .eq("prescription_id", id)
    .eq("status", "verified");

  const today = istDate();
  const rows = (items ?? [])
    .filter((i) => !(i.schedules as unknown as { id: string }[] | null)?.length && !(i.schedules as unknown as { id: string } | null)?.id)
    .map((i) => {
      const times = reminderTimes(i.dose_code!);
      if (!times) return null; // "when needed": no fixed reminder
      const typed = Number(body.stock?.[i.id]);
      return {
        patient_id: rx.patient_id,
        item_id: i.id,
        slot_times: times,
        start_date: today,
        end_date: addDays(today, i.duration_days! - 1),
        stock: Number.isInteger(typed) && typed >= 0 && typed <= 1000 ? typed : 0,
      };
    })
    .filter((r) => r !== null);

  if (rows.length) {
    // Insert as the user, so RLS and the require_verified trigger both apply.
    const { error } = await supabase.from("schedules").insert(rows);
    if (error) return fail("Could not create reminders", 500);
  }

  const admin = supabaseAdmin();
  await admin.from("prescriptions").update({ state: "approved", approved_by: user.id, approved_at: new Date().toISOString() }).eq("id", id);
  await ensureDoseEvents(admin, [rx.patient_id]);
  await safetyLog([{ actor: user.id, patientId: rx.patient_id, event: "approved", payload: { prescription: id, schedules: rows.length } }]);
  return NextResponse.json({ schedules: rows.length });
}
