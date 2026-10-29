// Turns a VERIFIED dose code into clock times for reminders. Table-driven, never AI.
// The times are defaults the family can see on the Today screen; the dose itself comes
// from the prescription (via the shorthand table), never from us.

import { expandShorthand, type Slot } from "./shorthand";

export const SLOT_TIME: Record<Slot, string> = { morning: "08:00", afternoon: "13:00", night: "20:00" };

// Codes that say how often but not when (e.g. "BD"): spread evenly over waking hours.
const EVEN_TIMES: Record<number, string[]> = {
  1: ["08:00"],
  2: ["08:00", "20:00"],
  3: ["08:00", "13:00", "20:00"],
  4: ["08:00", "12:00", "16:00", "20:00"],
};

/** Reminder times for a dose code, or null when no fixed reminder makes sense ("when needed", unknown). */
export function reminderTimes(doseCode: string): string[] | null {
  const s = expandShorthand(doseCode);
  if (!s || s.asNeeded || !s.timesPerDay) return null;
  if (s.slots) return s.slots.map((slot) => SLOT_TIME[slot]);
  return EVEN_TIMES[s.timesPerDay] ?? null;
}

export function slotOf(time: string): Slot {
  const h = Number(time.slice(0, 2));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "night";
}
