import "server-only";
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { AGENT_MODEL, FALLBACK_MODEL } from "@/lib/ai/models";
import type { Lang } from "@/lib/i18n";
import { guardReply, REFUSAL, type GuardReason } from "@/lib/safety/voice-guard";
import type { AgentCard, AgentContext, AgentTool } from "./types";

// The Voice Companion Agent: Gemini picks tools, tools read the database, the server builds
// the reply. The model's own words pass through the output guard before anyone hears them.

const MAX_ROUNDS = 4;

const LANG_NAME: Record<Lang, string> = { en: "English", ml: "Malayalam", hi: "Hindi" };

function systemPrompt(lang: Lang) {
  return `You are PharmiAI, a kind medicine reminder helper for an elderly person in India and their family.
Reply in ${LANG_NAME[lang]} only. Keep replies to one or two short, warm sentences.

Rules — follow exactly:
- Use the tools for everything. The app shows cards built from the database; you only add a short sentence around them.
- Never diagnose. Never recommend, change, double, reduce or stop a dose. Never tell the person to take or stop a medicine.
- Never identify a tablet from its shape, colour or markings. Use the refuse tool.
- Medical facts ONLY by calling get_medicine_card, which shows a card. Never state uses, side effects, doses, amounts or prices in your own words.
- Do not mention any medicine name unless a tool returned it in this conversation turn.
- To mark a dose, call get_today_schedule to find the dose_id, then mark_dose. The app asks the person to confirm; do not claim it is done.
- If someone needs emergency help, call start_sos. "SOS" written on a prescription means "when needed", not an emergency.
- If unsure, or the question is not about their medicines, say exactly: "${REFUSAL[lang]}"
- Each tool result has a "say" sentence. You may use it as your reply.`;
}

export type HistoryTurn = { role: "user" | "model"; text: string };

export type AgentReply = {
  speech: string;
  cards: AgentCard[];
  /** Set when the guard replaced the model's text (logged by the caller, IDs only). */
  blocked?: GuardReason;
  model: string;
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
export async function runAgent(input: {
  ctx: AgentContext;
  tools: AgentTool[];
  history: HistoryTurn[];
  text: string;
  catalogNames: string[];
}): Promise<AgentReply> {
  const { ctx, tools, history, text, catalogNames } = input;
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

  const guard = guardReply({ text: modelText, lang: ctx.lang, catalogNames, toolText: JSON.stringify(out.toolData) + JSON.stringify(out.cards) });
  if (guard.blocked) return { speech: guard.text, cards: out.cards, blocked: guard.reason, model };
  return { speech: guard.text, cards: out.cards, model };
}
