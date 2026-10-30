// Translates the app's screen text (lib/translations/ui-strings.json) into Malayalam and Hindi.
// Run after `npm run i18n:extract`. Only new strings are sent; existing translations are kept,
// so Person B's corrections in lib/translations/ml.json / hi.json are never overwritten.
// Every result is checked: same number of {} placeholders and the same digits, else we keep English.
// Usage: npm run i18n:translate
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { GoogleGenAI, type ThinkingLevel } from "@google/genai";

const LANGS = { ml: "Malayalam (as spoken in Kerala)", hi: "Hindi" } as const;
const BATCH = 80;

const strings: string[] = JSON.parse(readFileSync("lib/translations/ui-strings.json", "utf8"));
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const prompt = (language: string, items: string[]) => `Translate these user-interface texts of a medicine reminder app for elderly people in India into ${language}.
Rules:
- Simple, warm, everyday words an elderly person understands. Short like a button or label when the English is short.
- Keep every "{}" exactly as "{}" (it is a value filled in later), in a natural position. Keep the same count.
- Keep numbers, times, "SOS", "108", "112", "PharmiAI", "Jan Aushadhi", "WhatsApp", "SMS", "QR", "OD", "BD", "TDS", "HS", dose codes like "1-0-1", and medicine names unchanged.
- Keep leading or trailing punctuation and symbols (· — : …) as they are.
- Return a JSON array with exactly ${items.length} strings, in the same order.
Texts:
${JSON.stringify(items)}`;

const digits = (s: string) => (s.match(/\d+/g) ?? []).sort().join(",");
const holes = (s: string) => (s.match(/\{\}/g) ?? []).length;
// The model sometimes returns the English unchanged; that is not a translation (short names like "SOS" are fine).
const sameAsEnglish = (t: string, en: string) => t.trim() === en.trim() && /[a-z]{3,}/.test(en);

async function translateBatch(language: string, items: string[]): Promise<(string | null)[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await ai.models.generateContent({
        model: "gemini-3.5-flash-lite", // separate free quota from the prescription reader
        contents: [{ role: "user", parts: [{ text: prompt(language, items) }] }],
        config: {
          responseMimeType: "application/json",
          responseJsonSchema: { type: "array", items: { type: "string" } },
          thinkingConfig: { thinkingLevel: "LOW" as ThinkingLevel },
          abortSignal: AbortSignal.timeout(120_000),
        },
      });
      const out = JSON.parse(res.text ?? "[]") as unknown[];
      if (!Array.isArray(out) || out.length !== items.length) throw new Error("wrong length");
      // A translation that lost a placeholder or changed a number is dropped (English is shown instead).
      return out.map((t, i) => (typeof t === "string" && t.trim() && holes(t) === holes(items[i]) && digits(t) === digits(items[i]) && !sameAsEnglish(t, items[i]) ? t.trim() : null));
    } catch (e) {
      console.log(`  retry (${(e as Error).message.slice(0, 120)})`);
    }
  }
  return items.map(() => null);
}

for (const [code, language] of Object.entries(LANGS)) {
  const file = `lib/translations/${code}.json`;
  const done: Record<string, string> = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  for (const k of Object.keys(done)) if (sameAsEnglish(done[k], k)) delete done[k]; // try those again
  const todo = strings.filter((s) => !done[s]);
  console.log(`${code}: ${todo.length} to translate (${Object.keys(done).length} already done)`);
  for (let i = 0; i < todo.length; i += BATCH) {
    const items = todo.slice(i, i + BATCH);
    const result = await translateBatch(language, items);
    result.forEach((t, j) => t && (done[items[j]] = t));
    console.log(`  ${Math.min(i + BATCH, todo.length)}/${todo.length}`);
  }
  // Keep only strings still used by the app, sorted, so the file is easy to review.
  const sorted = Object.fromEntries(strings.filter((s) => done[s]).map((s) => [s, done[s]]));
  writeFileSync(file, JSON.stringify(sorted, null, 1) + "\n");
  console.log(`${code}: ${Object.keys(sorted).length}/${strings.length} translated → ${file}`);
}
