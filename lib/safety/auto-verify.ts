// Automatic verification (team decision 2026-10-30): a medicine line is Verified by the scan itself,
// without a person tapping confirm. Pure code — the AI never sets status.
//
// Rules, in plain words:
//   * The medicine is the saved-list entry that a reading names exactly (reading 1 first, as it uses
//     the stronger model). If no reading matches exactly, the closest look-alike is used.
//   * Dose timing and days come from the readings (reading 1 first). Only codes in the fixed
//     shorthand table count. Nothing is invented: a missing value stays empty.
//   * Everything the app noticed is kept as a note shown on screen, e.g. "the readings differed".
//   * A line that matches nothing in the list cannot become a medicine ("unreadable line").

import { type CatalogEntry, levenshtein, matchName, normalizeName, normalizeStrength } from "./match";
import { expandShorthand, normalizeCode } from "./shorthand";
import type { Reading } from "./status";

export type AutoResult = {
  status: "verified" | "not_recognized";
  catalogId: string | null;
  strength: string | null;
  doseCode: string | null;
  durationDays: number | null;
  notes: string[];
  candidates: CatalogEntry[];
};

const validDays = (d: number | null | undefined): d is number => typeof d === "number" && Number.isInteger(d) && d > 0 && d <= 365;
const code = (r: Reading | null) => (r?.doseCode && expandShorthand(r.doseCode) ? normalizeCode(r.doseCode) : null);

export function autoVerify(input: { a: Reading | null; b: Reading | null; catalog: CatalogEntry[] }): AutoResult {
  const { a, b, catalog } = input;
  const ma = matchName(a?.name, catalog, a?.strength);
  const mb = matchName(b?.name, catalog, b?.strength);
  const candidates = [...new Map([...ma.candidates, ...mb.candidates].map((c) => [c.id, c])).values()];
  const notes: string[] = [];

  let pick = ma.exact ?? mb.exact;
  if (!pick && candidates.length) {
    // No exact name: take the closest spelling to what was read, and say so.
    const read = normalizeName(a?.name ?? b?.name ?? "");
    pick = [...candidates].sort((x, y) => levenshtein(normalizeName(x.name), read) - levenshtein(normalizeName(y.name), read))[0];
    notes.push(`Read as "${a?.name ?? b?.name}", matched to the closest name.`);
  }
  if (!pick) {
    return { status: "not_recognized", catalogId: null, strength: null, doseCode: null, durationDays: null, notes: ["This line could not be read as a medicine."], candidates };
  }

  if (ma.exact && mb.exact && ma.exact.id !== mb.exact.id) notes.push(`The second reading saw "${b?.name}".`);
  if (!a?.name || !b?.name) notes.push("Only one reading could read this line.");
  const others = candidates.filter((c) => c.id !== pick!.id);
  if (others.length) notes.push(`Similar names: ${others.slice(0, 3).map((c) => c.name).join(", ")}.`);

  const readStrength = normalizeStrength(a?.strength ?? b?.strength);
  if (readStrength && readStrength !== normalizeStrength(pick.strength)) notes.push(`Strength written as ${a?.strength ?? b?.strength}.`);

  const codeA = code(a);
  const codeB = code(b);
  const doseCode = codeA ?? codeB;
  if (codeA && codeB && codeA !== codeB) notes.push(`The readings differed on timing (other reading: ${codeB}).`);
  if (!doseCode) notes.push("No timing was written. Choose the times to get reminders.");

  const daysA = validDays(a?.durationDays) ? a!.durationDays : null;
  const daysB = validDays(b?.durationDays) ? b!.durationDays : null;
  const durationDays = daysA ?? daysB;
  if (daysA && daysB && daysA !== daysB) notes.push(`The readings differed on days (other reading: ${daysB}).`);
  if (!durationDays) notes.push("No number of days was written. Reminders run for 90 days; stop them when the course ends.");

  return { status: "verified", catalogId: pick.id, strength: pick.strength, doseCode, durationDays, notes, candidates };
}

/** Days used for reminders when the prescription gives none (shown to the person as a note). */
export const OPEN_ENDED_DAYS = 90;
