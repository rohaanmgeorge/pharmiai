import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runTick } from "@/lib/server/tick";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 60;

// POST /api/cron/tick — called every minute by Supabase pg_cron + pg_net with header x-cron-secret.
export async function POST(request: Request) {
  const given = Buffer.from(request.headers.get("x-cron-secret") ?? "");
  const secret = Buffer.from(process.env.CRON_SECRET ?? "");
  if (!secret.length || given.length !== secret.length || !timingSafeEqual(given, secret)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const report = await runTick(supabaseAdmin());
  return NextResponse.json(report);
}
