import { NextResponse } from "next/server";
import { draftRefill } from "@/lib/agent/refill-tools";
import type { Lang } from "@/lib/i18n";
import { fail, requireUser } from "@/lib/server/auth";

// POST /api/refills/:id/draft  { lang: "en" | "ml" | "hi" }
// The AI writes the wording only; a guard swaps in a fixed template if it adds anything unsafe.
export async function POST(request: Request, ctx: RouteContext<"/api/refills/[id]/draft">) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { lang?: unknown };
  const lang: Lang = body.lang === "ml" || body.lang === "hi" ? body.lang : "en";

  const r = await draftRefill(auth, id, lang);
  if (!r.ok) return fail(r.error, r.status);
  return NextResponse.json({ text: r.text, source: r.source, lang, quantity: r.quantity });
}
