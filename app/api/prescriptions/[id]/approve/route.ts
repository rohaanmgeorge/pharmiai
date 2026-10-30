import { NextResponse } from "next/server";
import { canManage, fail, requireUser } from "@/lib/server/auth";
import { ensureDoseEvents } from "@/lib/server/doses";
import { addDays, istDate } from "@/lib/server/time";
import { safetyLog } from "@/lib/safety/log";
import { reminderTimes } from "@/lib/safety/slots";
import { OPEN_ENDED_DAYS } from "@/lib/safety/auto-verify";
import { expandShorthand, normalizeCode } from "@/lib/safety/shorthand";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/prescriptions/:id/approve  { stock?: { [itemId]: number } }
// Creates reminders for VERIFIED medicines only. The database trigger require_verified
// rejects anything else, even if this code had a bug.
export async function POST(request: Request, ctx: RouteContext<"/api/prescriptions/[id]/approve">) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const { id } = await ctx.params;
  // fill: timing/days the person chose on the review screen for lines where none was written.
  const body = (await request.json().catch(() => ({}))) as { stock?: Record<string, unknown>; fill?: Record<string, { doseCode?: unknown; durationDays?: unknown }> };

  const { data: rx } = await supabase.from("prescriptions").select("id, patient_id").eq("id", id).maybeSingle();
  if (!rx) return fail("Prescription not found", 404);
  if (!(await canManage(supabase, rx.patient_id))) return fail("Not allowed", 403);

  const { data: items } = await supabase
    .from("prescription_items")
    .select("id, dose_code, duration_days, status, schedules(id)")
    .eq("prescription_id", id)
    .eq("status", "verified");

  // Apply what the person filled in, only where the prescription had nothing (never overwrite a reading).
  const admin = supabaseAdmin();
  for (const i of items ?? []) {
    const f = body.fill?.[i.id];
    if (!f) continue;
    const patch: Record<string, unknown> = {};
    if (!i.dose_code && typeof f.doseCode === "string" && expandShorthand(f.doseCode)) patch.dose_code = normalizeCode(f.doseCode);
    const days = Number(f.durationDays);
    if (!i.duration_days && Number.isInteger(days) && days >= 1 && days <= 365) patch.duration_days = days;
    if (Object.keys(patch).length) {
      await admin.from("prescription_items").update(patch).eq("id", i.id);
      Object.assign(i, patch);
    }
  }

  const today = istDate();
  const rows = (items ?? [])
    .filter((i) => !(i.schedules as unknown as { id: string }[] | null)?.length && !(i.schedules as unknown as { id: string } | null)?.id)
    .map((i) => {
      const times = i.dose_code ? reminderTimes(i.dose_code) : null;
      if (!times) return null; // no timing written, or "when needed": no fixed reminder
      const typed = Number(body.stock?.[i.id]);
      return {
        patient_id: rx.patient_id,
        item_id: i.id,
        slot_times: times,
        start_date: today,
        // No days written → open-ended reminders (shown as a note on the review screen).
        end_date: addDays(today, (i.duration_days ?? OPEN_ENDED_DAYS) - 1),
        stock: Number.isInteger(typed) && typed >= 0 && typed <= 1000 ? typed : 0,
      };
    })
    .filter((r) => r !== null);

  if (rows.length) {
    // Insert as the user, so RLS and the require_verified trigger both apply.
    const { error } = await supabase.from("schedules").insert(rows);
    if (error) return fail("Could not create reminders", 500);
  }

  await admin.from("prescriptions").update({ state: "approved", approved_by: user.id, approved_at: new Date().toISOString() }).eq("id", id);
  await ensureDoseEvents(admin, [rx.patient_id]);
  await safetyLog([{ actor: user.id, patientId: rx.patient_id, event: "approved", payload: { prescription: id, schedules: rows.length } }]);
  return NextResponse.json({ schedules: rows.length });
}
