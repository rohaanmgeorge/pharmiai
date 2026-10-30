// Server output guard for the voice/chat assistant (PLAN.md §6). Pure: no database, no logging.
// The AI only phrases short replies around tool results. If its text looks like medical advice,
// we throw the text away and say a fixed refusal instead. Better a refusal than a wrong fact.

import type { Lang } from "@/lib/i18n";

/** The one fixed refusal, in each language. */
export const REFUSAL: Record<Lang, string> = {
  en: "I'm not sure. Please ask your doctor or pharmacist.",
  ml: "എനിക്ക് ഉറപ്പില്ല. ദയവായി നിങ്ങളുടെ ഡോക്ടറോടോ ഫാർമസിസ്റ്റിനോടോ ചോദിക്കൂ.",
  hi: "मुझे पक्का नहीं पता। कृपया अपने डॉक्टर या फार्मासिस्ट से पूछें।",
};

export type GuardReason = "dose_amount" | "unknown_medicine" | "instruction" | "diagnosis";

export type GuardResult = { text: string; blocked: false } | { text: string; blocked: true; reason: GuardReason };

// A number (or number word) followed by a dose unit: "500 mg", "2 tablets", "two pills", "5ml", "2 गोली".
const DOSE_AMOUNT =
  /(\d+(\.\d+)?|\b(one|two|three|four|half|double)\b|एक|दो|तीन|आधी|ഒന്ന്|രണ്ട്|മൂന്ന്|പകുതി)\s*(mg|mcg|ml|g\b|gm|tablets?|tabs?|capsules?|caps?|pills?|drops?|units?|गोलियाँ|गोली|टैबलेट|ഗുളിക)/i;

// Telling someone to change what they take. English needs word boundaries ("taken" is fine,
// "take" is not); Hindi and Malayalam use the imperative/advice forms.
const INSTRUCTION = [
  /\b(take|stop|increase|double|reduce|decrease|halve|skip taking)\b/i,
  /(लीजिए|लें\b|ले लो|खाइए|खाएँ|बंद कर|बढ़ा|दोगुन|कम कर)/,
  /(കഴിക്കൂ|കഴിക്കണം|കഴിക്കുക|നിർത്ത|കൂട്ട|ഇരട്ടി|കുറയ്ക്ക)/,
];

// Saying what illness someone has.
// Only illness words, so "You have 2 doses left" is still fine.
const ILLNESS = "(diabetes|sugar|blood pressure|bp|hypertension|infection|fever|cancer|heart|thyroid|cholesterol|disease|condition|allergy|asthma|kidney|liver)";
const DIAGNOSIS = [
  new RegExp(`\\byou (probably |may |might |likely |seem to |do )?(have|are suffering from|suffer from) (\\w+ ){0,3}${ILLNESS}`, "i"),
  new RegExp(`\\b(it is|it's|that is|that's|this is|looks like|sounds like) (\\w+ ){0,2}${ILLNESS}`, "i"),
  /आपको .{0,20}(मधुमेह|डायबिटीज़|डायबिटीज|शुगर|बीपी|रक्तचाप|संक्रमण|बुखार|बीमारी)/,
  /നിങ്ങൾക്ക് .{0,20}(പ്രമേഹ|ഷുഗർ|ബിപി|രക്തസമ്മർദ്ദ|അണുബാധ|പനി|രോഗ)/,
];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

/** Catalog names mentioned in the text (whole-word, case-insensitive). */
export function namesIn(text: string, catalogNames: string[]): string[] {
  const t = ` ${norm(text)} `;
  return catalogNames.filter((name) => {
    const n = norm(name).trim();
    if (n.length < 3) return false;
    const escaped = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(t);
  });
}

// ---- General companion mode (used when the person's question is known) ----
// The assistant may talk about any medicine and give general information, but it must still
// never tell THIS person what to take, never diagnose, and never identify a pill by its look.

// Second-person or imperative instructions: "you should take…", "Stop your…", "Switch to…".
// "Do not stop your medicine without your doctor" is fine (starts with "Do not").
const PERSONAL_INSTRUCTION = [
  /\byou (can|could|should|must|may|need to|have to) (take|stop|start|increase|double|reduce|decrease|halve|switch|skip)\b/i,
  /(^|[.!?]\s*)(take|stop|start|increase|double|reduce|decrease|halve|switch to|skip)\b/i,
  ...INSTRUCTION.slice(1), // Hindi / Malayalam advice forms stay blocked
];
const GENERAL_DIAGNOSIS = [DIAGNOSIS[0], new RegExp(`\\b(looks like|sounds like|seems like) (you have |it'?s |an? )?(\\w+ ){0,2}${ILLNESS}`, "i"), DIAGNOSIS[2], DIAGNOSIS[3]];
// A sentence that hands the decision to the doctor or pharmacist (and has no amount — checked separately).
const DEFERS_TO_DOCTOR = /\b(as|if) (your |the )?(doctor|pharmacist)\b|\b(doctor|pharmacist) (advises|advised|prescribed|says|said|tells you)\b|\bas prescribed\b|\bon the label\b/i;
// Questions about identifying a tablet by how it looks.
const LOOKS_QUESTION = /\b(white|yellow|pink|red|blue|orange|green|round|oval|small|big|marking|marked|shape|colou?r|loose)\b.*\b(tablet|pill|capsule|goli)\b|\b(what|which) (is )?(this|that) (tablet|pill|capsule)\b|गोली कौन|ഏത് ഗുളിക/i;

/**
 * Checks the AI's reply. `toolText` is everything the tools returned this turn (as text).
 * Without `question` (strict mode): a medicine name may appear only if a tool returned it, and no
 * amounts at all. With `question` (companion mode): general information about any medicine is
 * allowed, amounts only if they came from the database, and never personal instructions,
 * diagnoses, or naming a pill the person described by its look.
 */
export function guardReply(input: { text: string; lang: Lang; catalogNames: string[]; toolText: string; question?: string }): GuardResult {
  const { text, lang, catalogNames, toolText, question } = input;
  const refuse = (reason: GuardReason): GuardResult => ({ text: REFUSAL[lang], blocked: true, reason });

  if (question !== undefined) {
    const amounts = [...text.matchAll(new RegExp(DOSE_AMOUNT.source, "gi"))].map((m) => norm(m[0]).replace(/\s+/g, ""));
    const toolCompact = norm(toolText).replace(/\s+/g, "");
    if (amounts.some((a) => !toolCompact.includes(a))) return refuse("dose_amount");
    // Checked per sentence: "Take it only as your doctor advises" defers to the doctor and is fine;
    // "Take it twice a day" or "You should stop it" is an instruction and is blocked.
    const sentences = text.split(/(?<=[.!?।])\s+/);
    if (sentences.some((x) => !DEFERS_TO_DOCTOR.test(x) && PERSONAL_INSTRUCTION.some((r) => r.test(x)))) return refuse("instruction");
    if (GENERAL_DIAGNOSIS.some((r) => r.test(text))) return refuse("diagnosis");
    if (LOOKS_QUESTION.test(question)) {
      const fromTools = new Set(namesIn(toolText, catalogNames).map(norm));
      if (namesIn(text, catalogNames).some((n) => !fromTools.has(norm(n)))) return refuse("unknown_medicine");
    }
    return { text, blocked: false };
  }

  if (DOSE_AMOUNT.test(text)) return refuse("dose_amount");
  if (INSTRUCTION.some((r) => r.test(text))) return refuse("instruction");
  if (DIAGNOSIS.some((r) => r.test(text))) return refuse("diagnosis");

  const fromTools = new Set(namesIn(toolText, catalogNames).map(norm));
  if (namesIn(text, catalogNames).some((n) => !fromTools.has(norm(n)))) return refuse("unknown_medicine");

  return { text, blocked: false };
}
