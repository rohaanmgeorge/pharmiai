import { NextResponse } from "next/server";
import { canManage, canView, fail, requireUser } from "@/lib/server/auth";
import { validateCareSettings } from "@/lib/safety/wellness";

const FIELDS = "id, name, refill_days, expiry_alert_days, check_missed, check_idle_hours, check_wait_min, quiet_start, quiet_end, presence, check_consent";

// GET /api/profile/care-settings?patient=<id> — thresholds, quiet hours, presence, check consent.
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const patientId = new URL(request.url).searchParams.get("patient") || user.id;
  if (!(await canView(supabase, patientId))) return fail("Not allowed", 403);

  const { data } = await supabase.from("profiles").select(FIELDS).eq("id", patientId).maybeSingle();
  if (!data) return fail("Not found", 404);
  return NextResponse.json({
    settings: { ...data, quiet_start: String(data.quiet_start).slice(0, 5), quiet_end: String(data.quiet_end).slice(0, 5) },
    isSelf: patientId === user.id,
    canManage: await canManage(supabase, patientId),
  });
}

// PATCH /api/profile/care-settings?patient=<id> — the person or a caregiver (can_manage).
// Uses the user client on purpose: RLS + the guard_profile trigger still apply, and the trigger
// records WHO switched the check on (check_consent_by = auth.uid()).
export async function PATCH(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const patientId = new URL(request.url).searchParams.get("patient") || user.id;
  if (!(await canManage(supabase, patientId))) return fail("Only the person or a caregiver can change these", 403);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const result = validateCareSettings(body);
  if ("error" in result) return fail(result.error);

  const { data, error } = await supabase.from("profiles").update(result.patch).eq("id", patientId).select(FIELDS).maybeSingle();
  if (error || !data) return fail("Could not save. Please try again.");
  return NextResponse.json({ settings: { ...data, quiet_start: String(data.quiet_start).slice(0, 5), quiet_end: String(data.quiet_end).slice(0, 5) } });
}
