import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { sendPushDetailed } from "@/lib/server/push";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/push/test — sends a test notification to my own devices only.
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const result = await sendPushDetailed(supabaseAdmin(), auth.user.id, {
    title: "PharmiAI test reminder",
    body: "Notifications work on this device.",
    url: "/settings",
    tag: "test",
  });
  return NextResponse.json(result);
}
