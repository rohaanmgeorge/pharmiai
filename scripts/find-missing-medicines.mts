// Which medicines on our real prescriptions are NOT in the catalog yet?
// Reads every photo in data/private/prescriptions/ (both readings), compares with the catalog,
// and writes data/private/catalog-todo.csv: one row per missing medicine, in the same format as
// the catalog CSV. Person B fills in ingredients, uses, side effects, source and reviewer from the
// package leaflet / CDSCO / NFI, then imports it. Nothing here is guessed or auto-filled.
// Usage: npm run find-missing
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { readingA, readingB } from "@/lib/ai/read-prescription";
import { type CatalogEntry, matchName } from "@/lib/safety/match";

const DIR = "data/private/prescriptions";
const OUT = "data/private/catalog-todo.csv";
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

// name as read → how many readings saw it, and the strength they saw
const missing = new Map<string, { seen: number; strength: string | null; files: Set<string> }>();

for (const file of readdirSync(DIR).filter((f) => MIME[extname(f).toLowerCase()])) {
  const image = { data: readFileSync(join(DIR, file)).toString("base64"), mimeType: MIME[extname(file).toLowerCase()] };
  const results = await Promise.all([readingA(image).catch(() => null), readingB(image).catch(() => null)]);
  let found = 0;
  const catalog = await candidatesFor(results.flatMap((r) => r?.items ?? []));
  for (const r of results) {
    for (const item of r?.items ?? []) {
      if (!item.name) continue;
      found++;
      if (matchName(item.name, catalog as CatalogEntry[], item.strength).exact) continue;
      const key = item.name.replace(/\s+/g, " ").trim();
      const entry = missing.get(key) ?? { seen: 0, strength: item.strength, files: new Set<string>() };
      entry.seen++;
      entry.files.add(file);
      missing.set(key, entry);
    }
  }
  console.log(`${file}: ${found} medicine lines read`);
}

const header = "brand,ingredients,strength,form,mrp,pack_size,uses_en,uses_ml,uses_hi,side_effects_en,side_effects_ml,side_effects_hi,source,reviewer";
const quote = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const rows = [...missing.entries()]
  .sort((a, b) => b[1].seen - a[1].seen)
  .map(([name, m]) => [quote(name), "", quote(m.strength ?? ""), "Tablet", "", "", "", "", "", "", "", "", "", ""].join(","));
writeFileSync(OUT, [header, ...rows].join("\n") + "\n");

console.log(`\n${missing.size} medicine name(s) not in the catalog. Written to ${OUT}`);
console.log("Seen by both readings (most reliable) first. Check every spelling against the actual strip/box before importing.");
