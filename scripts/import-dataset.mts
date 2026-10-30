// Imports a big public medicine dataset (brands) and/or the Jan Aushadhi product list (generics).
// Column names are detected automatically, so common Kaggle "Indian medicine" CSVs work as-is.
//
// Usage:
//   npm run import-dataset -- --brands data/private/datasets/medicines.csv --source "Kaggle: <dataset title>"
//   npm run import-dataset -- --generics data/private/datasets/janaushadhi.csv
//   add --dry to only print what would be imported.
//
// Safety: imported rows are marked reviewed=false and source_kind='dataset'; the app labels their
// uses/side effects "not pharmacist-reviewed". Names that clash with an existing name are skipped,
// never merged — matching only trusts a name that appears exactly once.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const brandsPath = arg("--brands");
const genericsPath = arg("--generics");
const source = arg("--source") ?? "Public medicine dataset";
const dry = process.argv.includes("--dry");
if (!brandsPath && !genericsPath) {
  console.error('Usage: npm run import-dataset -- --brands <file.csv> --source "<name>"  and/or  --generics <file.csv>');
  process.exit(1);
}

/** CSV parser: quoted fields with commas, newlines and "" escapes. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);
  const [header, ...data] = rows;
  const keys = header.map((h) => h.replace(/^﻿/, "").trim().toLowerCase());
  return data.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

/** First column that exists among several possible names. */
const pick = (r: Record<string, string>, ...names: string[]) => {
  for (const n of names) if (r[n]) return r[n];
  return "";
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80);
const norm = (s: string) => s.toLowerCase().replace(/\b(tab|tabs|tablet|tb|cap|caps|capsule|syp|syrup|inj)\b\.?/g, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const money = (s: string) => {
  const n = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const packCount = (s: string) => {
  const m = s.match(/(\d+)\s*(?:'s|s\b|tablets?|capsules?|tabs?|caps?|nos?|units?)/i) ?? s.match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

/**
 * "Amoxycillin (500mg) + Clavulanic Acid (125mg)" → ingredients [amoxycillin, clavulanic acid], strength "500 mg + 125 mg".
 * "Metformin 500mg" → [metformin], "500 mg". Unknown shapes → null (row skipped, never guessed).
 */
function parseComposition(raw: string): { ingredients: string[]; strength: string } | null {
  const parts = raw.split(/\s*\+\s*/).filter(Boolean);
  const ingredients: string[] = [];
  const strengths: string[] = [];
  for (const p of parts) {
    const m = p.match(/^(.*?)[\s(]*([\d.]+)\s*(mg|mcg|µg|g|ml|iu|%|w\/w|w\/v)\b/i);
    if (!m) return null;
    const name = m[1].replace(/[()]/g, "").trim().toLowerCase();
    if (!name) return null;
    ingredients.push(name);
    strengths.push(`${m[2]} ${m[3].toLowerCase()}`);
  }
  return ingredients.length ? { ingredients, strength: strengths.join(" + ") } : null;
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

async function upsertInBatches(table: string, rows: Record<string, unknown>[], onConflict: string) {
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + 1000), { onConflict, ignoreDuplicates: false });
    if (error) throw new Error(`${table} batch ${i / 1000 + 1}: ${error.message}`);
    process.stdout.write(`\r${table}: ${Math.min(i + 1000, rows.length)}/${rows.length}`);
  }
  console.log();
}

if (brandsPath) {
  const data = parseCsv(readFileSync(brandsPath, "utf8"));
  console.log(`Read ${data.length} rows. Columns: ${Object.keys(data[0] ?? {}).join(", ")}`);

  // Existing names (hand-checked + demo) always win; we never overwrite them.
  const existing = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data: page } = await db.from("medicine_catalog").select("name").range(from, from + 999);
    (page ?? []).forEach((r) => existing.add(norm(r.name)));
    if (!page || page.length < 1000) break;
  }

  const seen = new Map<string, number>(); // normalised name → how many rows have it
  const candidates: Record<string, unknown>[] = [];
  const skipped = { discontinued: 0, noComposition: 0, existing: 0 };
  for (const r of data) {
    const name = pick(r, "name", "product_name", "brand", "brand_name", "medicine name", "medicine_name", "drug_name");
    if (!name) continue;
    if (/^(true|1|yes)$/i.test(pick(r, "is_discontinued", "discontinued"))) { skipped.discontinued++; continue; }
    const compositionText = [pick(r, "short_composition1", "salt_composition", "composition", "salt", "generic_name"), pick(r, "short_composition2")].filter(Boolean).join(" + ");
    const comp = parseComposition(compositionText);
    if (!comp) { skipped.noComposition++; continue; }
    const key = norm(name);
    if (!key) continue;
    if (existing.has(key)) { skipped.existing++; continue; }
    seen.set(key, (seen.get(key) ?? 0) + 1);
    candidates.push({
      key,
      row: {
        id: `ds-${slug(name)}`,
        name: name.slice(0, 200),
        ingredients: comp.ingredients,
        strength: comp.strength,
        form: /syrup|suspension/i.test(name) ? "Syrup" : /capsule/i.test(name) ? "Capsule" : /injection/i.test(name) ? "Injection" : "Tablet",
        mrp: money(pick(r, "price(₹)", "price", "product_price", "mrp")),
        pack_size: packCount(pick(r, "pack_size_label", "pack_size", "packaging", "pack")),
        pack_label: pick(r, "pack_size_label", "pack_size", "packaging", "pack").slice(0, 120) || null,
        manufacturer: pick(r, "manufacturer_name", "product_manufactured", "manufacturer").slice(0, 160) || null,
        uses_en: pick(r, "medicine_desc", "uses", "use0", "description").slice(0, 600) || null,
        side_effects_en: pick(r, "side_effects", "side effects", "sideeffect0").slice(0, 600) || null,
        source,
        reviewer: "Not reviewed (dataset import)",
        reviewed: false,
        source_kind: "dataset",
      },
    });
  }
  // A name that appears twice (e.g. two makers) is ambiguous: keep neither.
  const ids = new Set<string>();
  const rows = candidates
    .filter((c) => seen.get(c.key as string) === 1)
    .map((c) => c.row as Record<string, unknown>)
    .filter((r) => !ids.has(r.id as string) && ids.add(r.id as string)); // one row per id
  const ambiguous = candidates.length - rows.length;
  console.log(`Brands to import: ${rows.length}. Skipped: ${skipped.discontinued} discontinued, ${skipped.noComposition} unreadable composition, ${skipped.existing} already in catalog, ${ambiguous} ambiguous names.`);
  if (!dry) await upsertInBatches("medicine_catalog", rows, "id");
}

if (genericsPath) {
  const data = parseCsv(readFileSync(genericsPath, "utf8"));
  console.log(`Read ${data.length} rows. Columns: ${Object.keys(data[0] ?? {}).join(", ")}`);
  const rows: Record<string, unknown>[] = [];
  let unreadable = 0;
  for (const r of data) {
    const code = pick(r, "drug code", "drug_code", "ja_code", "code", "product code");
    const name = pick(r, "generic name", "generic_name", "name", "product name", "drug name");
    const mrp = money(pick(r, "mrp", "mrp (rs.)", "mrp(rs)", "price"));
    const pack = packCount(pick(r, "unit size", "unit_size", "pack size", "pack_size", "unit"));
    // Name looks like "Paracetamol Tablets IP 500 mg": ingredient = words before the form word.
    const comp = parseComposition(name.replace(/\b(tablets?|capsules?|syrup|suspension|injection|ip|bp|usp|i\.p\.)\b/gi, " ").replace(/\s+/g, " "));
    if (!code || !name || !mrp || !pack || !comp) { unreadable++; continue; }
    rows.push({ ja_code: code, name: name.slice(0, 200), ingredients: comp.ingredients, strength: comp.strength, mrp, pack_size: pack });
  }
  console.log(`Generics to import: ${rows.length}. Skipped ${unreadable} rows we could not read exactly.`);
  if (!dry) await upsertInBatches("generic_products", rows, "ja_code");
}
