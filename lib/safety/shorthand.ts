// Prescription shorthand is expanded ONLY from this fixed table — never by the AI.
// Unknown codes return null, which keeps the medicine at "Needs check".

export type Slot = "morning" | "afternoon" | "night";

export type Shorthand = {
  code: string;
  timesPerDay: number | null; // null = only when needed
  slots: Slot[] | null; // null = the prescription does not say which times
  asNeeded: boolean;
  meaning: string;
};

const SLOT_ORDER: Slot[] = ["morning", "afternoon", "night"];

function pattern(code: string): Shorthand {
  const parts = code.split("-").map(Number);
  const slots = SLOT_ORDER.filter((_, i) => parts[i] > 0);
  const total = parts.reduce((a, b) => a + b, 0);
  return {
    code,
    timesPerDay: total,
    slots,
    asNeeded: false,
    meaning: slots.length ? `${slots.join(" and ")}` : "none",
  };
}

// Morning-afternoon-night patterns with 0 or 1 tablet per slot (all 7 non-empty combinations).
const PATTERNS = ["1-0-0", "0-1-0", "0-0-1", "1-1-0", "1-0-1", "0-1-1", "1-1-1"].map(pattern);

const ABBREVIATIONS: Shorthand[] = [
  { code: "OD", timesPerDay: 1, slots: null, asNeeded: false, meaning: "once a day" },
  { code: "BD", timesPerDay: 2, slots: null, asNeeded: false, meaning: "twice a day" },
  { code: "TDS", timesPerDay: 3, slots: ["morning", "afternoon", "night"], asNeeded: false, meaning: "three times a day" },
  { code: "QID", timesPerDay: 4, slots: null, asNeeded: false, meaning: "four times a day" },
  { code: "HS", timesPerDay: 1, slots: ["night"], asNeeded: false, meaning: "at bedtime" },
  // On a prescription "SOS" means "when needed" — unrelated to the emergency SOS button.
  { code: "SOS", timesPerDay: null, slots: null, asNeeded: true, meaning: "when needed" },
];

const TABLE = new Map<string, Shorthand>([...PATTERNS, ...ABBREVIATIONS].map((s) => [s.code, s]));

// Same-meaning spellings that appear on real prescriptions.
const ALIASES: Record<string, string> = { BID: "BD", TID: "TDS", QDS: "QID", PRN: "SOS" };

/** Tidy how a code is written ("o.d.", "1 - 0 - 1", "1–0–1") without changing its meaning. */
export function normalizeCode(raw: string): string {
  const s = raw
    .trim()
    .toUpperCase()
    .replace(/[–—_/]/g, "-")
    .replace(/\s*-\s*/g, "-")
    .replace(/\./g, "")
    .replace(/\s+/g, "");
  return ALIASES[s] ?? s;
}

export function expandShorthand(raw: string | null | undefined): Shorthand | null {
  if (!raw) return null;
  return TABLE.get(normalizeCode(raw)) ?? null;
}

export const SHORTHAND_TABLE: readonly Shorthand[] = [...TABLE.values()];
