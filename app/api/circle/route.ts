import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

type Link = { id: string; patient_id: string; member_id: string; role: "caregiver" | "viewer"; consent: "pending" | "given" | "revoked"; created_at: string };

// GET /api/circle — my circle as a patient (who may see my medicines) + the people I care for.
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  // RLS: I only see links where I am the patient or the member.
  const { data } = await supabase
    .from("care_circle_members")
    .select("id, patient_id, member_id, role, consent, created_at")
    .or(`patient_id.eq.${user.id},member_id.eq.${user.id}`)
    .order("created_at");
  const links = (data ?? []) as Link[];

  // Names of the other people. Profiles RLS hides people until consent is given,
  // but you should still see who you invited / who invited you. Only name + language.
  const ids = [...new Set(links.map((l) => (l.patient_id === user.id ? l.member_id : l.patient_id)))];
  const { data: people } = ids.length ? await supabaseAdmin().from("profiles").select("id, name, lang").in("id", ids) : { data: [] };
  const byId = new Map((people ?? []).map((p) => [p.id as string, p as { id: string; name: string; lang: string }]));
  const person = (id: string) => ({ id, name: byId.get(id)?.name || "PharmiAI user", lang: byId.get(id)?.lang ?? "en" });

  return NextResponse.json({
    me: user.id,
    members: links.filter((l) => l.patient_id === user.id).map((l) => ({ id: l.id, role: l.role, consent: l.consent, person: person(l.member_id) })),
    caringFor: links.filter((l) => l.member_id === user.id).map((l) => ({ id: l.id, role: l.role, consent: l.consent, person: person(l.patient_id) })),
  });
}

// POST /api/circle { email, role } — invite someone into MY circle (consent starts as pending).
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase } = auth;
  const body = (await request.json().catch(() => ({}))) as { email?: string; role?: string };
  const email = (body.email ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Please enter a valid email");
  if (body.role !== "caregiver" && body.role !== "viewer") return fail("Choose caregiver or viewer");

  const { data, error } = await supabase.rpc("invite_member", { p_email: email, p_role: body.role });
  if (error) {
    // The RPC raises plain sentences for the two cases a person can fix.
    const known = ["No PharmiAI account with that email yet", "You cannot invite yourself"].find((m) => error.message.includes(m));
    return fail(known ?? "Could not send the invite. Please try again.");
  }
  return NextResponse.json({ id: data as string });
}
