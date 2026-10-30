// Zero-Guess: the ONE place that decides a medicine's status. The AI never sets status.
//
// Verified only when ALL are true:
//   1. Both independent readings exactly match the SAME catalog entry.
//   2. The strength read matches that entry's strength.
//   3. Dose code is in the shorthand table, and duration is a whole number of days.
//   4. A person confirmed this exact entry and these exact dosing values.
// Anything else is "needs_check"; no catalog match at all is "not_recognized".

import { type CatalogEntry, matchName, normalizeStrength } from "./match";
import { expandShorthand, normalizeCode } from "./shorthand";

export type Status = "verified" | "needs_check" | "not_recognized";

/** What one reading (AI transcription or OCR) saw. null = not readable. Never filled in. */
export type Reading = {
  name: string | null;
  strength: string | null;
  doseCode: string | null;
  durationDays: number | null;
};

/** What a person confirmed on the review screen. Values they typed count as human-read. */
export type Confirmation = {
  catalogId: string;
  doseCode: string;
  durationDays: number;
};

export type StatusResult = {
  status: Status;
  catalogId: string | null;
  candidates: CatalogEntry[];
  reasons: string[]; // plain-language, shown to the person
};

const validDuration = (d: number | null | undefined): d is number => typeof d === "number" && Number.isInteger(d) && d > 0 && d <= 365;

/** Two readings of a field must not contradict each other (a missing one is not a contradiction). */
function conflict<T>(a: T | null, b: T | null, same: (x: T, y: T) => boolean) {
  return a !== null && b !== null && !same(a, b);
}

export function computeStatus(input: { a: Reading | null; b: Reading | null; catalog: CatalogEntry[]; confirmation?: Confirmation | null }): StatusResult {
  const { a, b, catalog, confirmation } = input;
  const ma = matchName(a?.name, catalog, a?.strength);
  const mb = matchName(b?.name, catalog, b?.strength);
  const candidates = [...new Map([...ma.candidates, ...mb.candidates].map((c) => [c.id, c])).values()];

  if (!ma.exact && !mb.exact && candidates.length === 0) {
    return { status: "not_recognized", catalogId: null, candidates: [], reasons: ["We could not identify this medicine. Please check the name with your pharmacist."] };
  }

  const reasons: string[] = [];
  const agreed = ma.exact && mb.exact && ma.exact.id === mb.exact.id ? ma.exact : null;

  if (!ma.exact || !mb.exact) reasons.push("The name could not be read clearly by both readings.");
  else if (!agreed) reasons.push("The two readings found different medicines.");

  // Strength: both readings must agree with each other and with the catalog entry.
  const sa = normalizeStrength(a?.strength);
  const sb = normalizeStrength(b?.strength);
  if (agreed) {
    const catalogStrength = normalizeStrength(agreed.strength);
    if (!sa && !sb) reasons.push("The strength is not readable.");
    else if (conflict(sa, sb, (x, y) => x === y)) reasons.push("The two readings disagree on the strength.");
    else if ((sa ?? sb) !== catalogStrength) reasons.push("This strength does not exist for this medicine in our list.");
  }

  // Dosing fields: readings must not contradict each other.
  const codeA = a?.doseCode ? normalizeCode(a.doseCode) : null;
  const codeB = b?.doseCode ? normalizeCode(b.doseCode) : null;
  if (conflict(codeA, codeB, (x, y) => x === y)) reasons.push("The two readings disagree on how often to take it.");
  if (conflict(a?.durationDays ?? null, b?.durationDays ?? null, (x, y) => x === y)) reasons.push("The two readings disagree on the number of days.");
  const readCode = codeA ?? codeB;
  const readDuration = a?.durationDays ?? b?.durationDays ?? null;
  if (readCode && !expandShorthand(readCode)) reasons.push(`"${readCode}" is not a dose instruction we know.`);

  // Human confirmation is always required, and must match what was read.
  if (!confirmation) {
    // Look-alikes are shown to the person; only their explicit choice (below) can clear this.
    if (candidates.length > 1) reasons.push("Some medicines in our list look alike. Please choose the one on the prescription.");
    reasons.push(readCode && validDuration(readDuration) ? "Please check and confirm." : "Some dosing details are missing. Please type them from the prescription.");
  } else {
    if (!agreed || confirmation.catalogId !== agreed.id) reasons.push("The confirmed medicine does not match what was read.");
    if (!expandShorthand(confirmation.doseCode)) reasons.push("The dose instruction is not one we know.");
    if (!validDuration(confirmation.durationDays)) reasons.push("The number of days is missing or not valid.");
    // A person may fill in an unreadable field, but may not overrule what both readings saw.
    if (readCode && normalizeCode(confirmation.doseCode) !== readCode) reasons.push("Your dose differs from the prescription reading.");
    if (validDuration(readDuration) && confirmation.durationDays !== readDuration) reasons.push("Your number of days differs from the prescription reading.");
  }

  if (reasons.length === 0 && agreed && confirmation) {
    return { status: "verified", catalogId: agreed.id, candidates, reasons: [] };
  }
  return { status: "needs_check", catalogId: agreed?.id ?? null, candidates, reasons };
}
