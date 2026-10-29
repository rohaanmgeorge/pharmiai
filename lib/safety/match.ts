// Matching a written medicine name to our curated catalog.
// Only an EXACT normalized match counts. Close spellings become candidates for a person to
// choose from — we never pick one automatically.

export type CatalogEntry = {
  id: string;
  name: string; // as printed on the strip, e.g. "Glyconil 500"
  ingredients: string[]; // e.g. ["metformin"]
  strength: string; // e.g. "500 mg"
};

export type MatchResult = {
  exact: CatalogEntry | null;
  candidates: CatalogEntry[]; // exact match (if any) plus every look-alike
};

const FORM_WORDS = /\b(tab|tabs|tablet|tb|cap|caps|capsule|syp|syrup|inj)\b\.?/g;

export function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(FORM_WORDS, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "500mg", "500 MG", "0.5 g" are compared as milligrams; unknown units compare as text. */
export function normalizeStrength(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = raw.toLowerCase().replace(/\s+/g, "").match(/^(\d+(?:\.\d+)?)(mg|g|mcg|µg|ml|iu)?$/);
  if (!m) return raw.toLowerCase().replace(/\s+/g, "");
  const value = Number(m[1]);
  const unit = m[2] ?? "mg";
  if (unit === "g") return `${value * 1000}mg`;
  if (unit === "µg") return `${value}mcg`;
  return `${value}${unit}`;
}

export function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

const LOOK_ALIKE_DISTANCE = 2;

function wordPart(name: string) {
  return name.replace(/[0-9 ]+/g, "");
}

function looksAlike(a: string, b: string) {
  // Compare full names and letters-only names, so "Losarin 50" ~ "Lasorin 40".
  return levenshtein(a, b) <= LOOK_ALIKE_DISTANCE || levenshtein(wordPart(a), wordPart(b)) <= LOOK_ALIKE_DISTANCE;
}

/**
 * Exact match on the written name — or on name + strength number, because prescriptions often
 * write "Glyconil 500 mg" which a reading splits into name "Glyconil" and strength "500 mg".
 */
export function matchName(raw: string | null | undefined, catalog: CatalogEntry[], strength?: string | null): MatchResult {
  if (!raw || !raw.trim()) return { exact: null, candidates: [] };
  const n = normalizeName(raw);
  if (!n) return { exact: null, candidates: [] };
  const strengthNumber = strength?.match(/\d+(?:\.\d+)?/)?.[0];
  const keys = new Set([n, ...(strengthNumber && !n.endsWith(strengthNumber) ? [`${n} ${strengthNumber}`] : [])]);
  const exactMatches = catalog.filter((c) => keys.has(normalizeName(c.name)));
  const candidates = catalog.filter((c) => [...keys].some((k) => looksAlike(k, normalizeName(c.name))));
  // Two catalog rows with the same normalized name would be a data error: treat as not exact.
  return { exact: exactMatches.length === 1 ? exactMatches[0] : null, candidates };
}
