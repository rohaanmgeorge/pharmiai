import { NextResponse } from "next/server";
import { canManage, fail, requireUser } from "@/lib/server/auth";
import { loadSos } from "@/components/emergency/sos-load";

// GET /api/sos/:id — status of one SOS: who said "I'm going". Used for the 10-second
// polling fallback when Realtime is not connected. User client, so RLS (can_view) applies.
export async function GET(request: Request, ctx: RouteContext<"/api/sos/[id]">) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;
  const { id } = await ctx.params;

  const view = await loadSos(supabase, id, new URL(request.url).origin);
  if (!view) return fail("SOS not found", 404);
  return NextResponse.json({ ...view, canManage: await canManage(supabase, view.patientId) });
}
