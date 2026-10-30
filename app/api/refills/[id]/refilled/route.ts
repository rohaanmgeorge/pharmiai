import { NextResponse } from "next/server";
import { recordRefill } from "@/lib/agent/refill-tools";
import { fail, requireUser } from "@/lib/server/auth";

// POST /api/refills/:id/refilled  { quantity } — the real number bought, added to stock.
export async function POST(request: Request, ctx: RouteContext<"/api/refills/[id]/refilled">) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { quantity?: unknown };
  const r = await recordRefill(auth, id, Number(body.quantity));
  if (!r.ok) return fail(r.error, r.status);
  return NextResponse.json({ state: "refilled", stock: r.stock });
}
