import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contactLinks, mapLink, type SosContactView } from "./sos-links";

export type SosView = {
  id: string;
  patientId: string;
  state: "active" | "cancelled" | "resolved";
  isTest: boolean;
  startedAt: string;
  mapUrl: string | null;
  contacts: SosContactView[];
};

type AckRow = {
  id: string;
  token: string;
  acked_at: string | null;
  emergency_contacts: { id: string; name: string; relation: string; phone: string; priority: number; lang: string };
};

/** One SOS with a row per contact (ack status + share links). `db` decides access (user client = RLS). */
export async function loadSos(db: SupabaseClient, sosId: string, origin: string): Promise<SosView | null> {
  const { data: ev } = await db.from("sos_events").select("id, patient_id, lat, lng, state, is_test, started_at").eq("id", sosId).maybeSingle();
  if (!ev) return null;

  const { data: who } = await db.from("profiles").select("name").eq("id", ev.patient_id).maybeSingle();
  const { data: acks } = await db
    .from("sos_acks")
    .select("id, token, acked_at, emergency_contacts!inner(id, name, relation, phone, priority, lang)")
    .eq("sos_id", sosId);

  const event = { name: who?.name || "your family member", lat: ev.lat, lng: ev.lng, isTest: ev.is_test };
  const contacts = ((acks ?? []) as unknown as AckRow[])
    .map((a) => contactLinks(origin, a, a.emergency_contacts, event))
    .sort((a, b) => a.priority - b.priority);

  return {
    id: ev.id,
    patientId: ev.patient_id,
    state: ev.state,
    isTest: ev.is_test,
    startedAt: ev.started_at,
    mapUrl: mapLink(ev.lat, ev.lng),
    contacts,
  };
}
