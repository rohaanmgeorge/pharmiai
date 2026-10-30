// Pure helpers for the family dashboard and the "Are you okay?" check.
// No database, no clock of its own: easy to test (tests/wellness.test.ts).

const IST_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The app pings at most once per 10 minutes, so opening it often doesn't hammer the DB. */
export const ACTIVITY_EVERY_MS = 10 * 60 * 1000;

export function shouldTouchActivity(lastActivityAt: string | null | undefined, now = new Date()): boolean {
  if (!lastActivityAt) return true;
  const last = Date.parse(lastActivityAt);
  return Number.isNaN(last) || now.getTime() - last >= ACTIVITY_EVERY_MS;
}

export type AdherenceDay = { date: string; day: string; taken: number; total: number };

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Last `days` days (India time, oldest first, ending today): doses taken vs doses that were due.
 * Doses still pending (not due yet) don't count, so a morning view isn't "0% today".
 */
export function weekAdherence(doses: { due_at: string; state: string }[], now = new Date(), days = 7): AdherenceDay[] {
  const out: AdherenceDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() + IST_MS - i * DAY_MS);
    out.push({ date: d.toISOString().slice(0, 10), day: WEEKDAY[d.getUTCDay()], taken: 0, total: 0 });
  }
  const byDate = new Map(out.map((d) => [d.date, d]));
  for (const dose of doses) {
    if (dose.state === "pending" || dose.state === "snoozed") continue;
    const date = new Date(Date.parse(dose.due_at) + IST_MS).toISOString().slice(0, 10);
    const day = byDate.get(date);
    if (!day) continue;
    day.total++;
    if (dose.state === "taken") day.taken++;
  }
  return out;
}

/** Phone number → digits for wa.me links. Indian 10-digit numbers get the 91 country code. */
export function phoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
}

/** Fixed message for emergency contacts. A template, never AI text. */
export function checkMessage(name: string): string {
  return `Hello, this is a message from PharmiAI. ${name} has missed medicines and hasn't answered "Are you okay?". This is a check, not an emergency. Could you please call or visit ${name}?`;
}

export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/${phoneDigits(phone)}?text=${encodeURIComponent(text)}`;
}

export function smsLink(phone: string, text: string): string {
  return `sms:${phone.replace(/[^\d+]/g, "")}?body=${encodeURIComponent(text)}`;
}

export function telLink(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

// ---------------------------------------------------------------------------
// Care settings validation — same ranges as the CHECKs in migration 0003.
// ---------------------------------------------------------------------------
export type CareSettings = {
  refill_days: number;
  expiry_alert_days: number[];
  check_missed: number;
  check_idle_hours: number;
  check_wait_min: number;
  quiet_start: string;
  quiet_end: string;
  presence: "home" | "away" | "hospital";
  check_consent: boolean;
};

const RANGES = {
  refill_days: [1, 30],
  check_missed: [1, 10],
  check_idle_hours: [1, 24],
  check_wait_min: [1, 120],
} as const;

const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v);

/** "30, 7, 0" → [30, 7, 0]. Returns null if anything isn't a whole number from 0 to 365. */
export function parseAlertDays(input: string | number[]): number[] | null {
  const parts = Array.isArray(input) ? input : input.split(",").map((s) => s.trim()).filter(Boolean);
  const nums = parts.map((p) => Number(p));
  if (nums.length === 0 || nums.length > 6) return null;
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 365)) return null;
  return [...new Set(nums)].sort((a, b) => b - a);
}

/**
 * Keeps only known fields and checks each one. Returns the clean patch or an error sentence.
 * Unknown fields (name, allergies…) are dropped, so this route can never touch identity data.
 */
export function validateCareSettings(body: Record<string, unknown>): { patch: Partial<CareSettings> } | { error: string } {
  const patch: Partial<CareSettings> = {};
  for (const [key, [lo, hi]] of Object.entries(RANGES) as [keyof typeof RANGES, readonly [number, number]][]) {
    if (body[key] === undefined) continue;
    const n = Number(body[key]);
    if (!Number.isInteger(n) || n < lo || n > hi) return { error: `${key.replace(/_/g, " ")} must be a whole number from ${lo} to ${hi}` };
    patch[key] = n;
  }
  if (body.expiry_alert_days !== undefined) {
    const days = parseAlertDays(body.expiry_alert_days as string | number[]);
    if (!days) return { error: "Expiry alerts must be a list of days like 30, 7, 0" };
    patch.expiry_alert_days = days;
  }
  for (const key of ["quiet_start", "quiet_end"] as const) {
    if (body[key] === undefined) continue;
    if (!isTime(body[key])) return { error: "Quiet hours must look like 22:00" };
    patch[key] = (body[key] as string).slice(0, 5);
  }
  if (body.presence !== undefined) {
    if (!["home", "away", "hospital"].includes(body.presence as string)) return { error: "Presence must be Home, Away or Hospital" };
    patch.presence = body.presence as CareSettings["presence"];
  }
  if (body.check_consent !== undefined) {
    if (typeof body.check_consent !== "boolean") return { error: "check_consent must be true or false" };
    patch.check_consent = body.check_consent;
  }
  if (Object.keys(patch).length === 0) return { error: "Nothing to change" };
  return { patch };
}
