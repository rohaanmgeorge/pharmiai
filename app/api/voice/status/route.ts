import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { voiceReady } from "@/lib/server/gemini-voice";

// GET /api/voice/status — is Gemini voice set up? (Otherwise the phone's own voice is used.)
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ server: voiceReady() });
}
