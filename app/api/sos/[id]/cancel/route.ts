import { endSos } from "@/components/emergency/sos-end";

// POST /api/sos/:id/cancel — "It was a mistake."
export async function POST(request: Request, ctx: RouteContext<"/api/sos/[id]/cancel">) {
  const { id } = await ctx.params;
  return endSos(request, id, "cancelled");
}
