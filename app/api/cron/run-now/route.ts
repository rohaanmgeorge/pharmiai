import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { runTick } from "@/lib/server/tick";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 60;

// POST /api/cron/run-now — the "Run reminders now" button (demo / if pg_cron misfires).
// Runs the same clock jobs, but only for people this user looks after.
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const { data: links } = await supabase.from("care_circle_members").select("patient_id").eq("member_id", user.id).eq("consent", "given").eq("role", "caregiver");
  const ids = [user.id, ...(links ?? []).map((l) => l.patient_id as string)];
  return NextResponse.json(await runTick(supabaseAdmin(), ids));
}
