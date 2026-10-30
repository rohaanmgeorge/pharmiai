import "server-only";
import { GoogleGenAI, type ThinkingLevel } from "@google/genai";
import type { StripReading } from "@/lib/safety/strip";
import { FALLBACK_MODEL, FAST_THINKING, READING_A_MODEL, READING_A_THINKING, READING_B_MODEL, READING_TIMEOUT_MS } from "./models";

// One reading of a medicine strip/box photo = a plain transcription of what is PRINTED.
// The AI never decides status, never corrects a name, never guesses an expiry,
// and never identifies loose tablets by shape or colour.

const nullable = (type: string) => ({ type: [type, "null"] });

const SCHEMA = {
  type: "object",
  properties: {
    brand: nullable("string"),
    strength: nullable("string"),
    expiry: nullable("string"),
    batch: nullable("string"),
  },
  required: ["brand", "strength", "expiry", "batch"],
};

const RULES = `Rules — follow exactly:
- Copy text exactly as printed. Do NOT correct spelling or change it to a medicine you know.
- If any part is unclear, cut off, shiny or missing, return null for that field. Never guess or fill in.
- brand: the brand name as printed, including any number printed with it (e.g. "Glyconil 500").
- strength: only if printed (e.g. "500 mg"), else null.
- expiry: the expiry date exactly as printed (e.g. "EXP 03/2027", "MAR 2027"), else null. Not the manufacturing date.
- batch: the batch / lot number as printed (e.g. "B.No. GX123" → "GX123"), else null.
- If the image shows loose tablets or anything that is not a printed strip or box, return all fields as null.`;

const PROMPT_A = `You are transcribing a photo of a medicine strip or box for a medicine-safety app.
${RULES}`;

// Different wording for the second, blind reading so the two are as independent as possible.
const PROMPT_B = `Look only at the printed text on this medicine pack. Report the brand, strength, expiry date and batch number you can see.
${RULES}`;

let client: GoogleGenAI | null = null;
const ai = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));

const text = (v: unknown, max = 80) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

async function ask(model: string, prompt: string, image: { data: string; mimeType: string }): Promise<StripReading> {
  const res = await ai().models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ inlineData: image }, { text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: SCHEMA,
      thinkingConfig: { thinkingLevel: (model === READING_A_MODEL ? READING_A_THINKING : FAST_THINKING) as ThinkingLevel },
      abortSignal: AbortSignal.timeout(READING_TIMEOUT_MS),
    },
  });
  const parsed = JSON.parse(res.text ?? "{}") as Record<string, unknown>;
  // Keep only the fields we asked for, as plain strings.
  return { brand: text(parsed.brand), strength: text(parsed.strength, 30), expiry: text(parsed.expiry, 30), batch: text(parsed.batch, 30) };
}

async function withFallback(model: string, prompt: string, image: { data: string; mimeType: string }) {
  try {
    return { model, reading: await ask(model, prompt, image) };
  } catch (e) {
    // Overloaded or failed: one retry on the fallback model, then give up (the strip stays "Needs check").
    if (model === FALLBACK_MODEL) throw e;
    return { model: FALLBACK_MODEL, reading: await ask(FALLBACK_MODEL, prompt, image) };
  }
}

export const stripReadingA = (image: { data: string; mimeType: string }) => withFallback(READING_A_MODEL, PROMPT_A, image);
export const stripReadingB = (image: { data: string; mimeType: string }) => withFallback(READING_B_MODEL, PROMPT_B, image);
