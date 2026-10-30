import { fail, requireUser } from "@/lib/server/auth";
import { sarvamReady, textToSpeech } from "@/lib/server/sarvam";
import type { Lang } from "@/lib/i18n";

export const maxDuration = 30;

// POST /api/voice/tts { text, lang } → MP3 audio. Short texts only (cost guard).
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!("supabase" in auth)) return auth;
  if (!sarvamReady()) return fail("Voice service not set up", 501);
  const body = (await request.json().catch(() => ({}))) as { text?: unknown; lang?: unknown };
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 500) : "";
  const lang = (["en", "ml", "hi"].includes(String(body.lang)) ? body.lang : "en") as Lang;
  if (!text) return fail("Nothing to say");
  try {
    const audio = await textToSpeech(text, lang);
    return new Response(new Uint8Array(audio), { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" } });
  } catch {
    return fail("Voice service is busy. Showing the answer on screen.", 502);
  }
}
