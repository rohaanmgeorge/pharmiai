import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureDoseEvents } from "./doses";
import { msg } from "./messages";
import { claimOnce, sendPush } from "./push";
import { addDays, inQuietHours, istClock, istDate } from "./time";
import { predictRunout } from "@/lib/safety/medication-math";

// Everything that happens on a clock. Called every minute by Supabase pg_cron (via /api/cron/tick).
// Each message is guarded by claimOnce(key), so running twice never sends twice.
// Timing rules live here in code; the AI never decides when to alert anyone.

const MISSED_AFTER_MIN = 30;
const min = (n: number) => n * 60 * 1000;

type Profile = {
  id: string;
  name: string;
  lang: string;
  refill_days: number;
  expiry_alert_days: number[];
  check_missed: number;
  check_idle_hours: number;
  check_wait_min: number;
  quiet_start: string;
  quiet_end: string;
  presence: string;
  check_consent: boolean;
  last_activity_at: string;
};

async function circleOf(admin: SupabaseClient, patientId: string) {
  const { data } = await admin
    .from("care_circle_members")
    .select("member_id, role, profiles!care_circle_members_member_id_fkey(lang)")
    .eq("patient_id", patientId)
    .eq("consent", "given");
  return (data ?? []).map((m) => ({ id: m.member_id as string, role: m.role as string, lang: (m.profiles as unknown as { lang: string } | null)?.lang ?? "en" }));
}

export async function runTick(admin: SupabaseClient, patientIds?: string[]) {
  const now = new Date();
  const today = istDate(now);
  const report = { reminders: 0, missed: 0, refills: 0, expiry: 0, checks: 0 };
  // When run from the "Run now" button, only touch the people this user looks after.
  const scope = <Q,>(q: Q): Q => (patientIds ? (q as unknown as { in: (c: string, v: string[]) => Q }).in("patient_id", patientIds) : q);

  let pq = admin.from("profiles").select("*");
  if (patientIds) pq = pq.in("id", patientIds);
  const { data: profileRows } = await pq;
  const profiles = new Map((profileRows ?? []).map((p) => [p.id as string, p as Profile]));

  // Heartbeat: lets Settings show "reminder clock last ran at hh:mm" (only for the real clock).
  if (!patientIds) await admin.from("sent_notifications").upsert({ key: "heartbeat", sent_at: now.toISOString() });

  // 1. Dose rows for today and tomorrow; courses that ended stop.
  await ensureDoseEvents(admin, patientIds);
  await scope(admin.from("schedules").update({ active: false }).eq("active", true).lt("end_date", today));

  // 2. Snooze over → due again.
  await scope(admin.from("dose_events").update({ state: "pending" }).eq("state", "snoozed").lte("snooze_until", now.toISOString()));

  // 3. Reminders for doses that are due now.
  const { data: due } = await scope(
    admin
      .from("dose_events")
      .select("id, patient_id, due_at, acted_at, schedules!inner(pill_photo_path, prescription_items!inner(medicine_catalog!inner(name)))")
      .eq("state", "pending")
      .lte("due_at", now.toISOString())
      .gt("due_at", new Date(now.getTime() - min(MISSED_AFTER_MIN)).toISOString()),
  );
  for (const d of due ?? []) {
    // A snoozed dose gets a fresh key (acted_at = when snooze was tapped).
    if (!(await claimOnce(admin, `dose:${d.id}:${d.acted_at ?? "first"}`))) continue;
    const s = d.schedules as unknown as { pill_photo_path: string | null; prescription_items: { medicine_catalog: { name: string } } };
    const lang = profiles.get(d.patient_id)?.lang;
    const photo = s.pill_photo_path ? (await admin.storage.from("rx-images").createSignedUrl(s.pill_photo_path, 60 * 60)).data?.signedUrl : null;
    await sendPush(admin, d.patient_id, {
      title: msg("doseDue", lang, { med: s.prescription_items.medicine_catalog.name, time: istClock(d.due_at) }),
      body: msg("doseDueBody", lang),
      url: "/today",
      tag: `dose-${d.id}`,
      image: photo,
      actions: [
        { action: "taken", title: "✓ Taken" },
        { action: "snoozed", title: "Snooze 10 min" },
      ],
      data: { doseId: d.id },
    });
    report.reminders++;
  }

  // 4. Not confirmed 30 min after due → missed, and the family is told (in their own language).
  const { data: late } = await scope(
    admin
      .from("dose_events")
      .update({ state: "missed" })
      .eq("state", "pending")
      .lt("due_at", new Date(now.getTime() - min(MISSED_AFTER_MIN)).toISOString())
      .select("id, patient_id, due_at, schedules!inner(prescription_items!inner(medicine_catalog!inner(name)))"),
  );
  for (const d of late ?? []) {
    if (!(await claimOnce(admin, `missed:${d.id}`))) continue;
    const p = profiles.get(d.patient_id);
    const med = (d.schedules as unknown as { prescription_items: { medicine_catalog: { name: string } } }).prescription_items.medicine_catalog.name;
    for (const m of await circleOf(admin, d.patient_id)) {
      await sendPush(admin, m.id, {
        title: msg("missedTitle", m.lang, { name: p?.name || "Your family member" }),
        body: msg("missedBody", m.lang, { med, time: istClock(d.due_at) }),
        url: `/family/${d.patient_id}`,
        tag: `missed-${d.id}`,
      });
      await admin.from("escalations").upsert({ dose_event_id: d.id, patient_id: d.patient_id, level: 1, member_id: m.id, channel: "push" }, { onConflict: "dose_event_id,level", ignoreDuplicates: true });
    }
    report.missed++;
  }

  // 5. Refill suggestions: deterministic run-out from stock (lowered by every confirmed Taken).
  await scope(admin.from("refill_suggestions").update({ state: "open" }).eq("state", "later").lte("later_until", now.toISOString()));
  const { data: active } = await scope(
    admin.from("schedules").select("id, patient_id, stock, slot_times, prescription_items!inner(medicine_catalog!inner(name))").eq("active", true),
  );
  for (const s of active ?? []) {
    const p = profiles.get(s.patient_id);
    const r = predictRunout(s.stock, (s.slot_times as string[]).length, today);
    if (!p || !r || r.daysLeft > p.refill_days) continue;
    const { error } = await admin
      .from("refill_suggestions")
      .insert({ patient_id: s.patient_id, schedule_id: s.id, days_left: r.daysLeft, runout_date: r.runoutDate, lang: p.lang });
    if (error) continue; // one already open
    if (!(await claimOnce(admin, `refill:${s.id}:${r.runoutDate}`))) continue;
    const med = (s.prescription_items as unknown as { medicine_catalog: { name: string } }).medicine_catalog.name;
    for (const who of [{ id: s.patient_id, lang: p.lang }, ...(await circleOf(admin, s.patient_id)).filter((m) => m.role === "caregiver")]) {
      await sendPush(admin, who.id, { title: msg("refillTitle", who.lang, { med, days: r.daysLeft }), body: msg("refillBody", who.lang), url: "/refills", tag: `refill-${s.id}` });
    }
    report.refills++;
  }

  // 6. Expiry alerts (30/7/0 days by default) and expired strips leave usable stock.
  const { data: strips } = await scope(
    admin.from("strips").select("id, patient_id, expiry_month, quantity, schedule_id, medicine_catalog(name)").eq("state", "in_use").not("expiry_month", "is", null),
  );
  for (const st of strips ?? []) {
    const p = profiles.get(st.patient_id);
    if (!p) continue;
    const lastDay = addDays(addDays(st.expiry_month as string, 32).slice(0, 8) + "01", -1); // last day of expiry month
    const daysTo = Math.round((Date.parse(lastDay) - Date.parse(today)) / 86400000);
    const med = (st.medicine_catalog as unknown as { name: string } | null)?.name ?? "Medicine";
    const audience = [{ id: st.patient_id, lang: p.lang }, ...(await circleOf(admin, st.patient_id)).filter((m) => m.role === "caregiver")];
    if (daysTo < 0) {
      await admin.from("strips").update({ state: "expired" }).eq("id", st.id);
      if (st.schedule_id && st.quantity) {
        const { data: sch } = await admin.from("schedules").select("stock").eq("id", st.schedule_id).single();
        if (sch) await admin.from("schedules").update({ stock: Math.max(0, sch.stock - st.quantity) }).eq("id", st.schedule_id);
      }
      if (await claimOnce(admin, `expiry:${st.id}:expired`)) {
        for (const who of audience) await sendPush(admin, who.id, { title: msg("expiredTitle", who.lang, { med }), body: msg("expiryBody", who.lang), url: "/expiry" });
        report.expiry++;
      }
      continue;
    }
    const threshold = [...p.expiry_alert_days].sort((a, b) => a - b).find((d) => daysTo <= d);
    if (threshold === undefined || !(await claimOnce(admin, `expiry:${st.id}:${threshold}`))) continue;
    for (const who of audience) await sendPush(admin, who.id, { title: msg("expiryTitle", who.lang, { med, days: daysTo }), body: msg("expiryBody", who.lang), url: "/expiry" });
    report.expiry++;
  }

  // 7. "Are you okay?" check — only with consent, at home, outside quiet hours.
  for (const p of profiles.values()) {
    if (!p.check_consent || p.presence !== "home") continue;
    const { data: open } = await admin.from("wellness_checks").select("*").eq("patient_id", p.id).in("state", ["asking", "escalating"]).maybeSingle();
    if (open) {
      if (now.getTime() - Date.parse(open.last_step_at) < min(p.check_wait_min) || open.level >= 2) continue;
      const level = open.level + 1;
      if (!(await claimOnce(admin, `check:${open.id}:L${level}`))) continue;
      await admin.from("wellness_checks").update({ state: "escalating", level, last_step_at: now.toISOString() }).eq("id", open.id);
      const circle = await circleOf(admin, p.id);
      // Level 1: family with the app. Level 2: emergency contacts (family gets one-tap call/WhatsApp links).
      if (level === 1) {
        for (const m of circle) {
          await sendPush(admin, m.id, { title: msg("checkTitle", m.lang, { name: p.name }), body: msg("checkBody", m.lang, { name: p.name }), url: `/checks/${open.id}`, tag: `check-${open.id}` });
          await admin.from("check_alerts").insert({ check_id: open.id, patient_id: p.id, level, member_id: m.id, channel: "push" });
        }
      } else {
        const { data: contacts } = await admin.from("emergency_contacts").select("id").eq("patient_id", p.id).order("priority");
        for (const c of contacts ?? []) await admin.from("check_alerts").insert({ check_id: open.id, patient_id: p.id, level, contact_id: c.id, channel: "link" });
        for (const m of circle) {
          await sendPush(admin, m.id, { title: msg("checkTitle", m.lang, { name: p.name }), body: msg("checkBody", m.lang, { name: p.name }), url: `/checks/${open.id}`, tag: `check-${open.id}` });
        }
      }
      report.checks++;
      continue;
    }
    if (inQuietHours(p.quiet_start, p.quiet_end, now)) continue;
    if (now.getTime() - Date.parse(p.last_activity_at) < p.check_idle_hours * 60 * 60 * 1000) continue;
    const { data: recent } = await admin
      .from("dose_events")
      .select("id, state")
      .eq("patient_id", p.id)
      .lt("due_at", now.toISOString())
      .neq("state", "pending")
      .order("due_at", { ascending: false })
      .limit(p.check_missed);
    if (!recent || recent.length < p.check_missed || recent.some((d) => d.state !== "missed")) continue;
    if (!(await claimOnce(admin, `checkstart:${recent[0].id}`))) continue;
    const { data: check, error } = await admin.from("wellness_checks").insert({ patient_id: p.id, trigger_dose_id: recent[0].id }).select("id").single();
    if (error || !check) continue;
    await sendPush(admin, p.id, {
      title: msg("okayTitle", p.lang),
      body: msg("okayBody", p.lang),
      url: `/okay/${check.id}`,
      tag: `okay-${check.id}`,
      actions: [{ action: "okay", title: "I'm okay" }],
      data: { checkId: check.id },
    });
    report.checks++;
  }

  // 8. Once a day: delete strip photos 30 days after the strip expired or was finished.
  if (!patientIds && (await claimOnce(admin, `cleanup:${today}`))) {
    const cutoff = new Date(now.getTime() - 30 * 86400000).toISOString();
    const { data: old } = await admin.from("strips").select("id, image_path").in("state", ["finished", "expired"]).neq("image_path", "").lt("finished_at", cutoff);
    for (const o of old ?? []) {
      await admin.storage.from("rx-images").remove([o.image_path]);
      await admin.from("strips").update({ image_path: "" }).eq("id", o.id);
      // A reminder that used this photo would point at a deleted file: clear it too.
      await admin.from("schedules").update({ pill_photo_path: null }).eq("pill_photo_path", o.image_path);
    }
  }

  return report;
}
