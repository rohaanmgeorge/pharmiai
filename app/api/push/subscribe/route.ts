import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/server/auth";

// POST /api/push/subscribe  { endpoint, keys: { p256dh, auth } } — saves this device for reminders.
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const body = (await request.json().catch(() => ({}))) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!body.endpoint?.startsWith("https://") || !body.keys?.p256dh || !body.keys?.auth) return fail("Invalid subscription");
  const { error } = await supabase
    .from("push_subscriptions")
    .upsert({ user_id: user.id, endpoint: body.endpoint, keys: { p256dh: body.keys.p256dh, auth: body.keys.auth } }, { onConflict: "endpoint" });
  if (error) return fail("Could not save", 500);
  return NextResponse.json({ ok: true });
}
