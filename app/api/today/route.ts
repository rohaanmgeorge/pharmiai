import { NextResponse } from "next/server";
import { canView, fail, requireUser, signedPhoto } from "@/lib/server/auth";
import { addDays, istClock, istDate, istMoment } from "@/lib/server/time";
import { daysOfStockLeft } from "@/lib/safety/medication-math";
import { slotOf } from "@/lib/safety/slots";

type Row = {
  id: string;
  due_at: string;
  state: string;
  snooze_until: string | null;
  schedule_id: string;
  schedules: {
    stock: number;
    slot_times: string[];
    end_date: string;
    pill_photo_path: string | null;
    prescription_items: { id: string; catalog_id: string; strength: string; food: string | null; medicine_catalog: { name: string; form: string } };
  };
};

// GET /api/today?patient=<id> — today's doses (verified medicines only, by construction) + simple alerts.
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const patientId = new URL(request.url).searchParams.get("patient") || user.id;
  if (!(await canView(supabase, patientId))) return fail("Not allowed", 403);

  const today = istDate();
  const { data } = await supabase
    .from("dose_events")
    .select(
      "id, due_at, state, snooze_until, schedule_id, schedules!inner(stock, slot_times, end_date, pill_photo_path, prescription_items!inner(id, catalog_id, strength, food, medicine_catalog!inner(name, form)))",
    )
    .eq("patient_id", patientId)
    .gte("due_at", istMoment(today, "00:00").toISOString())
    .lt("due_at", istMoment(addDays(today, 1), "00:00").toISOString())
    .order("due_at");
  const rows = (data ?? []) as unknown as Row[];

  const photos = new Map<string, string | null>();
  for (const r of rows) {
    if (!photos.has(r.schedule_id)) photos.set(r.schedule_id, await signedPhoto(supabase, r.schedules.pill_photo_path));
  }

  const doses = rows.map((r) => {
    const item = r.schedules.prescription_items;
    const time = istClock(r.due_at);
    return {
      id: r.id,
      scheduleId: r.schedule_id,
      catalogId: item.catalog_id,
      name: item.medicine_catalog.name,
      form: item.medicine_catalog.form,
      food: item.food,
      time,
      slot: slotOf(time),
      state: r.state,
      photoUrl: photos.get(r.schedule_id) ?? null,
    };
  });

  // Alerts: low stock and course end (plain arithmetic).
  const { data: schedules } = await supabase
    .from("schedules")
    .select("id, stock, slot_times, end_date, prescription_items!inner(catalog_id, medicine_catalog!inner(name))")
    .eq("patient_id", patientId)
    .eq("active", true);
  const alerts: { kind: "low_stock" | "course_end"; scheduleId: string; name: string; daysLeft?: number; stock?: number; endDate?: string }[] = [];
  for (const s of schedules ?? []) {
    const name = (s.prescription_items as unknown as { medicine_catalog: { name: string } }).medicine_catalog.name;
    const days = daysOfStockLeft(s.stock, (s.slot_times as string[]).length);
    if (days !== null && days <= 5) alerts.push({ kind: "low_stock", scheduleId: s.id, name, daysLeft: days, stock: s.stock });
    if (s.end_date <= addDays(today, 2)) alerts.push({ kind: "course_end", scheduleId: s.id, name, endDate: s.end_date });
  }

  return NextResponse.json({ date: today, patientId, doses, alerts });
}
