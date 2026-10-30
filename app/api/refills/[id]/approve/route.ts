import { NextResponse } from "next/server";
import { approveRefill } from "@/lib/agent/refill-tools";
import { fail, requireUser } from "@/lib/server/auth";

const CHANNELS = ["whatsapp", "sms", "email"] as const;

// POST /api/refills/:id/approve  { text, channel: "whatsapp" | "sms" | "email" }
// Records who approved and returns a link the person opens in their own app.
// We never send the message ourselves.
export async function POST(request: Request, ctx: RouteContext<"/api/refills/[id]/approve">) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { text?: unknown; channel?: unknown };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const channel = CHANNELS.find((c) => c === body.channel);
  if (!text || text.length > 1000) return fail("Please write a message (up to 1000 characters)");
  if (!channel) return fail("Choose WhatsApp, SMS or Email");

  const r = await approveRefill(auth, id, text, channel);
  if (!r.ok) return fail(r.error, r.status);
  return NextResponse.json({ url: r.url, approvedAt: r.approvedAt });
}
