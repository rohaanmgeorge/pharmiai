import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { shouldTouchActivity } from "@/lib/safety/wellness";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/activity — "the app was opened". Counts as activity for the "Are you okay?" check.
// Writes at most once per 10 minutes; any open check for this person ends as "ok".
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  const { data: me } = await admin.from("profiles").select("last_activity_at").eq("id", user.id).maybeSingle();
  const touched = shouldTouchActivity(me?.last_activity_at);
  if (touched) await admin.from("profiles").update({ last_activity_at: now }).eq("id", user.id);

  const { data: ended } = await admin
    .from("wellness_checks")
    .update({ state: "ok", ended_at: now, ended_by: user.id })
    .eq("patient_id", user.id)
    .in("state", ["asking", "escalating"])
    .select("id");

  return NextResponse.json({ touched, endedChecks: ended?.length ?? 0 });
}
