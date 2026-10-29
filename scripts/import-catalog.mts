// Loads the curated medicine catalog and Jan Aushadhi generics into Supabase.
// Usage: node --env-file=.env.local scripts/import-catalog.ts <catalog.csv> [generics.csv]
// Re-running is safe: rows are updated by id.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/** Small CSV parser: handles quoted fields with commas and "" escapes. */
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
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const num = (s: string) => (s ? Number(s) : null);
const orNull = (s: string) => s || null;
// "Metformin:500mg;Sitagliptin:50mg" -> ["metformin", "sitagliptin"]
const ingredientNames = (s: string) => s.split(";").map((p) => p.split(":")[0].trim().toLowerCase()).filter(Boolean);

const [catalogPath, genericsPath] = process.argv.slice(2);
if (!catalogPath) {
  console.error("Usage: node --env-file=.env.local scripts/import-catalog.ts <catalog.csv> [generics.csv]");
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const catalog = parseCsv(readFileSync(catalogPath, "utf8")).map((r, i) => {
  for (const col of ["brand", "ingredients", "strength", "source", "reviewer"]) {
    if (!r[col]) throw new Error(`Row ${i + 2}: "${col}" is required (every fact needs a source and a reviewer)`);
  }
  return {
    id: slug(r.brand),
    name: r.brand,
    ingredients: ingredientNames(r.ingredients),
    strength: r.strength,
    form: r.form || "Tablet",
    mrp: num(r.mrp),
    pack_size: num(r.pack_size),
    uses_en: orNull(r.uses_en), uses_ml: orNull(r.uses_ml), uses_hi: orNull(r.uses_hi),
    side_effects_en: orNull(r.side_effects_en), side_effects_ml: orNull(r.side_effects_ml), side_effects_hi: orNull(r.side_effects_hi),
    source: r.source,
    reviewer: r.reviewer,
  };
});
const { error: e1 } = await db.from("medicine_catalog").upsert(catalog);
if (e1) throw e1;
console.log(`medicine_catalog: ${catalog.length} rows`);

if (genericsPath) {
  const generics = parseCsv(readFileSync(genericsPath, "utf8")).map((r) => ({
    ja_code: r.ja_code,
    name: r.name,
    ingredients: ingredientNames(r.ingredients),
    strength: r.strength,
    mrp: Number(r.mrp),
    pack_size: Number(r.pack_size),
  }));
  const { error: e2 } = await db.from("generic_products").upsert(generics);
  if (e2) throw e2;
  console.log(`generic_products: ${generics.length} rows`);
}
