import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/server/auth";

// POST /api/doses/:id/act  { action: "taken" | "skipped" | "snoozed", opId: uuid }
// opId is made on the phone at the moment of the tap, so a retry (or offline replay) never counts twice.
export async function POST(request: Request, ctx: RouteContext<"/api/doses/[id]/act">) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { action?: string; opId?: string };
  if (!["taken", "skipped", "snoozed"].includes(body.action ?? "")) return fail("Unknown action");
  if (!body.opId || !/^[0-9a-f-]{36}$/i.test(body.opId)) return fail("Missing opId");

  const { data, error } = await supabase.rpc("act_on_dose", { p_event: id, p_action: body.action, p_op: body.opId });
  if (error) return fail("Not allowed", 403);
  return NextResponse.json({ state: (data as { state: string }).state });
}
