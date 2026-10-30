import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

// POST /api/ack/:token — a contact taps "I'm going" on the public ack page (no login).
// The long random token IS the permission, and it can only set acked_at on its own row.
export async function POST(_request: Request, ctx: RouteContext<"/api/ack/[token]">) {
  const { token } = await ctx.params;
  if (!/^[a-f0-9]{32}$/.test(token)) return NextResponse.json({ error: "This link is not valid" }, { status: 404 });

  const admin = supabaseAdmin();
  const { data: ack } = await admin.from("sos_acks").select("id, acked_at, sos_events!inner(state)").eq("token", token).maybeSingle();
  if (!ack) return NextResponse.json({ error: "This link is not valid" }, { status: 404 });
  if (ack.acked_at) return NextResponse.json({ ackedAt: ack.acked_at });

  const state = (ack.sos_events as unknown as { state: string }).state;
  if (state !== "active") return NextResponse.json({ error: "This alert has already ended" }, { status: 409 });

  const now = new Date().toISOString();
  // "acked_at is null" makes a double tap harmless.
  await admin.from("sos_acks").update({ acked_at: now }).eq("id", ack.id).is("acked_at", null);
  return NextResponse.json({ ackedAt: now });
}
