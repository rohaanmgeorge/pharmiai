import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type AiProblem, describeAiError } from "@/lib/ai/errors";
import { identifyMedicines, type Identified } from "@/lib/ai/identify-medicine";
import { type CatalogEntry, matchName, normalizeName } from "@/lib/safety/match";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Catalog lookups that stay fast with a very big catalog (and the API's 1,000-row limit).
// We fetch only the rows that could match what was read — the exact name plus every
// look-alike within 2 letters — then lib/safety decides, exactly as before.

type Named = { name: string | null; strength?: string | null } | null | undefined;

/** Written names to look up: the name, and the name + strength number ("Glyconil" + "500"). */
export function lookupKeys(readings: Named[]): string[] {
  const keys = new Set<string>();
  for (const r of readings) {
    if (!r?.name?.trim()) continue;
    keys.add(r.name);
    const n = r.strength?.match(/\d+(?:\.\d+)?/)?.[0];
    if (n) keys.add(`${r.name} ${n}`);
  }
  return [...keys];
}

export async function catalogCandidates(supabase: SupabaseClient, readings: Named[]): Promise<CatalogEntry[]> {
  const keys = lookupKeys(readings);
  if (keys.length === 0) return [];
  const { data, error } = await supabase.rpc("catalog_candidates", { p_keys: keys });
  if (error) throw new Error("Medicine list lookup failed");
  return (data ?? []) as CatalogEntry[];
}

/** Catalog names that may appear in this text (for the AI output guards). */
export async function catalogNamesIn(supabase: SupabaseClient, text: string): Promise<string[]> {
  if (!text.trim()) return [];
  const { data } = await supabase.rpc("catalog_names_in", { p_text: text.slice(0, 4000) });
  return (data ?? []) as string[];
}

// ---------------------------------------------------------------------------------------------
// Gemini identification (replaces the downloaded dataset). Names not found in the saved list are
// identified once by Gemini and saved, so the same medicine never needs the AI again.
// ---------------------------------------------------------------------------------------------

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);

/** The person's city, for price estimates ("location-specific rates"). */
export async function cityOf(supabase: SupabaseClient, patientId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("city").eq("id", patientId).maybeSingle();
  return (data?.city as string | null) ?? null;
}

/** Saves Gemini's identification as catalog rows (admin: users can't write the catalog). Returns the saved rows. */
export async function saveIdentified(found: Identified[], city: string | null): Promise<CatalogEntry[]> {
  const admin = supabaseAdmin();
  const saved: CatalogEntry[] = [];
  for (const m of found.filter((f) => f.isMedicine)) {
    const { data: existing } = await admin.from("medicine_catalog").select("id, name, ingredients, strength").eq("name_norm", normalizeName(m.name)).limit(1);
    if (existing?.length) {
      saved.push(existing[0] as CatalogEntry);
      continue;
    }
    const row = {
      id: `ai-${slug(m.name)}`,
      name: m.name,
      ingredients: m.ingredients,
      strength: m.strength,
      form: m.form,
      manufacturer: m.manufacturer,
      mrp: m.priceInr,
      pack_size: m.packSize,
      uses_en: m.uses.en,
      uses_ml: m.uses.ml,
      uses_hi: m.uses.hi,
      side_effects_en: m.sideEffects.en,
      side_effects_ml: m.sideEffects.ml,
      side_effects_hi: m.sideEffects.hi,
      source: "Gemini AI",
      reviewer: "Not reviewed (AI)",
      reviewed: false,
      source_kind: "ai",
      price_note: m.priceInr ? `AI estimate${city ? ` for ${city}` : ""}` : null,
    };
    const { error } = await admin.from("medicine_catalog").insert(row);
    if (!error) saved.push({ id: row.id, name: row.name, ingredients: row.ingredients, strength: row.strength });
  }
  return saved;
}

/**
 * Makes sure every name read on a prescription/strip is in the saved list, asking Gemini for the
 * ones that aren't. If the AI is unavailable, nothing is added (those lines stay "Needs check").
 */
export async function identifyMissing(supabase: SupabaseClient, readings: Named[], city: string | null): Promise<AiProblem | null> {
  if (!process.env.GEMINI_API_KEY) return describeAiError(new Error("no key"));
  const cached = await catalogCandidates(supabase, readings);
  const ask = new Set<string>();
  for (const r of readings) {
    if (!r?.name?.trim() || matchName(r.name, cached, r.strength).exact) continue;
    // Send the strength along when it was written apart from the name ("Dolo" + "650 mg").
    ask.add(r.strength && !/\d/.test(r.name) ? `${r.name} ${r.strength}` : r.name);
  }
  if (!ask.size) return null;
  try {
    await saveIdentified(await identifyMedicines([...ask], city), city);
    return null;
  } catch (e) {
    const problem = describeAiError(e);
    console.error(`identify: AI unavailable (${problem.kind})`);
    return problem;
  }
}
