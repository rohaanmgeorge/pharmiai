import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/server/auth";

// My own Emergency Medical Card. RLS "own emergency card" = only the patient themselves.
// GET  /api/card → { enabled, token } (no row yet → enabled false; we don't publish anything until asked)
// POST /api/card { enabled } → creates the row if missing, then sets enabled.
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const { data } = await supabase.from("emergency_cards").select("share_token, enabled").eq("patient_id", user.id).maybeSingle();
  return NextResponse.json({ enabled: data?.enabled ?? false, token: data?.share_token ?? null });
}

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.enabled !== "boolean") return fail("Please say on or off");

  const { data, error } = await supabase
    .from("emergency_cards")
    .upsert({ patient_id: user.id, enabled: body.enabled }, { onConflict: "patient_id" })
    .select("share_token, enabled")
    .single();
  if (error) return fail("Could not save. Please try again.", 500);
  return NextResponse.json({ enabled: data.enabled, token: data.share_token });
}
