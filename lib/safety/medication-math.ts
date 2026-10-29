// Duplicate ingredients, stock and course dates — plain arithmetic, no AI.

import { normalizeName } from "./match";

export type ActiveMedicine = { id: string; name: string; ingredients: string[] };

/** Groups of medicines that share an active ingredient (e.g. two metformin brands). */
export function findDuplicateIngredients(meds: ActiveMedicine[]): { ingredient: string; medicines: string[] }[] {
  const byIngredient = new Map<string, Set<string>>();
  for (const m of meds) {
    for (const ing of m.ingredients) {
      const key = normalizeName(ing);
      if (!byIngredient.has(key)) byIngredient.set(key, new Set());
      byIngredient.get(key)!.add(m.id);
    }
  }
  return [...byIngredient.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([ingredient, ids]) => ({ ingredient, medicines: [...ids] }));
}

/** Whole days of tablets left. 0 doses per day (e.g. "when needed") → null, we can't predict. */
export function daysOfStockLeft(stock: number, dosesPerDay: number): number | null {
  if (dosesPerDay <= 0) return null;
  return Math.floor(Math.max(0, stock) / dosesPerDay);
}

export function needsRestock(stock: number, dosesPerDay: number, thresholdDays = 5): boolean {
  const days = daysOfStockLeft(stock, dosesPerDay);
  return days !== null && days <= thresholdDays;
}

/** Last day of the course (inclusive). A 5-day course starting 1 Nov ends 5 Nov. */
export function courseEndDate(start: Date, durationDays: number): Date {
  const end = new Date(start);
  end.setDate(end.getDate() + durationDays - 1);
  return end;
}

/**
 * Run-out prediction for the refill agent — plain arithmetic, never AI.
 * stock = tablets left (already lowered by every confirmed "Taken"), dosesPerDay from the schedule.
 * Returns days left and the date the last tablet is taken, or null if we can't predict.
 */
export function predictRunout(stock: number, dosesPerDay: number, today: string): { daysLeft: number; runoutDate: string } | null {
  const daysLeft = daysOfStockLeft(stock, dosesPerDay);
  if (daysLeft === null) return null;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + daysLeft);
  return { daysLeft, runoutDate: d.toISOString().slice(0, 10) };
}
