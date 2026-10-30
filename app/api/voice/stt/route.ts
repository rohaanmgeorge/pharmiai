import { NextResponse } from "next/server";
import { fail, requireUser } from "@/lib/server/auth";
import { sarvamReady, speechToText } from "@/lib/server/sarvam";
import type { Lang } from "@/lib/i18n";

export const maxDuration = 30;
const MAX_BYTES = 3 * 1024 * 1024; // ~30 s of speech is far smaller than this

// POST /api/voice/stt (multipart: audio, lang) → { transcript }. The audio is not stored and not logged.
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (!sarvamReady()) return fail("Voice service not set up", 501);
  const form = await request.formData();
  const audio = form.get("audio");
  const lang = (["en", "ml", "hi"].includes(String(form.get("lang"))) ? form.get("lang") : "en") as Lang;
  if (!(audio instanceof Blob) || audio.size === 0) return fail("No audio received");
  if (audio.size > MAX_BYTES) return fail("Recording is too long. Please keep it under 30 seconds.");
  try {
    return NextResponse.json({ transcript: await speechToText(audio, lang) });
  } catch {
    return fail("Couldn't understand the recording. Please try again.", 502);
  }
}
