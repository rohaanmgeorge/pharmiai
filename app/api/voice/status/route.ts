import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { sarvamReady } from "@/lib/server/sarvam";

// GET /api/voice/status — is the Indian-language voice service set up? (Otherwise the phone's own voice is used.)
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ sarvam: sarvamReady() });
}
