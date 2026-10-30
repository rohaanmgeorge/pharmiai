import { fail, requireUser } from "@/lib/server/auth";
import { voiceReady, textToSpeech } from "@/lib/server/gemini-voice";
import type { Lang } from "@/lib/i18n";
import { describeAiError } from "@/lib/ai/errors";

export const maxDuration = 30;

// POST /api/voice/tts { text, lang } → WAV audio (Gemini voice). Short texts only (quota guard).
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (!("supabase" in auth)) return auth;
  if (!voiceReady()) return fail("Voice service not set up", 501);
  const body = (await request.json().catch(() => ({}))) as { text?: unknown; lang?: unknown };
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 500) : "";
  const lang = (["en", "ml", "hi"].includes(String(body.lang)) ? body.lang : "en") as Lang;
  if (!text) return fail("Nothing to say");
  try {
    const audio = await textToSpeech(text, lang);
    return new Response(new Uint8Array(audio), { headers: { "content-type": "audio/wav", "cache-control": "private, max-age=3600" } });
  } catch (e) {
    const problem = describeAiError(e);
    return Response.json({ error: `${problem.message} Showing the answer on screen.`, kind: problem.kind }, { status: problem.status });
  }
}
