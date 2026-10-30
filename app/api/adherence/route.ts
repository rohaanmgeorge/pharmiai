import { NextResponse } from "next/server";
import { canView, fail, requireUser } from "@/lib/server/auth";
import { addDays, istDate, istMoment } from "@/lib/server/time";
import { weekAdherence } from "@/lib/safety/wellness";

// GET /api/adherence?patient=<id> — last 7 days (India time): doses taken vs doses that were due.
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const patientId = new URL(request.url).searchParams.get("patient") || user.id;
  if (!(await canView(supabase, patientId))) return fail("Not allowed", 403);

  const today = istDate();
  const { data } = await supabase
    .from("dose_events")
    .select("due_at, state")
    .eq("patient_id", patientId)
    .gte("due_at", istMoment(addDays(today, -6), "00:00").toISOString())
    .lt("due_at", istMoment(addDays(today, 1), "00:00").toISOString());

  return NextResponse.json({ patientId, days: weekAdherence(data ?? []) }, { headers: { "Cache-Control": "no-store" } });
}
