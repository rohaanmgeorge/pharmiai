import { NextResponse } from "next/server";
import { fallbackReply } from "@/lib/agent/fallback";
import { runAgent, type HistoryTurn } from "@/lib/agent/run";
import { refillTools } from "@/lib/agent/refill-tools";
import { agentTools, markDose, type DoseAction, type ToolContext } from "@/lib/agent/tools";
import type { Lang } from "@/lib/i18n";
import { safetyLog } from "@/lib/safety/log";
import { canView, fail, requireUser } from "@/lib/server/auth";
import { catalogNamesIn } from "@/lib/server/catalog";

// POST /api/agent  { text, lang, patientId?, history?, pending? } → { speech, cards }
// history: the last few turns ({ role: "user" | "model", text }) so the AI keeps context.
// pending: the confirm-back the person is answering ({ doseId, action }). A "yes" to it is
// handled here without the AI, so a dose is only ever marked after a real yes.
// Never log the text: it is health data.

const LANGS: Lang[] = ["en", "ml", "hi"];
const ACTIONS: DoseAction[] = ["taken", "skipped", "snoozed"];
const UUID = /^[0-9a-f-]{36}$/i;

const YES = /^(yes|yeah|yep|ok|okay|sure|haan|ha|han|हाँ|हां|जी|ठीक है|അതെ|ഉവ്വ്|ശരി|ആം)[.! ]*$/i;
const NO = /^(no|nope|nahi|nahin|नहीं|ना|വേണ്ട|ഇല്ല)[.! ]*$/i;

const NOT_DONE: Record<Lang, string> = { en: "Okay, I haven't changed anything.", ml: "ശരി, ഒന്നും മാറ്റിയിട്ടില്ല.", hi: "ठीक है, मैंने कुछ नहीं बदला।" };


export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const body = (await request.json().catch(() => ({}))) as {
    text?: unknown;
    lang?: unknown;
    patientId?: unknown;
    history?: unknown;
    pending?: { doseId?: unknown; action?: unknown } | null;
  };
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 500) : "";
  if (!text) return fail("Please say or type something");
  const lang = LANGS.find((l) => l === body.lang) ?? "en";
  const patientId = typeof body.patientId === "string" && UUID.test(body.patientId) ? body.patientId : user.id;
  if (!(await canView(supabase, patientId))) return fail("Not allowed", 403);

  // Keep only well-formed, short turns (the last 10).
  const history: HistoryTurn[] = (Array.isArray(body.history) ? body.history : [])
    .filter((h): h is HistoryTurn => (h?.role === "user" || h?.role === "model") && typeof h?.text === "string" && h.text.trim() !== "")
    .slice(-10)
    .map((h) => ({ role: h.role, text: h.text.slice(0, 500) }));

  const ctx: ToolContext = { supabase, user, patientId, lang };

  // 1. Answering a confirm-back. (Marking needs canManage — the act_on_dose RPC enforces it.)
  const pendingAction = ACTIONS.find((a) => a === body.pending?.action);
  const pendingDose = typeof body.pending?.doseId === "string" && UUID.test(body.pending.doseId) ? body.pending.doseId : null;
  if (pendingAction && pendingDose) {
    if (YES.test(text)) {
      const r = await markDose({ ...ctx, confirmed: { doseId: pendingDose, action: pendingAction } }, pendingDose, pendingAction, true);
      return NextResponse.json({ speech: (r.data as { say: string }).say, cards: r.cards ?? [] });
    }
    if (NO.test(text)) return NextResponse.json({ speech: NOT_DONE[lang], cards: [] });
  }

  // 2. The AI, if we have a key; otherwise (or if it fails) the keyword fallback.
  if (process.env.GEMINI_API_KEY) {
    try {
      const out = await runAgent({ ctx, tools: [...agentTools, ...refillTools], history, text, catalogNames: (t) => catalogNamesIn(supabase, t) });
      if (out.blocked) {
        // IDs and a reason code only — never the text.
        await safetyLog([{ actor: user.id, patientId, event: "voice_guard_block", payload: { reason: out.blocked, model: out.model } }]).catch(() =>
          console.error("voice_guard_block: safety_log write failed"),
        );
      }
      return NextResponse.json({ speech: out.speech, cards: out.cards });
    } catch {
      console.error("agent: AI unavailable, using keyword fallback");
    }
  }
  const out = await fallbackReply(ctx, text);
  return NextResponse.json(out);
}
