import "server-only";
import { factSource } from "@/lib/safety/medication-math";
import { type CatalogEntry, matchName, normalizeStrength } from "@/lib/safety/match";
import { suggestAlternatives } from "@/lib/ai/identify-medicine";
import { catalogCandidates, cityOf, identifyMissing } from "@/lib/server/catalog";
import type { AgentCard, AgentTool } from "./types";

// Tools for questions about ANY medicine (not only the person's prescription).
// Facts come from our medicine database (7,000+ Indian brands + Jan Aushadhi generics), shown in
// cards. The AI may add general information only when the database has nothing (labelled on screen).

type Row = CatalogEntry & {
  form: string;
  mrp: number | null;
  pack_size: number | null;
  pack_label: string | null;
  manufacturer: string | null;
  uses_en: string | null;
  uses_ml: string | null;
  uses_hi: string | null;
  side_effects_en: string | null;
  side_effects_ml: string | null;
  side_effects_hi: string | null;
  source: string;
  reviewed: boolean | null;
  price_note: string | null;
};

const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 120) : "");
const sameSet = (a: string[], b: string[]) => a.length > 0 && [...a].map((x) => x.toLowerCase()).sort().join("|") === [...b].map((x) => x.toLowerCase()).sort().join("|");

/**
 * Exact match for a spoken/typed name in our saved list — identified by Gemini first if it isn't
 * there yet — or the look-alike list (never auto-picked).
 */
async function find(ctx: Parameters<AgentTool["run"]>[0], name: string) {
  const strength = name.match(/\d+(?:\.\d+)?\s*(mg|mcg|g|ml)?/i)?.[0] ?? null;
  let candidates = await catalogCandidates(ctx.supabase, [{ name, strength }]);
  let m = matchName(name, candidates, strength);
  if (!m.exact) {
    await identifyMissing(ctx.supabase, [{ name, strength }], await cityOf(ctx.supabase, ctx.patientId));
    candidates = await catalogCandidates(ctx.supabase, [{ name, strength }]);
    m = matchName(name, candidates, strength);
  }
  return { exact: m.exact, choices: m.candidates };
}

async function fullRow(ctx: Parameters<AgentTool["run"]>[0], id: string): Promise<Row | null> {
  const { data } = await ctx.supabase.from("medicine_catalog").select("*").eq("id", id).maybeSingle();
  return (data as Row) ?? null;
}

const lookupMedicine: AgentTool = {
  name: "lookup_medicine",
  description:
    "Looks up ANY medicine by brand or generic name in the medicine database (not only the person's prescription). Shows a card with composition, uses, side effects and price. Use it before talking about a specific medicine.",
  parameters: { type: "object", properties: { name: { type: "string", description: "Medicine name as the person said it, e.g. 'Dolo 650'" } }, required: ["name"] },
  async run(ctx, args) {
    const name = str(args.name);
    if (!name) return { data: { found: false } };
    const { exact, choices } = await find(ctx, name);
    if (!exact) {
      if (choices.length === 0) return { data: { found: false, note: "Not in the medicine database. You may give brief general information, clearly as general information." } };
      const card: AgentCard = { kind: "medicine_choices", asked: name, choices: choices.slice(0, 8).map((c) => ({ name: c.name, composition: `${c.ingredients.join(" + ")} ${c.strength}` })) };
      return { data: { found: "several", names: choices.slice(0, 8).map((c) => c.name), note: "Ask which one they mean. Do not pick one." }, cards: [card] };
    }
    const row = await fullRow(ctx, exact.id);
    if (!row) return { data: { found: false } };
    const card: AgentCard = {
      kind: "medicine_info",
      name: row.name,
      composition: `${row.ingredients.join(" + ")} ${row.strength}`,
      manufacturer: row.manufacturer,
      uses: row[`uses_${ctx.lang}`] ?? row.uses_en,
      sideEffects: row[`side_effects_${ctx.lang}`] ?? row.side_effects_en,
      price: row.mrp ? `₹${row.mrp}${row.pack_label ? ` · ${row.pack_label}` : row.pack_size ? ` for ${row.pack_size}` : ""}${row.price_note ? ` (${row.price_note})` : ""}` : null,
      source: factSource(row),
    };
    // The model gets the composition (so it can explain it simply), not the uses/side-effect text.
    return { data: { found: true, name: row.name, composition: card.composition, note: "A card with uses, side effects and price is shown. Add one short helpful sentence." }, cards: [card] };
  },
};

const findAlternatives: AgentTool = {
  name: "find_alternatives",
  description:
    "Finds other brands and Jan Aushadhi generics with exactly the same active ingredients and strength as a medicine, with prices. Use for 'alternative', 'similar', 'cheaper', 'generic' questions. Never tell the person to switch; say to ask their doctor or pharmacist.",
  parameters: { type: "object", properties: { name: { type: "string", description: "The medicine to compare, e.g. 'Augmentin 625 Duo'" } }, required: ["name"] },
  async run(ctx, args) {
    const name = str(args.name);
    const { exact, choices } = name ? await find(ctx, name) : { exact: null, choices: [] };
    if (!exact) {
      if (choices.length) {
        const card: AgentCard = { kind: "medicine_choices", asked: name, choices: choices.slice(0, 8).map((c) => ({ name: c.name, composition: `${c.ingredients.join(" + ")} ${c.strength}` })) };
        return { data: { found: "several", note: "Ask which one they mean first." }, cards: [card] };
      }
      return { data: { found: false, note: "Not in the medicine database, so no exact alternatives can be listed." } };
    }
    const base = await fullRow(ctx, exact.id);
    if (!base) return { data: { found: false } };
    const strength = normalizeStrength(base.strength);
    // Other brands: Gemini's knowledge (the downloaded brand list was removed), prices as estimates.
    const city = await cityOf(ctx.supabase, ctx.patientId);
    const sameBrands = await suggestAlternatives(base, city).catch(() => []);
    const { data: generics } = await ctx.supabase.from("generic_products").select("name, ingredients, strength, mrp, pack_size").contains("ingredients", base.ingredients);
    const sameGenerics = (generics ?? []).filter((g) => sameSet(g.ingredients, base.ingredients) && normalizeStrength(g.strength) === strength).slice(0, 3);
    const perUnit = (mrp: number | null, pack: number | null) => (mrp && pack ? `₹${(mrp / pack).toFixed(2)} each` : null);
    const card: AgentCard = {
      kind: "alternatives",
      base: { name: base.name, composition: `${base.ingredients.join(" + ")} ${base.strength}`, price: perUnit(base.mrp, base.pack_size) },
      brands: sameBrands.map((b) => ({ name: b.name, manufacturer: b.manufacturer, price: perUnit(b.priceInr, b.packSize) })),
      estimate: city ? `Brand prices are AI estimates for ${city}` : "Brand prices are AI estimates",
      generics: sameGenerics.map((g) => ({ name: g.name, price: perUnit(g.mrp, g.pack_size) })),
      source: factSource(base),
    };
    return {
      data: { found: true, name: base.name, brands: sameBrands.length, generics: sameGenerics.length, note: "Card shown. Remind them to ask their doctor or pharmacist before switching." },
      cards: [card],
    };
  },
};

export const infoTools: AgentTool[] = [lookupMedicine, findAlternatives];
