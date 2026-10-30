import "server-only";
import { GoogleGenAI, type Content, type Part, type ThinkingLevel } from "@google/genai";
import { AGENT_MODEL, FALLBACK_MODEL, FAST_THINKING } from "@/lib/ai/models";
import type { Lang } from "@/lib/i18n";
import { guardReply, REFUSAL, type GuardReason } from "@/lib/safety/voice-guard";
import type { AgentCard, AgentContext, AgentTool } from "./types";

// The Voice Companion Agent: Gemini picks tools, tools read the database, the server builds
// the reply. The model's own words pass through the output guard before anyone hears them.

const MAX_ROUNDS = 4;

const LANG_NAME: Record<Lang, string> = { en: "English", ml: "Malayalam", hi: "Hindi" };

function systemPrompt(lang: Lang) {
  return `You are PharmiAI, a kind, knowledgeable medicine and health companion for an elderly person in India and their family.
Reply in ${LANG_NAME[lang]} only. Keep replies short (two to four simple sentences), warm, and easy for an elder to understand.

What you help with:
- Their own medicines and reminders: use get_today_schedule, mark_dose, get_medicine_card, get_expiry_list, search_locker, get_savings_summary.
- ANY other medicine, even if it is not on their prescription: call lookup_medicine first. For "alternative", "similar", "cheaper" or "generic" questions call find_alternatives. Cards show the facts from our database; add one short helpful sentence.
- General health and medicine questions (what a medicine type does, common side effects, storage, food and alcohol, why finishing a course matters, what a test means): answer from well-established medical knowledge in plain words. Start with "In general," and keep it general, not about this person.

Safety rules — never break these:
- Never tell this person to take, stop, start, switch, increase, reduce or double a medicine, and never give them a dose or number of tablets. Say the doctor or pharmacist decides.
- Never diagnose ("you have…"). Describe what symptoms can mean in general only, and say to see a doctor.
- Never identify a loose tablet from its shape, colour or markings: call refuse.
- Only state strengths or prices that a tool returned.
- Danger signs (chest pain, trouble breathing, fainting, stroke signs, severe allergy, overdose): tell them to call 108 now and call start_sos.
- To mark a dose, call get_today_schedule for the dose_id, then mark_dose. The app asks them to confirm; never claim it is done.
- "SOS" written on a prescription means "when needed", not an emergency.
- When a question needs a personal medical decision, say: "${REFUSAL[lang]}"
- Each tool result may have a "say" sentence you can use as your reply.`;
}

export type HistoryTurn = { role: "user" | "model"; text: string };

export type AgentReply = {
  speech: string;
  cards: AgentCard[];
  /** Set when the guard replaced the model's text (logged by the caller, IDs only). */
  blocked?: GuardReason;
  model: string;
  /** The words are general AI knowledge (no database card behind them): show a label. */
  general?: boolean;
};

let client: GoogleGenAI | null = null;
const ai = () => (client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! }));

async function loop(model: string, ctx: AgentContext, tools: AgentTool[], history: HistoryTurn[], text: string) {
  const contents: Content[] = [...history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })), { role: "user", parts: [{ text }] }];
  const cards: AgentCard[] = [];
  const toolData: unknown[] = [];
  const called: string[] = [];

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const res = await ai().models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: systemPrompt(ctx.lang),
        temperature: 0.2,
        thinkingConfig: { thinkingLevel: FAST_THINKING as ThinkingLevel }, // quick spoken replies
        abortSignal: AbortSignal.timeout(15_000),
        tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }],
      },
    });
    const calls = res.functionCalls ?? [];
    if (calls.length === 0) return { text: res.text ?? "", cards, toolData, called };

    // Keep the model's turn exactly as sent (it may carry thought signatures the API needs back).
    const modelTurn = res.candidates?.[0]?.content;
    if (modelTurn) contents.push(modelTurn);

    const responses: Part[] = [];
    for (const call of calls) {
      const tool = tools.find((t) => t.name === call.name);
      let data: unknown;
      if (!tool) data = { error: "unknown tool" };
      else {
        try {
          const result = await tool.run(ctx, call.args ?? {});
          data = result.data;
          cards.push(...(result.cards ?? []));
          called.push(tool.name);
        } catch {
          data = { error: "tool failed" };
        }
      }
      toolData.push(data);
      responses.push({ functionResponse: { id: call.id, name: call.name, response: { result: data } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return { text: "", cards, toolData, called };
}

/** Runs the tool loop, with one retry on the fallback model. Throws if both fail (caller falls back). */
// Danger signs are handled in code, not left to the AI: the SOS button always appears.
const DANGER =
  /chest pain|can'?t breathe|cannot breathe|breathless|short(ness)? of breath|faint|unconscious|collapsed|stroke|face drooping|slurred|seizure|fits|severe allergy|swelling (of )?(face|throat|lips)|overdose|took too many|bleeding heavily|सीने में दर्द|सांस नहीं|साँस नहीं|बेहोश|लकवा|दौरा|നെഞ്ചുവേദന|നെഞ്ച് വേദന|ശ്വാസം കിട്ടുന്നില്ല|ബോധം|തളർന്നു|അപസ്മാര/i;
const DANGER_SAY: Record<Lang, string> = {
  en: "This could be an emergency. Please call 108 now, or tap SOS to alert your family.",
  ml: "ഇത് അടിയന്തരാവസ്ഥയാകാം. ഉടൻ 108-ൽ വിളിക്കൂ, അല്ലെങ്കിൽ കുടുംബത്തെ അറിയിക്കാൻ SOS അമർത്തൂ.",
  hi: "यह आपातकाल हो सकता है। कृपया अभी 108 पर कॉल करें, या परिवार को बताने के लिए SOS दबाएँ।",
};

export async function runAgent(input: {
  ctx: AgentContext;
  tools: AgentTool[];
  history: HistoryTurn[];
  text: string;
  /** Catalog names that may appear in a text (looked up in the database, for the guard). */
  catalogNames: (text: string) => Promise<string[]>;
}): Promise<AgentReply> {
  const { ctx, tools, history, text, catalogNames } = input;
  if (DANGER.test(text)) return { speech: DANGER_SAY[ctx.lang], cards: [{ kind: "sos" }], model: "rule" };
  let model = AGENT_MODEL;
  let out;
  try {
    out = await loop(model, ctx, tools, history, text);
  } catch {
    model = FALLBACK_MODEL; // overloaded or failed: one retry, then give up
    out = await loop(model, ctx, tools, history, text);
  }

  // Fixed sentences win over the model's words for the moments that matter.
  const confirm = out.cards.find((c) => c.kind === "confirm");
  if (confirm) return { speech: String(confirm.text), cards: out.cards, model };
  if (out.called.includes("refuse")) return { speech: REFUSAL[ctx.lang], cards: out.cards, model };

  const lastSay = [...out.toolData].reverse().find((d): d is { say: string } => typeof (d as { say?: unknown })?.say === "string");
  const modelText = out.text.trim();
  if (!modelText) return { speech: lastSay?.say ?? REFUSAL[ctx.lang], cards: out.cards, model };

  const toolText = JSON.stringify(out.toolData) + JSON.stringify(out.cards);
  // If the lookup fails we can't check names, so we refuse rather than risk an unchecked name.
  const names = await catalogNames(`${modelText} ${toolText}`).catch(() => null);
  if (names === null) return { speech: REFUSAL[ctx.lang], cards: out.cards, blocked: "unknown_medicine", model };
  // Companion mode: the person's question is passed so general information is allowed,
  // while personal instructions, diagnoses and pill identification stay blocked.
  const guard = guardReply({ text: modelText, lang: ctx.lang, catalogNames: names, toolText, question: text });
  if (guard.blocked) return { speech: guard.text, cards: out.cards, blocked: guard.reason, model };
  // No card behind the answer = general AI knowledge; the screen labels it as such.
  const grounded = out.cards.some((c) => ["medicine", "medicine_info", "alternatives", "doses", "savings", "expiry", "locker"].includes(c.kind));
  return { speech: guard.text, cards: out.cards, model, general: !grounded };
}
