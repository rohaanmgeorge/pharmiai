import { NextResponse } from "next/server";
import { canManage, fail, requireUser } from "@/lib/server/auth";
import { msg } from "@/lib/server/messages";
import { sendPush } from "@/lib/server/push";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { loadSos } from "@/components/emergency/sos-load";

// POST /api/sos  { patientId?, lat?, lng?, isTest }   (or ?patient=<id>)
// Starts an SOS for the patient (yourself, or an elder you manage). We create one private
// "I'm going" link per emergency contact and push the consented family circle.
// We never send SMS/WhatsApp ourselves: the screen shows one-tap buttons for the family.
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  // The SOS is FOR the patient: yourself, or an elder you manage (caregiver "Escalate to SOS").
  const patientId = (typeof body.patientId === "string" && body.patientId) || new URL(request.url).searchParams.get("patient") || user.id;
  if (!(await canManage(supabase, patientId))) return fail("Not allowed", 403);
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const hasPlace = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && body.lat != null && body.lng != null;
  const isTest = body.isTest === true;

  // Admin client after the can_manage check: the RLS insert policy only allows the patient
  // themselves, but a caregiver may press SOS for an elder. sos_acks has no user insert grant.
  const admin = supabaseAdmin();
  const { data: ev, error } = await admin
    .from("sos_events")
    .insert({ patient_id: patientId, lat: hasPlace ? lat : null, lng: hasPlace ? lng : null, is_test: isTest })
    .select("id")
    .single();
  if (error || !ev) return fail("Could not start SOS. Please call 108 or 112.", 500);

  const { data: contacts } = await admin.from("emergency_contacts").select("id").eq("patient_id", patientId);
  if (contacts?.length) {
    await admin.from("sos_acks").insert(contacts.map((c) => ({ sos_id: ev.id, contact_id: c.id })));
  }

  // Push every consented circle member (except whoever pressed the button), in their language.
  const { data: patient } = await admin.from("profiles").select("name, lang").eq("id", patientId).maybeSingle();
  const name = patient?.name || "Your family member";
  const { data: members } = await admin.from("care_circle_members").select("member_id").eq("patient_id", patientId).eq("consent", "given");
  const toNotify = [...new Set([...(members ?? []).map((m) => m.member_id as string), patientId])].filter((id) => id !== user.id);
  const { data: langs } = toNotify.length ? await admin.from("profiles").select("id, lang").in("id", toNotify) : { data: [] };
  await Promise.all(
    (langs ?? []).map((p) =>
      sendPush(admin, p.id, {
        title: (isTest ? "TEST · " : "") + msg("sosTitle", p.lang, { name }),
        body: msg("sosBody", p.lang),
        url: `/sos?id=${ev.id}&patient=${patientId}`,
        tag: `sos-${ev.id}`,
      }).catch(() => 0),
    ),
  );

  const view = await loadSos(admin, ev.id, new URL(request.url).origin);
  return NextResponse.json(view);
}
