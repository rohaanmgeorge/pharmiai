// Zero-Guess for a medicine strip or box: the ONE place that decides a strip's status.
// Pure code, no AI. Same rules as computeStatus (lib/safety/status.ts), plus the expiry month.
//
// Verified only when ALL are true:
//   1. Both readings exactly match the SAME catalog entry, with a matching strength.
//   2. Both readings agree on one valid expiry month — OR, when they don't, a person typed it.
//   3. A person confirmed that same catalog entry and that same expiry month.
// A person may fill in an unclear expiry, but may never overrule one both readings agreed on.
// Batch is optional and never blocks.

import { type CatalogEntry, matchName, normalizeStrength } from "./match";
import type { Status } from "./status";

/** What one reading saw printed on the strip. null = not readable. Never filled in. */
export type StripReading = {
  brand: string | null;
  strength: string | null;
  expiry: string | null; // as printed, e.g. "EXP 03/2027"
  batch: string | null;
};

/** What a person confirmed on the strip review screen. */
export type StripConfirmation = {
  catalogId: string;
  expiry: string; // "YYYY-MM"
};

export type StripStatusResult = {
  status: Status;
  catalogId: string | null; // only when both readings agreed on one entry
  candidates: CatalogEntry[];
  expiryRead: string | null; // "YYYY-MM" only when both readings agreed
  batchRead: string | null; // only when both readings agreed (or only one could read it)
  reasons: string[]; // plain language, shown to the person
};

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, JUNE: 6, JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

// Words printed before the date, e.g. "EXP.", "Expiry date:", "Use before".
const PREFIX = /^(EXP(IRY)?|EXPIRES|EXPIRY DATE|EXP DATE|E|USE BEFORE|USE BY|BEST BEFORE)\b\.?\s*(DATE)?\s*[:.\-]?\s*/;

/**
 * "03/2027", "03/27", "MAR 2027", "MAR-27", "EXP 03/2027", "2027-03" → "2027-03".
 * Anything else (including day-month-year dates, which are ambiguous) → null.
 * Month must be 1–12 and the year within today−5 … today+10.
 */
export function parseExpiry(text: string | null | undefined, today = new Date()): string | null {
  if (!text) return null;
  const s = text.toUpperCase().trim().replace(PREFIX, "").replace(/\s+/g, " ").trim();

  let month: number | null = null;
  let year: number | null = null;
  let m: RegExpMatchArray | null;

  if ((m = s.match(/^(\d{1,2})\s*[/.\-]\s*(\d{4}|\d{2})$/))) {
    // MM/YYYY or MM/YY
    month = Number(m[1]);
    year = Number(m[2]);
  } else if ((m = s.match(/^(\d{4})\s*[/.\-]\s*(\d{1,2})$/))) {
    // YYYY-MM (our own stored format)
    year = Number(m[1]);
    month = Number(m[2]);
  } else if ((m = s.match(/^([A-Z]{3,9})\.?\s*[/.\-'’ ]?\s*(\d{4}|\d{2})$/))) {
    // MON YYYY, MON-YY, MARCH 2027
    month = MONTHS[m[1]] ?? null;
    year = Number(m[2]);
  }
  if (month === null || year === null) return null;
  if (year < 100) year += 2000; // strips print "27" for 2027
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;

  const thisYear = today.getFullYear();
  if (year < thisYear - 5 || year > thisYear + 10) return null;
  return `${year}-${String(month).padStart(2, "0")}`;
}

/** "2027-03" (or "2027-03-01") → "Mar 2027" for display. */
export function formatExpiry(value: string | null | undefined): string | null {
  if (!value) return null;
  const [y, mo] = value.split("-").map(Number);
  if (!y || !mo) return null;
  const name = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][mo - 1];
  return name ? `${name} ${y}` : null;
}

export type ExpiryBadge = "ok" | "soon" | "expired" | "needs_check";

/**
 * Badge for a CONFIRMED expiry month ("YYYY-MM" or "YYYY-MM-01"); null → "needs_check".
 * Medicines are good until the END of the printed month, so we count days to its last day.
 * today = "YYYY-MM-DD" (India date, from the server).
 */
export function expiryBadge(expiryMonth: string | null | undefined, today: string): { badge: ExpiryBadge; daysLeft: number | null } {
  if (!expiryMonth) return { badge: "needs_check", daysLeft: null };
  const [y, mo] = expiryMonth.split("-").map(Number);
  const lastDay = Date.UTC(y, mo, 0); // day 0 of next month = last day of this month
  const daysLeft = Math.round((lastDay - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (daysLeft < 0) return { badge: "expired", daysLeft };
  if (daysLeft <= 30) return { badge: "soon", daysLeft };
  return { badge: "ok", daysLeft };
}

const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim().toUpperCase().replace(/\s+/g, "") : null);

export function computeStripStatus(input: {
  a: StripReading | null;
  b: StripReading | null;
  catalog: CatalogEntry[];
  confirmation?: StripConfirmation | null;
  today?: Date;
}): StripStatusResult {
  const { a, b, catalog, confirmation, today = new Date() } = input;

  // Expiry: each reading parsed on its own; only an exact agreement counts as "read".
  const ea = parseExpiry(a?.expiry, today);
  const eb = parseExpiry(b?.expiry, today);
  const expiryRead = ea && eb && ea === eb ? ea : null;

  // Batch never blocks; we only keep it when the readings don't contradict each other.
  const ba = clean(a?.batch);
  const bb = clean(b?.batch);
  const batchRead = ba && bb ? (ba === bb ? ba : null) : (ba ?? bb);

  // Medicine: same exact-match rule as prescriptions.
  const ma = matchName(a?.brand, catalog, a?.strength);
  const mb = matchName(b?.brand, catalog, b?.strength);
  const candidates = [...new Map([...ma.candidates, ...mb.candidates].map((c) => [c.id, c])).values()];

  if (!ma.exact && !mb.exact && candidates.length === 0) {
    return { status: "not_recognized", catalogId: null, candidates: [], expiryRead, batchRead, reasons: ["This medicine is not in our checked list."] };
  }

  const reasons: string[] = [];
  const agreed = ma.exact && mb.exact && ma.exact.id === mb.exact.id ? ma.exact : null;
  if (!ma.exact || !mb.exact) reasons.push("The name could not be read clearly by both readings.");
  else if (!agreed) reasons.push("The two readings found different medicines.");

  // Strength: readings must agree with each other and with the catalog entry.
  if (agreed) {
    const sa = normalizeStrength(a?.strength);
    const sb = normalizeStrength(b?.strength);
    const catalogStrength = normalizeStrength(agreed.strength);
    if (!sa && !sb) reasons.push("The strength is not readable.");
    else if (sa && sb && sa !== sb) reasons.push("The two readings disagree on the strength.");
    else if ((sa ?? sb) !== catalogStrength) reasons.push("This strength does not exist for this medicine in our list.");
  }

  if (!confirmation) {
    if (candidates.length > 1) reasons.push("Some medicines in our list look alike. Please choose the one on the strip.");
    if (!expiryRead) {
      reasons.push(ea && eb ? "The two readings disagree on the expiry date. Please type it from the strip." : "The expiry date is not clear. Please type it from the strip.");
    }
    reasons.push("Please check and confirm.");
  } else {
    if (!agreed || confirmation.catalogId !== agreed.id) reasons.push("The confirmed medicine does not match what was read.");
    const typed = parseExpiry(confirmation.expiry, today);
    if (!typed) reasons.push("The expiry month is missing or not valid.");
    // A person may fill in an unclear expiry, but may never overrule what both readings saw.
    else if (expiryRead && typed !== expiryRead) reasons.push("Your expiry date differs from what is printed on the strip.");
  }

  if (reasons.length === 0 && agreed && confirmation) {
    return { status: "verified", catalogId: agreed.id, candidates, expiryRead, batchRead, reasons: [] };
  }
  return { status: "needs_check", catalogId: agreed?.id ?? null, candidates, expiryRead, batchRead, reasons };
}
