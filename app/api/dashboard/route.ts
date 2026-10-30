import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { addDays, istDate, istMoment } from "@/lib/server/time";
import { daysOfStockLeft } from "@/lib/safety/medication-math";

// GET /api/dashboard — one summary per person I can view: me (if I have medicines) + everyone
// whose circle I'm in with consent. Uses the user client, so RLS decides what's visible.
// Never cached: family health data must not sit on a device.
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const { data: links } = await supabase
    .from("care_circle_members")
    .select("patient_id, role")
    .eq("member_id", user.id)
    .eq("consent", "given");
  const roleOf = new Map<string, string>([[user.id, "self"], ...(links ?? []).map((l) => [l.patient_id as string, l.role as string] as [string, string])]);
  // ?patient=<id> → just that person, plus their timeline and emergency contacts (member detail screen).
  const only = new URL(request.url).searchParams.get("patient");
  if (only && !roleOf.has(only)) return fail("Not allowed", 403);
  const ids = only ? [only] : [...roleOf.keys()];

  const today = istDate();
  const dayStart = istMoment(today, "00:00").toISOString();
  const dayEnd = istMoment(addDays(today, 1), "00:00").toISOString();

  // One query per table for everyone at once (not one per person).
  const [profiles, doses, schedules, strips, checks, sos] = await Promise.all([
    supabase.from("profiles").select("id, name, presence, last_activity_at, refill_days, expiry_alert_days, check_consent").in("id", ids),
    supabase.from("dose_events").select("patient_id, state, due_at").in("patient_id", ids).gte("due_at", dayStart).lt("due_at", dayEnd),
    supabase.from("schedules").select("patient_id, stock, slot_times").in("patient_id", ids).eq("active", true),
    supabase.from("strips").select("patient_id, expiry_month, state").in("patient_id", ids).eq("state", "in_use").not("expiry_month", "is", null),
    supabase.from("wellness_checks").select("id, patient_id, state, level, started_at").in("patient_id", ids).in("state", ["asking", "escalating"]),
    supabase.from("sos_events").select("id, patient_id, started_at, is_test").in("patient_id", ids).eq("state", "active"),
  ]);

  const now = Date.now();
  const people = (profiles.data ?? []).map((p) => {
    const myDoses = (doses.data ?? []).filter((d) => d.patient_id === p.id);
    const mySchedules = (schedules.data ?? []).filter((s) => s.patient_id === p.id);
    const lowStock = mySchedules.filter((s) => {
      const days = daysOfStockLeft(s.stock, (s.slot_times as string[]).length);
      return days !== null && days <= p.refill_days;
    }).length;
    // Expiring soon = within the largest alert window (30 days by default), or already past.
    const window = Math.max(0, ...((p.expiry_alert_days as number[]) ?? [30]));
    const expiringSoon = (strips.data ?? []).filter((s) => {
      if (s.patient_id !== p.id) return false;
      const lastDay = addDays(addDays(s.expiry_month as string, 32).slice(0, 8) + "01", -1);
      return (Date.parse(lastDay) - now) / 86400000 <= window;
    }).length;
    const next = myDoses.filter((d) => d.state === "pending" && Date.parse(d.due_at) > now).sort((a, b) => a.due_at.localeCompare(b.due_at))[0];
    const check = (checks.data ?? []).find((c) => c.patient_id === p.id) ?? null;
    const activeSos = (sos.data ?? []).find((s) => s.patient_id === p.id) ?? null;
    return {
      id: p.id as string,
      name: (p.name as string) || "PharmiAI user",
      role: roleOf.get(p.id) as "self" | "caregiver" | "viewer",
      canManage: roleOf.get(p.id) !== "viewer",
      presence: p.presence as string,
      lastActivityAt: p.last_activity_at as string,
      checkConsent: p.check_consent as boolean,
      doses: {
        taken: myDoses.filter((d) => d.state === "taken").length,
        missed: myDoses.filter((d) => d.state === "missed").length,
        total: myDoses.length,
        nextAt: next?.due_at ?? null,
      },
      medicines: mySchedules.length,
      lowStock,
      expiringSoon,
      check: check && { id: check.id as string, state: check.state as string, level: check.level as number, startedAt: check.started_at as string },
      sos: activeSos && { id: activeSos.id as string, startedAt: activeSos.started_at as string, isTest: activeSos.is_test as boolean },
    };
  });

  if (only) {
    const person = people[0];
    if (!person) return fail("Not found", 404);
    const extra = await detailFor(supabase, only);
    return NextResponse.json({ me: user.id, person, ...extra, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  }

  // Show myself only if I actually have medicines (or something urgent) — otherwise it's just noise.
  const visible = people
    .filter((p) => p.role !== "self" || p.medicines > 0 || p.check || p.sos)
    .sort((a, b) => (a.role === "self" ? 1 : 0) - (b.role === "self" ? 1 : 0) || a.name.localeCompare(b.name));

  return NextResponse.json({ me: user.id, people: visible, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}

/** Last 7 days of alerts about this person (missed-dose pushes + "Are you okay?" ladder), newest first. */
async function detailFor(supabase: SupabaseClient, patientId: string) {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const [esc, checks, alerts, contacts] = await Promise.all([
    supabase.from("escalations").select("id, level, member_id, sent_at, acked_at").eq("patient_id", patientId).gte("sent_at", since),
    supabase.from("wellness_checks").select("id, state, started_at, ended_at, ended_by").eq("patient_id", patientId).gte("started_at", since),
    supabase.from("check_alerts").select("id, check_id, level, member_id, contact_id, sent_at, ack, acked_by, acked_at").eq("patient_id", patientId).gte("sent_at", since),
    supabase.from("emergency_contacts").select("id, name, phone, relation, priority").eq("patient_id", patientId).order("priority"),
  ]);

  // Circle members' names (other members' profiles may be hidden by RLS; only names are read).
  const memberIds = new Set<string>();
  for (const e of esc.data ?? []) if (e.member_id) memberIds.add(e.member_id);
  for (const a of alerts.data ?? []) for (const id of [a.member_id, a.acked_by]) if (id) memberIds.add(id);
  for (const c of checks.data ?? []) if (c.ended_by) memberIds.add(c.ended_by);
  const { data: people } = memberIds.size ? await supabaseAdmin().from("profiles").select("id, name").in("id", [...memberIds]) : { data: [] };
  const nameOf = (id: string | null) => (people ?? []).find((p) => p.id === id)?.name || "Family member";
  const contactName = (id: string | null) => (contacts.data ?? []).find((c) => c.id === id)?.name || "Emergency contact";

  type Event = { id: string; at: string; kind: "missed" | "check" | "alert" | "ack" | "ended"; text: string; checkId?: string };
  const events: Event[] = [];
  for (const e of esc.data ?? []) events.push({ id: `esc-${e.id}`, at: e.sent_at, kind: "missed", text: `Missed dose — ${nameOf(e.member_id)} was notified` });
  for (const c of checks.data ?? []) {
    events.push({ id: `chk-${c.id}`, at: c.started_at, kind: "check", text: "Asked \"Are you okay?\"", checkId: c.id });
    if (c.ended_at) {
      const how = { ok: "Answered \"I'm okay\"", acknowledged: `${nameOf(c.ended_by)} reached them`, sos: `${nameOf(c.ended_by)} escalated to SOS`, stopped: "Check stopped" }[c.state as string];
      if (how) events.push({ id: `end-${c.id}`, at: c.ended_at, kind: "ended", text: how, checkId: c.id });
    }
  }
  for (const a of alerts.data ?? []) {
    // Rows made by an ack from someone who wasn't alerted have sent_at = acked_at: not an alert.
    const selfMade = a.member_id && a.member_id === a.acked_by && a.sent_at === a.acked_at;
    if (!selfMade) {
      const who = a.member_id ? nameOf(a.member_id) : contactName(a.contact_id);
      events.push({ id: `al-${a.id}`, at: a.sent_at, kind: "alert", text: a.level >= 2 ? `${who} (emergency contact) alerted` : `${who} alerted`, checkId: a.check_id });
    }
    if (a.ack && a.acked_at) {
      events.push({ id: `ack-${a.id}`, at: a.acked_at, kind: "ack", text: `${nameOf(a.acked_by)}: ${a.ack === "reached" ? "reached them" : "checking"}`, checkId: a.check_id });
    }
  }
  events.sort((x, y) => y.at.localeCompare(x.at));
  return { timeline: events.slice(0, 30), contacts: contacts.data ?? [] };
}
