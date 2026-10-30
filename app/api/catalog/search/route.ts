import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";

// GET /api/catalog/search?q=dolo — medicine names as the person types (max 20).
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ results: [] });
  const { data, error } = await auth.supabase.rpc("catalog_search", { p_query: q });
  if (error) return NextResponse.json({ error: "Search is not available right now" }, { status: 500 });
  return NextResponse.json({ results: data ?? [] });
}
