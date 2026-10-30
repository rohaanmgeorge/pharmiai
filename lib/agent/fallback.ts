import "server-only";
import { REFUSAL } from "@/lib/safety/voice-guard";
import { agentTools, markDose, todayDoses, type ToolContext } from "./tools";
import type { AgentCard, AgentTool } from "./types";

// Used when there is no Gemini key or the AI fails: simple keyword intents mapped to the
// same tools, so the demo still works. Replies are the tools' fixed "say" sentences.

const has = (text: string, words: string[]) => words.some((w) => text.includes(w));

const WORDS = {
  taken: ["taken", "took", "mark", "had my", "കഴിച്ചു", "ले ली", "ले लिया", "खा ली"],
  sos: ["sos", "help", "emergency", "സഹായം", "അടിയന്തര", "मदद", "बचाओ", "आपात"],
  expiry: ["expir", "കാലാവധി", "എക്സ്പയറി", "एक्सपायरी", "समाप्ति"],
  savings: ["sav", "generic", "cheap", "price", "cost", "ലാഭ", "ജനറിക്", "बचत", "जेनेरिक", "सस्ती"],
  locker: ["prescription", "doctor", "കുറിപ്പടി", "ഡോക്ടർ", "पर्चा", "पर्चे", "डॉक्टर"],
  next: ["next", "അടുത്ത", "अगली", "अगला"],
  today: ["today", "schedule", "medicine", "tablet", "dose", "ഇന്ന്", "മരുന്ന്", "आज", "दवा"],
};

const SLOT_WORDS: Record<string, string[]> = {
  morning: ["morning", "രാവിലെ", "सुबह"],
  afternoon: ["afternoon", "lunch", "ഉച്ച", "दोपहर"],
  night: ["night", "evening", "dinner", "രാത്രി", "रात", "शाम"],
};

const tool = (name: string) => agentTools.find((t) => t.name === name) as AgentTool;

const reply = (data: unknown, cards: AgentCard[] = []) => ({ speech: (data as { say?: string }).say ?? "", cards });

export async function fallbackReply(ctx: ToolContext, rawText: string): Promise<{ speech: string; cards: AgentCard[] }> {
  const text = rawText.toLowerCase();

  // Dose advice / diagnosis / "what is this tablet" are refused before anything else.
  if (has(text, ["two", "double", "extra", "more than", "diagnos", "do i have", "what is this", "white", "round", "can i take"]))
    return { speech: REFUSAL[ctx.lang], cards: [] };

  if (has(text, WORDS.sos)) {
    const r = await tool("start_sos").run(ctx, {});
    return reply(r.data, r.cards);
  }

  if (has(text, WORDS.taken)) {
    // Pick the open dose for the time of day they said, else the earliest open one. Then confirm back.
    const doses = (await todayDoses(ctx)).filter((d) => d.state === "pending" || d.state === "snoozed");
    const slot = Object.keys(SLOT_WORDS).find((s) => has(text, SLOT_WORDS[s]));
    const dose = doses.find((d) => !slot || d.slot === slot);
    if (!dose) {
      const r = await tool("get_today_schedule").run(ctx, {});
      return reply(r.data, r.cards);
    }
    const r = await markDose(ctx, dose.id, "taken", false);
    return reply(r.data, r.cards);
  }

  if (has(text, WORDS.expiry)) {
    const r = await tool("get_expiry_list").run(ctx, {});
    return reply(r.data, r.cards);
  }
  if (has(text, WORDS.savings)) {
    const r = await tool("get_savings_summary").run(ctx, {});
    return reply(r.data, r.cards);
  }
  if (has(text, WORDS.locker)) {
    const r = await tool("search_locker").run(ctx, {});
    return reply(r.data, r.cards);
  }
  if (has(text, WORDS.next)) {
    const r = await tool("get_today_schedule").run(ctx, { only_next: true });
    return reply(r.data, r.cards);
  }
  if (has(text, WORDS.today)) {
    const r = await tool("get_today_schedule").run(ctx, {});
    return reply(r.data, r.cards);
  }
  return { speech: REFUSAL[ctx.lang], cards: [] };
}
