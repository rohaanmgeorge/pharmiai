// Prescription evaluation. Runs the real pipeline on every image in data/private/prescriptions/
// that has a matching <name>.truth.json, and checks the key safety metric:
//   wrong-but-Verified MUST be 0.
// Worst case is simulated: the "person" confirms exactly what the app shows them.
// Usage: npm run eval
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { readingA, readingB } from "@/lib/ai/read-prescription";
import { alignReadings } from "@/lib/safety/align";
import type { CatalogEntry } from "@/lib/safety/match";
import { normalizeCode } from "@/lib/safety/shorthand";
import { computeStatus } from "@/lib/safety/status";

type Truth = { items: { catalogId: string | null; doseCode: string | null; durationDays: number | null }[] };

const DIR = "data/private/prescriptions";
const MIME: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

/** Only the catalog rows that could match what was read (the API returns max 1,000 rows). */
async function candidatesFor(items: { name: string | null; strength: string | null }[]) {
  const keys = new Set<string>();
  for (const i of items) {
    if (!i.name) continue;
    keys.add(i.name);
    const n = i.strength?.match(/\d+(?:\.\d+)?/)?.[0];
    if (n) keys.add(`${i.name} ${n}`);
  }
  if (keys.size === 0) return [] as CatalogEntry[];
  const { data, error } = await db.rpc("catalog_candidates", { p_keys: [...keys] });
  if (error) throw error;
  return (data ?? []) as CatalogEntry[];
}

const totals = { items: 0, verified: 0, needs_check: 0, not_recognized: 0, verifiedCorrect: 0, wrongButVerified: 0, truthItems: 0 };

for (const file of readdirSync(DIR).filter((f) => MIME[extname(f).toLowerCase()])) {
  const truthPath = join(DIR, file.replace(/\.[^.]+$/, ".truth.json"));
  let truth: Truth;
  try {
    truth = JSON.parse(readFileSync(truthPath, "utf8"));
  } catch {
    console.log(`skip ${file} (no truth file)`);
    continue;
  }
  const image = { data: readFileSync(join(DIR, file)).toString("base64"), mimeType: MIME[extname(file).toLowerCase()] };
  const [a, b] = await Promise.all([readingA(image).catch(() => null), readingB(image).catch(() => null)]);
  console.log(`\n${file}  (A: ${a?.model ?? "failed"}, B: ${b?.model ?? "failed"})`);
  const catalog = await candidatesFor([...(a?.items ?? []), ...(b?.items ?? [])]);

  for (const pair of alignReadings(a?.items ?? [], b?.items ?? [])) {
    const first = computeStatus({ a: pair.a, b: pair.b, catalog: catalog as CatalogEntry[] });
    // Worst case: the person confirms exactly what is shown.
    const code = pair.a?.doseCode ?? pair.b?.doseCode;
    const days = pair.a?.durationDays ?? pair.b?.durationDays;
    const shownId = first.catalogId ?? first.candidates[0]?.id;
    const final =
      shownId && code && days
        ? computeStatus({ a: pair.a, b: pair.b, catalog: catalog as CatalogEntry[], confirmation: { catalogId: shownId, doseCode: code, durationDays: days } })
        : first;

    totals.items++;
    totals[final.status]++;
    let mark = "";
    if (final.status === "verified") {
      const correct = truth.items.some((t) => t.catalogId === final.catalogId && t.doseCode === normalizeCode(code!) && t.durationDays === days);
      if (correct) totals.verifiedCorrect++;
      else totals.wrongButVerified++;
      mark = correct ? "  ✓ correct" : "  ✗ WRONG BUT VERIFIED";
    }
    console.log(`  A="${pair.a?.name ?? "-"}" B="${pair.b?.name ?? "-"}" → ${final.status}${mark}`);
  }
  totals.truthItems += truth.items.filter((t) => t.catalogId).length;
}

console.log("\n=== Summary ===");
console.log(totals);
console.log(`Verified coverage: ${totals.verifiedCorrect}/${totals.truthItems} known medicines`);
console.log(totals.wrongButVerified === 0 ? "PASS: wrong-but-Verified = 0" : `FAIL: wrong-but-Verified = ${totals.wrongButVerified}`);
process.exit(totals.wrongButVerified === 0 ? 0 : 1);
