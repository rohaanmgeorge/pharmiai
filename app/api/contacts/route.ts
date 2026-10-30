import { NextResponse } from "next/server";
import { canManage, canView, fail, requireUser } from "@/lib/server/auth";
import { checkContact } from "@/components/emergency/contact-input";

const FIELDS = "id, patient_id, name, phone, email, relation, priority, lang";

// GET /api/contacts?patient=<id> — emergency contacts, first to call at the top.
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const patientId = new URL(request.url).searchParams.get("patient") || user.id;
  if (!(await canView(supabase, patientId))) return fail("Not allowed", 403);

  const { data, error } = await supabase.from("emergency_contacts").select(FIELDS).eq("patient_id", patientId).order("priority").order("name");
  if (error) return fail("Could not load contacts. Please try again.", 500);
  return NextResponse.json({ contacts: data ?? [], canManage: await canManage(supabase, patientId) });
}

// POST /api/contacts?patient=<id>  { name, phone, email?, relation, priority?, lang? }
// User client, so the "manage contacts" RLS policy (can_manage) is the final guard.
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const patientId = new URL(request.url).searchParams.get("patient") || user.id;
  if (!(await canManage(supabase, patientId))) return fail("Not allowed", 403);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = checkContact(body);
  if ("error" in checked) return fail(checked.error);

  // New contacts go to the end of the list unless a priority was given.
  let priority = checked.value.priority;
  if (!priority) {
    const { data: last } = await supabase
      .from("emergency_contacts")
      .select("priority")
      .eq("patient_id", patientId)
      .order("priority", { ascending: false })
      .limit(1)
      .maybeSingle();
    priority = (last?.priority ?? 0) + 1;
  }

  const { data, error } = await supabase
    .from("emergency_contacts")
    .insert({ ...checked.value, priority, patient_id: patientId })
    .select(FIELDS)
    .single();
  if (error) return fail("Could not save the contact. Please try again.", 500);
  return NextResponse.json({ contact: data });
}
