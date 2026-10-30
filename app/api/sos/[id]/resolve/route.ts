import { endSos } from "@/components/emergency/sos-end";

// POST /api/sos/:id/resolve — "I'm safe now" / help arrived.
export async function POST(request: Request, ctx: RouteContext<"/api/sos/[id]/resolve">) {
  const { id } = await ctx.params;
  return endSos(request, id, "resolved");
}
