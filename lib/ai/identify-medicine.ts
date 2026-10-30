import "server-only";
import { GoogleGenAI, type ThinkingLevel } from "@google/genai";
import { FALLBACK_MODEL, IDENTIFY_MODEL } from "./models";

// Identifies medicine names (as read from a prescription, strip, or typed) using Gemini's
// knowledge, replacing the downloaded dataset. Results are saved once in medicine_catalog
// (source_kind 'ai', labelled "not pharmacist-reviewed"), and a person still confirms each
// medicine before any reminder is set.

export type Identified = {
  asked: string;
  isMedicine: boolean;
  name: string; // as printed on Indian packs, with the strength number, e.g. "Dolo 650"
  ingredients: string[]; // lower-case generic names
  strength: string; // "650 mg" or "500 mg + 125 mg"
  form: string;
  manufacturer: string | null;
  uses: { en: string | null; ml: string | null; hi: string | null };
  sideEffects: { en: string | null; ml: string | null; hi: string | null };
  priceInr: number | null; // typical MRP for packSize units
  packSize: number | null;
};

const s = (t: string) => ({ type: [t, "null"] });
const SCHEMA = {
  type: "object",
  properties: {
    medicines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          asked: { type: "string" },
          is_medicine: { type: "boolean" },
          name: s("string"),
          ingredients: { type: "array", items: { type: "string" } },
          strength: s("string"),
          form: s("string"),
          manufacturer: s("string"),
          uses_en: s("string"),
          uses_ml: s("string"),
          uses_hi: s("string"),
          side_effects_en: s("string"),
          side_effects_ml: s("string"),
          side_effects_hi: s("string"),
          price_inr: s("number"),
          pack_size: s("integer"),
        },
        required: ["asked", "is_medicine", "name", "ingredients", "strength", "form", "manufacturer", "uses_en", "uses_ml", "uses_hi", "side_effects_en", "side_effects_ml", "side_effects_hi", "price_inr", "pack_size"],
      },
    },
  },
  required: ["medicines"],
};

const prompt = (names: string[], city: string | null) => `You identify medicines sold in India for a medicine-reminder app used by elderly people.
For each written name below (it may come from handwriting, so spelling can be slightly off), return one entry:
- is_medicine: true only if you are confident it is a real medicine brand or generic sold in India. If unsure, false (never guess).
- name: the brand as printed on the pack, with its strength number, e.g. "Dolo 650", "Augmentin 625 Duo", "Pan 40". If the written strength differs from what exists, use the written one only if that strength really exists; otherwise is_medicine false.
- ingredients: active ingredients in lower case, generic names (e.g. ["paracetamol"]).
- strength: like "650 mg", or "500 mg + 125 mg" for combinations, in the same order as ingredients.
- form: Tablet, Capsule, Syrup, Injection, Cream, Drops or Inhaler.
- manufacturer: the company, or null if unsure.
- uses_en / uses_ml / uses_hi: one short, simple sentence on what it is commonly used for (English, Malayalam, Hindi).
- side_effects_en / _ml / _hi: up to five common side effects, comma separated.
- price_inr and pack_size: typical MRP in rupees for one pack of pack_size units${city ? ` in ${city}, India` : " in India"}, or null if unsure.
Never give dose advice. Keep "asked" exactly as given.
Names: ${JSON.stringify(names)}`;

let client: GoogleGenAI | null = null;
const ai = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));

async function ask(model: string, names: string[], city: string | null) {
  const res = await ai().models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text: prompt(names, city) }] }],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: SCHEMA,
      thinkingConfig: { thinkingLevel: "LOW" as ThinkingLevel },
      abortSignal: AbortSignal.timeout(20_000),
    },
  });
  return (JSON.parse(res.text ?? "{}") as { medicines?: Record<string, unknown>[] }).medicines ?? [];
}

const text = (v: unknown, max = 400) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Identifies up to 12 names in one call. Throws if the AI is unavailable (caller decides). */
export async function identifyMedicines(names: string[], city: string | null = null): Promise<Identified[]> {
  const list = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 12);
  if (!list.length) return [];
  let raw: Record<string, unknown>[];
  try {
    raw = await ask(IDENTIFY_MODEL, list, city);
  } catch {
    raw = await ask(FALLBACK_MODEL, list, city);
  }
  return raw.map((m) => {
    const ingredients = Array.isArray(m.ingredients) ? m.ingredients.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim().toLowerCase()) : [];
    const name = text(m.name, 120);
    const strength = text(m.strength, 60);
    const price = typeof m.price_inr === "number" && m.price_inr > 0 && m.price_inr < 100000 ? Math.round(m.price_inr * 100) / 100 : null;
    const pack = Number.isInteger(m.pack_size) && (m.pack_size as number) > 0 && (m.pack_size as number) <= 1000 ? (m.pack_size as number) : null;
    return {
      asked: String(m.asked ?? ""),
      // Incomplete answers count as "not identified": we never fill gaps ourselves.
      isMedicine: m.is_medicine === true && Boolean(name && strength && ingredients.length),
      name: name ?? "",
      ingredients,
      strength: strength ?? "",
      form: text(m.form, 30) ?? "Tablet",
      manufacturer: text(m.manufacturer, 120),
      uses: { en: text(m.uses_en), ml: text(m.uses_ml), hi: text(m.uses_hi) },
      sideEffects: { en: text(m.side_effects_en), ml: text(m.side_effects_ml), hi: text(m.side_effects_hi) },
      priceInr: price,
      packSize: price ? pack : null,
    };
  });
}

export type Alternative = { name: string; manufacturer: string | null; priceInr: number | null; packSize: number | null };

/**
 * Other brands sold in India with EXACTLY the same active ingredients and strength, with typical
 * prices (for the person's city when known). AI knowledge, shown as estimates.
 */
export async function suggestAlternatives(base: { name: string; ingredients: string[]; strength: string }, city: string | null): Promise<Alternative[]> {
  const res = await ai().models.generateContent({
    model: IDENTIFY_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `List up to 6 other medicine brands sold in India with exactly the same active ingredients (${base.ingredients.join(" + ")}) and exactly the same strength (${base.strength}) as ${base.name}. Include the Jan Aushadhi generic if one exists. Only brands you are confident exist. For each give the typical MRP in rupees${city ? ` in ${city}` : ""} for one pack and the pack size, or null if unsure. Cheapest first.`,
          },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string" }, manufacturer: { type: ["string", "null"] }, price_inr: { type: ["number", "null"] }, pack_size: { type: ["integer", "null"] } },
          required: ["name", "manufacturer", "price_inr", "pack_size"],
        },
      },
      thinkingConfig: { thinkingLevel: "LOW" as ThinkingLevel },
      abortSignal: AbortSignal.timeout(20_000),
    },
  });
  const list = JSON.parse(res.text ?? "[]") as Record<string, unknown>[];
  return list.slice(0, 6).map((a) => ({
    name: text(a.name, 120) ?? "",
    manufacturer: text(a.manufacturer, 120),
    priceInr: typeof a.price_inr === "number" && a.price_inr > 0 ? a.price_inr : null,
    packSize: Number.isInteger(a.pack_size) && (a.pack_size as number) > 0 ? (a.pack_size as number) : null,
  })).filter((a) => a.name && a.name.toLowerCase() !== base.name.toLowerCase());
}
