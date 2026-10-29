// All schedules use India time (Asia/Kolkata, UTC+05:30, no daylight saving).
// Keeping one fixed offset avoids timezone bugs for the prototype.
const OFFSET = "+05:30";
const OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's date in India as "YYYY-MM-DD". */
export function istDate(now = new Date()): string {
  return new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** Minutes since midnight in India. */
export function istMinutes(now = new Date()): number {
  const d = new Date(now.getTime() + OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** "2026-10-30" + "08:00" → the exact moment in India time. */
export function istMoment(date: string, time: string): Date {
  return new Date(`${date}T${time.slice(0, 5)}:00${OFFSET}`);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "08:30" in India time for display. */
export function istClock(at: string | Date): string {
  return new Date(new Date(at).getTime() + OFFSET_MS).toISOString().slice(11, 16);
}

/** Is "now" inside quiet hours? Handles windows that cross midnight (22:00 → 07:00). */
export function inQuietHours(start: string, end: string, now = new Date()): boolean {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const s = toMin(start);
  const e = toMin(end);
  const m = istMinutes(now);
  if (s === e) return false;
  return s < e ? m >= s && m < e : m >= s || m < e;
}
