import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogEntry } from "@/lib/safety/match";

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
