// Pairs up the medicine lines from reading A and reading B, so each line can be compared.
// Pairing is by closest name; anything without a partner is compared against "nothing",
// which keeps it at "Needs check" (never Verified from a single reading).

import { levenshtein, normalizeName } from "./match";

type Named = { name: string | null };

const MAX_PAIR_DISTANCE = 4;

export function alignReadings<T extends Named>(a: T[], b: T[]): { a: T | null; b: T | null }[] {
  const pairs: { a: T | null; b: T | null }[] = [];
  const usedB = new Set<number>();

  for (const itemA of a) {
    let best = -1;
    let bestDist = Infinity;
    b.forEach((itemB, j) => {
      if (usedB.has(j) || !itemA.name || !itemB.name) return;
      const d = levenshtein(normalizeName(itemA.name), normalizeName(itemB.name));
      if (d < bestDist) {
        bestDist = d;
        best = j;
      }
    });
    if (best >= 0 && bestDist <= MAX_PAIR_DISTANCE) {
      usedB.add(best);
      pairs.push({ a: itemA, b: b[best] });
    } else {
      pairs.push({ a: itemA, b: null });
    }
  }
  // Lines neither reading could name (e.g. smudged) are paired in order, so one unreadable
  // line shows once instead of twice.
  const leftoverB = b.map((itemB, j) => ({ itemB, j })).filter(({ j }) => !usedB.has(j));
  const result: { a: T | null; b: T | null }[] = [];
  for (const p of pairs) {
    if (p.b === null && p.a && !p.a.name) {
      const k = leftoverB.findIndex(({ itemB }) => !itemB.name);
      if (k >= 0) {
        result.push({ a: p.a, b: leftoverB[k].itemB });
        leftoverB.splice(k, 1);
        continue;
      }
    }
    result.push(p);
  }
  leftoverB.forEach(({ itemB }) => result.push({ a: null, b: itemB }));
  return result;
}
