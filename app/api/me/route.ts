import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";

// GET /api/me — my profile + everyone I can look after (people whose circle I'm in, with consent).
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const { data: me } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const { data: links } = await supabase
    .from("care_circle_members")
    .select("patient_id, role, consent, profiles!care_circle_members_patient_id_fkey(id, name)")
    .eq("member_id", user.id)
    .eq("consent", "given");
  const caredFor = (links ?? []).map((l) => {
    const p = l.profiles as unknown as { id: string; name: string };
    return { id: p.id, name: p.name, role: l.role };
  });
  return NextResponse.json({ me, caredFor });
}
