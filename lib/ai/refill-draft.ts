import "server-only";
import { GoogleGenAI, type ThinkingLevel } from "@google/genai";
import type { Lang } from "@/lib/i18n";
import { type RefillInput, safeRefillText } from "@/lib/safety/refill-guard";
import { AGENT_MODEL, FALLBACK_MODEL, FAST_THINKING } from "./models";

// The refill agent's ONLY AI step: wording a short, polite reorder message.
// Medicine name, strength and quantity come from the database and our code; the guard in
// lib/safety/refill-guard.ts throws the draft away (→ fixed template) if it adds anything else.

const LANGUAGE: Record<Lang, string> = { en: "English", ml: "Malayalam", hi: "Hindi" };

// Privacy: the patient's and pharmacy's names are never sent to the AI. It writes
// placeholders and we fill them in here.
const PATIENT = "{PATIENT}";
const PHARMACY = "{PHARMACY}";

function prompt(lang: Lang, input: RefillInput) {
  return `Write a short, polite message (2-3 sentences) from a family to their local pharmacy, asking them to keep a medicine ready for pickup.
Write it in ${LANGUAGE[lang]}.
Medicine: ${input.medicine} (${input.strength})
Quantity: ${input.quantity}
Rules — follow exactly:
- Write the medicine name and strength exactly as given, in English letters.
- The only numbers allowed are the quantity and the numbers in the medicine name and strength.
- Use ${PHARMACY} where the pharmacy's name goes and ${PATIENT} where the patient's name goes.
- Do NOT mention how or when to take the medicine, doses, times of day, or any medical advice.
- Do NOT mention any other medicine. No links. Reply with the message text only.`;
}

let client: GoogleGenAI | null = null;
const ai = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));

async function ask(model: string, text: string): Promise<string | null> {
  const res = await ai().models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ text }] }],
    config: { thinkingConfig: { thinkingLevel: FAST_THINKING as ThinkingLevel }, abortSignal: AbortSignal.timeout(15_000) },
  });
  return res.text?.trim() || null;
}

/**
 * Drafts the message. Never throws: any AI problem means the fixed template is used.
 * `namesIn(text)` returns catalog medicine names that may appear in a text (for the guard).
 */
export async function draftRefillMessage(lang: Lang, input: RefillInput, namesIn: (text: string) => Promise<string[]>) {
  let raw: string | null = null;
  if (process.env.GEMINI_API_KEY) {
    const text = prompt(lang, input);
    try {
      raw = await ask(AGENT_MODEL, text);
    } catch {
      raw = await ask(FALLBACK_MODEL, text).catch(() => null); // overloaded: one retry, then template
    }
  }
  const filled = raw?.replaceAll(PATIENT, input.patient.trim() || "").replaceAll(PHARMACY, input.pharmacy.trim() || "").replace(/\s+([,.!?।])/g, "$1") ?? null;
  return safeRefillText(filled, lang, input, filled ? await namesIn(filled).catch(() => []) : []);
}
