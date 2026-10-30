import "server-only";
import type { Lang } from "@/lib/i18n";

// Sarvam AI: speech-to-text and text-to-speech built for Indian languages (en-IN, hi-IN, ml-IN).
// Server only — the API key never reaches the phone. Docs: docs.sarvam.ai
const BASE = "https://api.sarvam.ai";
const LANG_CODE: Record<Lang, string> = { en: "en-IN", hi: "hi-IN", ml: "ml-IN" };

export const sarvamReady = () => Boolean(process.env.SARVAM_API_KEY);

/** Audio (webm/ogg/mp4/wav, under 30 s) → text. The language hint makes Malayalam/Hindi much more accurate. */
export async function speechToText(audio: Blob, lang: Lang): Promise<string> {
  const form = new FormData();
  form.append("file", audio, "speech." + (audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : audio.type.includes("wav") ? "wav" : audio.type.includes("mpeg") ? "mp3" : "webm"));
  form.append("model", "saaras:v3");
  form.append("mode", "transcribe"); // same language as spoken (not translated)
  form.append("language_code", LANG_CODE[lang]);
  const res = await fetch(`${BASE}/speech-to-text`, {
    method: "POST",
    headers: { "api-subscription-key": process.env.SARVAM_API_KEY! },
    body: form,
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Speech service answered ${res.status}`);
  const body = (await res.json()) as { transcript?: string };
  return (body.transcript ?? "").trim();
}

// Fixed phrases (greetings, refusals, "Marked as taken") repeat a lot: keep their audio in memory.
const cache = new Map<string, Buffer>();

/** Text → MP3 audio in a warm voice, slightly slower for elders. */
export async function textToSpeech(text: string, lang: Lang): Promise<Buffer> {
  const key = `${lang}:${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const res = await fetch(`${BASE}/text-to-speech`, {
    method: "POST",
    headers: { "api-subscription-key": process.env.SARVAM_API_KEY!, "content-type": "application/json" },
    body: JSON.stringify({ text, language_code: LANG_CODE[lang], model: "bulbul:v3", speaker: "priya", pace: 0.9, output_audio_codec: "mp3", speech_sample_rate: 24000 }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Voice service answered ${res.status}`);
  const body = (await res.json()) as { audios?: string[] };
  const audio = Buffer.from(body.audios?.[0] ?? "", "base64");
  if (!audio.length) throw new Error("Voice service returned no audio");
  if (cache.size > 200) cache.clear();
  cache.set(key, audio);
  return audio;
}
