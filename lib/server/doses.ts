import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { istDate, istMoment } from "./time";

// Creates today's (and tomorrow's) dose rows for active schedules. Safe to run every minute:
// (schedule_id, due_at) is unique, so existing rows are left alone.
export async function ensureDoseEvents(admin: SupabaseClient, patientIds?: string[]) {
  const today = istDate();
  const tomorrow = istDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
  let q = admin.from("schedules").select("id, patient_id, slot_times, start_date, end_date").eq("active", true).lte("start_date", tomorrow).gte("end_date", today);
  if (patientIds) q = q.in("patient_id", patientIds);
  const { data: schedules } = await q;

  const rows: { schedule_id: string; patient_id: string; due_at: string }[] = [];
  for (const s of schedules ?? []) {
    for (const day of [today, tomorrow]) {
      if (day < s.start_date || day > s.end_date) continue;
      for (const t of s.slot_times as string[]) rows.push({ schedule_id: s.id, patient_id: s.patient_id, due_at: istMoment(day, t).toISOString() });
    }
  }
  if (rows.length) await admin.from("dose_events").upsert(rows, { onConflict: "schedule_id,due_at", ignoreDuplicates: true });
}
