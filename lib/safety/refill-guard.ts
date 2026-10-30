// Refill message guard — pure code, no AI.
// The AI may only write the polite wording of a reorder message. This guard rejects any draft
// that names another medicine, adds a number we didn't give it, or sounds like dose advice.
// A rejected (or missing) draft is replaced by a fixed template, so a message always exists.

import type { Lang } from "@/lib/i18n";
import { normalizeName } from "./match";

export type RefillInput = {
  medicine: string; // catalog name, e.g. "Glyconil 500"
  strength: string; // catalog strength, e.g. "500 mg"
  quantity: number; // computed in code (refillQuantity)
  pharmacy: string; // may be empty
  patient: string; // may be empty
};

/** How many tablets to order: 30 days' worth by default. Plain arithmetic. */
export function refillQuantity(dosesPerDay: number, days = 30): number {
  return Math.max(1, Math.round(dosesPerDay * days));
}

// Words that would turn a shopping message into dose advice. Matched in lower case.
const ADVICE_EN = /\b(take|takes|taking|took|twice|thrice|daily|dose|doses|dosage|increase|increased|decrease|reduce|stop|stopped|per day|a day|every day|morning|night|bedtime|before food|after food)\b|mg per|tablets? per/;
const ADVICE_ML = ["കഴിക്ക", "ദിവസവും", "ദിവസേന", "രണ്ടുനേരം", "രണ്ട് നേരം", "മൂന്നുനേരം", "നിർത്ത", "കൂട്ടണം", "കുറയ്ക്ക", "ഡോസ്"];
const ADVICE_HI = ["लें", "लेना", "लीजिए", "खाएं", "खाना है", "रोज़", "रोज", "प्रतिदिन", "दिन में", "दो बार", "तीन बार", "बंद कर", "बढ़ा", "घटा", "खुराक", "डोज़"];

/** Devanagari and Malayalam digits → 0-9, so "६०" can't slip past the number check. */
function asciiDigits(text: string): string {
  return text
    .replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(/[൦-൯]/g, (d) => String(d.charCodeAt(0) - 0x0d66));
}

const numbersIn = (text: string) => asciiDigits(text).match(/\d+(?:\.\d+)?/g) ?? [];

/** Whole-word search on normalized text (letters and digits only). */
function containsName(text: string, name: string): boolean {
  const n = normalizeName(name);
  if (!n) return false;
  return ` ${normalizeName(text)} `.includes(` ${n} `);
}

/**
 * Checks an AI draft. `catalogNames` = every medicine name in our catalog.
 * Returns the reasons it was rejected (empty list = safe to show).
 */
export function checkRefillDraft(text: string, input: RefillInput, catalogNames: string[]): string[] {
  const reasons: string[] = [];
  const lower = text.toLowerCase();
  if (!text.trim()) return ["empty"];
  if (text.length > 600) reasons.push("too_long");
  if (/https?:|www\./.test(lower)) reasons.push("link");

  // 1. It must name our medicine, and no other catalog medicine.
  if (!containsName(text, input.medicine)) reasons.push("medicine_missing");
  const ownBrand = normalizeName(input.medicine).split(" ")[0];
  for (const other of catalogNames) {
    if (normalizeName(other) === normalizeName(input.medicine)) continue;
    const brand = normalizeName(other).split(" ")[0];
    // "Glyconil 850" must not appear in a "Glyconil 500" message; a different brand word is caught too.
    if (containsName(text, other) || (brand.length >= 4 && brand !== ownBrand && containsName(text, brand))) {
      reasons.push("other_medicine");
      break;
    }
  }

  // 2. Only numbers we supplied: the quantity, and digits in the strength/name/pharmacy/patient.
  const allowed = new Set([String(input.quantity), ...numbersIn(`${input.strength} ${input.medicine} ${input.pharmacy} ${input.patient}`)]);
  if (numbersIn(text).some((n) => !allowed.has(n))) reasons.push("unknown_number");

  // 3. No dose advice, in any of our languages.
  if (ADVICE_EN.test(lower) || ADVICE_ML.some((w) => text.includes(w)) || ADVICE_HI.some((w) => text.includes(w))) {
    reasons.push("dose_advice");
  }
  return reasons;
}

/** Fixed, reviewed wording. Always available, even with no AI key. */
export function refillTemplate(lang: Lang, input: RefillInput): string {
  const { medicine, strength, quantity } = input;
  const pharmacy = input.pharmacy.trim();
  const patient = input.patient.trim();
  if (lang === "ml") {
    return `നമസ്കാരം${pharmacy ? ` ${pharmacy}` : ""}, ${patient ? `${patient} എന്നയാൾക്ക് ` : ""}ഈ മരുന്ന് വീണ്ടും വേണം: ${medicine} (${strength}), എണ്ണം ${quantity}. ദയവായി തയ്യാറാക്കി വെക്കാമോ? നന്ദി.`;
  }
  if (lang === "hi") {
    return `नमस्ते${pharmacy ? ` ${pharmacy}` : ""}, ${patient ? `${patient} के लिए ` : ""}यह दवा फिर से चाहिए: ${medicine} (${strength}), संख्या ${quantity}. कृपया तैयार रखिए। धन्यवाद।`;
  }
  return `Hello${pharmacy ? ` ${pharmacy}` : ""}, I would like to reorder ${medicine} (${strength}), quantity ${quantity}${patient ? `, for ${patient}` : ""}. Please let me know when it is ready. Thank you.`;
}

/** The AI draft if it passes every check, otherwise the template. */
export function safeRefillText(
  draft: string | null,
  lang: Lang,
  input: RefillInput,
  catalogNames: string[],
): { text: string; source: "ai" | "template"; reasons: string[] } {
  if (draft) {
    const reasons = checkRefillDraft(draft, input, catalogNames);
    if (reasons.length === 0) return { text: draft.trim(), source: "ai", reasons };
    return { text: refillTemplate(lang, input), source: "template", reasons };
  }
  return { text: refillTemplate(lang, input), source: "template", reasons: ["no_draft"] };
}

/** Link the user opens themselves. We never send anything automatically. */
export function shareUrl(channel: "whatsapp" | "sms" | "email", text: string, to: { phone?: string | null; email?: string | null }): string | null {
  const body = encodeURIComponent(text);
  if (channel === "email") {
    const email = to.email?.trim();
    return email ? `mailto:${email}?subject=${encodeURIComponent("Medicine refill")}&body=${body}` : null;
  }
  let digits = (to.phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (channel === "sms") return `sms:${to.phone!.trim().startsWith("+") ? "+" : ""}${digits}?body=${body}`;
  // wa.me needs the country code; a plain 10-digit Indian number gets 91 in front.
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) digits = `91${digits.slice(1)}`;
  return `https://wa.me/${digits}?text=${body}`;
}
