import "server-only";
import { GoogleGenAI } from "@google/genai";
import { FALLBACK_MODEL, READING_A_MODEL, READING_B_MODEL } from "./models";

// One reading = a plain transcription of what is written. The AI never decides status,
// never corrects spelling to a known medicine, and returns null for anything unclear.

export type ReadItem = {
  name: string | null;
  strength: string | null;
  doseCode: string | null;
  durationDays: number | null;
  food: "before" | "after" | null;
};

const nullable = (type: string) => ({ type: [type, "null"] });

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: nullable("string"),
          strength: nullable("string"),
          doseCode: nullable("string"),
          durationDays: nullable("integer"),
          food: { type: ["string", "null"], enum: ["before", "after", null] },
        },
        required: ["name", "strength", "doseCode", "durationDays", "food"],
      },
    },
    doctor: nullable("string"),
  },
  required: ["items", "doctor"],
};

const RULES = `Rules — follow exactly:
- Copy text exactly as written. Do NOT correct spelling or change it to a medicine you know.
- If any part is unclear, smudged or missing, return null for that field. Never guess or fill in.
- name: the medicine name as written, including any number printed with it (e.g. "Glyconil 500").
- strength: only if written (e.g. "500 mg"), else null.
- doseCode: the dose pattern exactly as written (e.g. "1-0-1", "OD", "BD", "TDS", "HS", "SOS"), else null.
- durationDays: number of days only if clearly written (e.g. "x 5 days" → 5, "x 1 month" → 30), else null.
- food: "before" or "after" only if written (e.g. "AC"/"before food" → before, "PC"/"after food" → after), else null.
- doctor: the doctor's printed name (e.g. "Dr. A. Kumar"), else null. A person confirms it later.
- Ignore patient details (name, age, phone, address), signatures and anything that is not a medicine line.
- If the image is not a prescription, return {"items": []}.`;

const PROMPT_A = `You are transcribing a doctor's prescription photo for a medicine-safety app.
List every medicine line on the prescription.
${RULES}`;

// Different wording for the second, blind reading so the two are as independent as possible.
const PROMPT_B = `Read this image line by line. For each line that names a medicine, report what is written.
${RULES}`;

let client: GoogleGenAI | null = null;
const ai = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));

async function ask(model: string, prompt: string, image: { data: string; mimeType: string }): Promise<{ items: ReadItem[]; doctor: string | null }> {
  const res = await ai().models.generateContent({
    model,
    contents: [{ role: "user", parts: [{ inlineData: image }, { text: prompt }] }],
    config: { responseMimeType: "application/json", responseJsonSchema: SCHEMA },
  });
  const parsed = JSON.parse(res.text ?? "{}") as { items?: ReadItem[]; doctor?: unknown };
  if (!Array.isArray(parsed.items)) throw new Error("Reading returned no items list");
  // Keep only the fields we asked for, with the types we expect.
  const doctor = typeof parsed.doctor === "string" && parsed.doctor.trim() ? parsed.doctor.trim().slice(0, 80) : null;
  const items = parsed.items.map((i) => ({
    name: typeof i.name === "string" && i.name.trim() ? i.name.trim() : null,
    strength: typeof i.strength === "string" && i.strength.trim() ? i.strength.trim() : null,
    doseCode: typeof i.doseCode === "string" && i.doseCode.trim() ? i.doseCode.trim() : null,
    durationDays: Number.isInteger(i.durationDays) ? i.durationDays : null,
    food: i.food === "before" || i.food === "after" ? i.food : null,
  }));
  return { items, doctor };
}

async function withFallback(model: string, prompt: string, image: { data: string; mimeType: string }) {
  try {
    return { model, ...(await ask(model, prompt, image)) };
  } catch (e) {
    // Overloaded or failed: one retry on the fallback model, then give up (the item stays "Needs check").
    if (model === FALLBACK_MODEL) throw e;
    return { model: FALLBACK_MODEL, ...(await ask(FALLBACK_MODEL, prompt, image)) };
  }
}

export const readingA = (image: { data: string; mimeType: string }) => withFallback(READING_A_MODEL, PROMPT_A, image);
export const readingB = (image: { data: string; mimeType: string }) => withFallback(READING_B_MODEL, PROMPT_B, image);
