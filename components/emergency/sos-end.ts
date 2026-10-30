import "server-only";
import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/server/auth";

/** Ends an active SOS. User client: the "end sos" RLS policy (can_manage) decides who may. */
export async function endSos(request: Request, id: string, state: "cancelled" | "resolved") {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;

  const { data, error } = await supabase.from("sos_events").update({ state }).eq("id", id).eq("state", "active").select("id, state").maybeSingle();
  if (error) return fail("Could not end the alert. Please try again.", 500);
  if (!data) {
    // Already ended (e.g. someone else tapped first) → fine; otherwise not found / not allowed.
    const { data: ev } = await supabase.from("sos_events").select("state").eq("id", id).maybeSingle();
    if (!ev) return fail("SOS not found", 404);
    return NextResponse.json({ id, state: ev.state });
  }
  return NextResponse.json(data);
}
