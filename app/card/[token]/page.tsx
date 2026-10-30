import type { Metadata } from "next";
import { expandShorthand } from "@/lib/safety/shorthand";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { type CardData, EmergencyCardClient } from "./client";

// Public, read-only Emergency Medical Card. Anyone with the link can open it (no login),
// so we read with the admin client by the long random share token and show ONLY card fields.
export const metadata: Metadata = { title: "Emergency Medical Card — PharmiAI", robots: { index: false, follow: false } };

type MedRow = {
  prescription_items: { status: string; dose_code: string | null; strength: string | null; medicine_catalog: { name: string; strength: string; ingredients: string[] } };
};

async function loadCard(token: string): Promise<CardData | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const admin = supabaseAdmin();
  const { data: card } = await admin.from("emergency_cards").select("patient_id").eq("share_token", token).eq("enabled", true).maybeSingle();
  if (!card) return null;
  const id = card.patient_id;

  const [{ data: p }, { data: meds }, { data: contacts }] = await Promise.all([
    admin.from("profiles").select("name, lang, blood_group, allergies, conditions").eq("id", id).maybeSingle(),
    admin
      .from("schedules")
      .select("prescription_items!inner(status, dose_code, strength, medicine_catalog!inner(name, strength, ingredients))")
      .eq("patient_id", id)
      .eq("active", true)
      .eq("prescription_items.status", "verified"),
    admin.from("emergency_contacts").select("id, name, relation, phone").eq("patient_id", id).order("priority"),
  ]);
  if (!p) return null;

  return {
    name: p.name,
    lang: p.lang,
    bloodGroup: p.blood_group,
    allergies: p.allergies ?? [],
    conditions: p.conditions ?? [],
    // Zero-Guess: only VERIFIED medicines, names and strengths from the catalog, meaning from the fixed shorthand table.
    medicines: ((meds ?? []) as unknown as MedRow[])
      .filter((m) => m.prescription_items.status === "verified")
      .map((m) => {
        const item = m.prescription_items;
        return {
          name: item.medicine_catalog.name,
          ingredients: item.medicine_catalog.ingredients.join(" + "),
          strength: item.strength ?? item.medicine_catalog.strength,
          dose: expandShorthand(item.dose_code)?.meaning ?? null,
        };
      }),
    contacts: contacts ?? [],
  };
}

export default async function Page(props: PageProps<"/card/[token]">) {
  const { token } = await props.params;
  const data = await loadCard(token);
  return <EmergencyCardClient data={data} />;
}
