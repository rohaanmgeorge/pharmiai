import { NextResponse } from "next/server";
import { snoozeRefill } from "@/lib/agent/refill-tools";
import { fail, requireUser } from "@/lib/server/auth";

// POST /api/refills/:id/later — hide for one day; the scheduler re-opens it after that.
export async function POST(request: Request, ctx: RouteContext<"/api/refills/[id]/later">) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const r = await snoozeRefill(auth, id);
  if (!r.ok) return fail(r.error, r.status);
  return NextResponse.json({ state: "later", laterUntil: r.laterUntil });
}
