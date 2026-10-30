// Jan Aushadhi generic for a brand: plain arithmetic on DB rows, never AI.
// A generic counts ONLY if it has exactly the same ingredient set AND the same strength.

import { normalizeName, normalizeStrength } from "@/lib/safety/match";

export type Brand = { name: string; ingredients: string[]; strength: string; mrp: number | null; pack_size: number | null };
export type Generic = { ja_code: string; name: string; ingredients: string[]; strength: string; mrp: number; pack_size: number };

export type Saving = {
  generic: { code: string; name: string; perTablet: number; mrp: number; packSize: number };
  brandPerTablet: number;
  yearly: number; // rupees saved a year at the prescribed doses
};

const ingredientKey = (list: string[]) => list.map(normalizeName).sort().join("+");

/** Cheapest exact generic and the yearly saving, or null if prices are missing or there's no exact match. */
export function findSaving(brand: Brand, generics: Generic[], dosesPerDay: number): Saving | null {
  if (!brand.mrp || !brand.pack_size || dosesPerDay <= 0) return null;
  const brandPerTablet = Number(brand.mrp) / brand.pack_size;
  const key = ingredientKey(brand.ingredients);
  const strength = normalizeStrength(brand.strength);

  const exact = generics
    .filter((g) => g.pack_size > 0 && ingredientKey(g.ingredients) === key && normalizeStrength(g.strength) === strength)
    .map((g) => ({ g, perTablet: Number(g.mrp) / g.pack_size }))
    .sort((a, b) => a.perTablet - b.perTablet)[0];
  if (!exact) return null;

  const yearly = Math.round((brandPerTablet - exact.perTablet) * dosesPerDay * 365);
  return {
    generic: { code: exact.g.ja_code, name: exact.g.name, perTablet: exact.perTablet, mrp: Number(exact.g.mrp), packSize: exact.g.pack_size },
    brandPerTablet,
    yearly,
  };
}
