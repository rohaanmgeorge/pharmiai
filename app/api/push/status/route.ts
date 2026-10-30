import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { pushConfigured } from "@/lib/server/push";
import { supabaseAdmin } from "@/lib/supabase/admin";

// GET /api/push/status — is everything needed for reminders in place?
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const { count } = await supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  // The heartbeat is not user data: read it with the admin client (sent_notifications has no user policies).
  const { data: beat } = await supabaseAdmin().from("sent_notifications").select("sent_at").eq("key", "heartbeat").maybeSingle();
  return NextResponse.json({ serverReady: pushConfigured(), myDevices: count ?? 0, lastTick: beat?.sent_at ?? null });
}
