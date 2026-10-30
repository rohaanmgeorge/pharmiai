import "server-only";
import { GoogleGenAI, type ThinkingLevel } from "@google/genai";
import { FALLBACK_MODEL, LISTEN_MODEL, SPEAK_MODEL } from "@/lib/ai/models";
import type { Lang } from "@/lib/i18n";

// Voice with Gemini: listening (speech → text) and speaking (text → speech) in English, Malayalam
// and Hindi. Server only — the key never reaches the phone. Audio is not stored or logged.

const LANG_NAME: Record<Lang, string> = { en: "English", ml: "Malayalam", hi: "Hindi" };

let client: GoogleGenAI | null = null;
const ai = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));

export const voiceReady = () => Boolean(process.env.GEMINI_API_KEY);

/** Recording (webm/ogg/mp4/wav, under 30 s) → the words spoken, in that language's script. */
export async function speechToText(audio: Blob, lang: Lang): Promise<string> {
  const data = Buffer.from(await audio.arrayBuffer()).toString("base64");
  const mimeType = (audio.type || "audio/webm").split(";")[0];
  const request = (model: string) =>
    ai().models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { data, mimeType } },
            { text: `Transcribe exactly what the speaker says. The speaker uses ${LANG_NAME[lang]} (may mix in English medicine names). Write ${LANG_NAME[lang]} words in ${LANG_NAME[lang]} script. Return only the spoken words, nothing else. If nothing is said, return an empty string.` },
          ],
        },
      ],
      config: { thinkingConfig: { thinkingLevel: "MINIMAL" as ThinkingLevel }, abortSignal: AbortSignal.timeout(20_000) },
    });
  const res = await request(LISTEN_MODEL).catch(() => request(FALLBACK_MODEL));
  return (res.text ?? "").trim().replace(/^["“]|["”]$/g, "");
}

// Fixed phrases repeat a lot: keep their audio in memory instead of asking again.
const cache = new Map<string, Buffer>();

/** Wraps raw 16-bit PCM (what Gemini returns) in a WAV header so phones can play it. */
function toWav(pcm: Buffer, rate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(1, 22); // mono
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Text → WAV audio in a warm voice. Only the text is sent (an instruction would be read aloud too). */
export async function textToSpeech(text: string, lang: Lang): Promise<Buffer> {
  const key = `${lang}:${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await ai().models.generateContent({
    model: SPEAK_MODEL,
    contents: [{ role: "user", parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
      abortSignal: AbortSignal.timeout(25_000),
    },
  });
  const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part?.inlineData?.data) throw new Error("No audio returned");
  const bytes = Buffer.from(part.inlineData.data, "base64");
  const mime = part.inlineData.mimeType ?? "";
  // Raw PCM ("audio/L16;rate=24000") needs a WAV header; a WAV file is used as it is.
  const rate = Number(mime.match(/rate=(\d+)/)?.[1] ?? 24000);
  const audio = bytes.subarray(0, 4).toString() === "RIFF" ? bytes : toWav(bytes, rate);
  if (cache.size > 200) cache.clear();
  cache.set(key, audio);
  return audio;
}
