import { NextResponse } from "next/server";
import { canManage, fail, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/checks/:id — the "Are you okay?" check, its alert ladder, and emergency contacts.
// RLS ("view checks" = can_view) decides if the caller may see it at all.
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const { id } = await ctx.params;

  const { data: check } = await supabase
    .from("wellness_checks")
    .select("id, patient_id, state, level, started_at, last_step_at, ended_at, ended_by")
    .eq("id", id)
    .maybeSingle();
  if (!check) return fail("Check not found", 404);

  const [alerts, contacts, patient] = await Promise.all([
    supabase.from("check_alerts").select("id, level, member_id, contact_id, channel, sent_at, ack, acked_by, acked_at").eq("check_id", id).order("sent_at"),
    supabase.from("emergency_contacts").select("id, name, phone, relation, priority").eq("patient_id", check.patient_id).order("priority"),
    supabase.from("profiles").select("name, check_wait_min").eq("id", check.patient_id).maybeSingle(),
  ]);

  // Names of circle members on the ladder (only names; other members' profiles may be hidden by RLS).
  const ids = [...new Set((alerts.data ?? []).flatMap((a) => [a.member_id, a.acked_by]).concat(check.ended_by).filter(Boolean))] as string[];
  const { data: people } = ids.length ? await supabaseAdmin().from("profiles").select("id, name").in("id", ids) : { data: [] };
  const nameOf = (pid: string | null) => (pid ? (people ?? []).find((p) => p.id === pid)?.name || "Family member" : null);

  return NextResponse.json(
    {
      check: { ...check, endedByName: nameOf(check.ended_by) },
      patient: { id: check.patient_id, name: patient.data?.name || "your family member", waitMin: patient.data?.check_wait_min ?? 15 },
      alerts: (alerts.data ?? []).map((a) => ({ ...a, memberName: nameOf(a.member_id), ackedByName: nameOf(a.acked_by), mine: a.member_id === user.id })),
      contacts: contacts.data ?? [],
      isPatient: check.patient_id === user.id,
      canManage: await canManage(supabase, check.patient_id),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
