// Fixed message templates for notifications, in each recipient's language.
// Templates only — the AI never writes these. Malayalam/Hindi are drafts for Person B to review.
import type { Lang } from "@/lib/i18n";

type Vars = Record<string, string | number>;
const T = {
  doseDue: {
    en: "Time for {med} ({time})",
    ml: "{med} കഴിക്കാനുള്ള സമയം ({time})",
    hi: "{med} लेने का समय ({time})",
  },
  doseDueBody: {
    en: "Tap Taken after you take it.",
    ml: "കഴിച്ച ശേഷം 'കഴിച്ചു' അമർത്തുക.",
    hi: "लेने के बाद 'ले ली' दबाएँ।",
  },
  missedTitle: {
    en: "{name} has not confirmed a dose",
    ml: "{name} ഒരു ഡോസ് സ്ഥിരീകരിച്ചിട്ടില്ല",
    hi: "{name} ने एक खुराक की पुष्टि नहीं की",
  },
  missedBody: {
    en: "{med} at {time}. Please check on them.",
    ml: "{time}-ന് {med}. ദയവായി അന്വേഷിക്കുക.",
    hi: "{time} पर {med}। कृपया हाल पूछें।",
  },
  refillTitle: { en: "{med} runs out in {days} days", ml: "{med} {days} ദിവസത്തിൽ തീരും", hi: "{med} {days} दिन में खत्म होगी" },
  refillBody: { en: "Tap to review the reorder.", ml: "വീണ്ടും വാങ്ങാൻ അമർത്തുക.", hi: "दोबारा मँगाने के लिए दबाएँ।" },
  expiryTitle: { en: "{med} expires in {days} days", ml: "{med} {days} ദിവസത്തിൽ കാലാവധി തീരും", hi: "{med} {days} दिन में एक्सपायर होगी" },
  expiredTitle: { en: "{med} has expired", ml: "{med} കാലാവധി കഴിഞ്ഞു", hi: "{med} एक्सपायर हो गई है" },
  expiryBody: { en: "Please don't use an expired strip.", ml: "കാലാവധി കഴിഞ്ഞ മരുന്ന് ഉപയോഗിക്കരുത്.", hi: "एक्सपायर दवा का उपयोग न करें।" },
  okayTitle: { en: "Are you okay?", ml: "സുഖമാണോ?", hi: "क्या आप ठीक हैं?" },
  okayBody: { en: "Tap \"I'm okay\" so your family knows.", ml: "കുടുംബം അറിയാൻ 'സുഖമാണ്' അമർത്തുക.", hi: "परिवार को बताने के लिए 'मैं ठीक हूँ' दबाएँ।" },
  checkTitle: { en: "Please check on {name}", ml: "{name}-നെ അന്വേഷിക്കുക", hi: "कृपया {name} का हाल पूछें" },
  checkBody: {
    en: "{name} missed doses and hasn't answered \"Are you okay?\". This is a check, not an emergency.",
    ml: "{name} ഡോസുകൾ കഴിച്ചില്ല, 'സുഖമാണോ?' എന്നതിന് മറുപടിയില്ല. ഇത് അടിയന്തരാവസ്ഥയല്ല, ഒരു അന്വേഷണം മാത്രം.",
    hi: "{name} ने खुराक नहीं ली और 'क्या आप ठीक हैं?' का जवाब नहीं दिया। यह आपातकाल नहीं, सिर्फ़ जाँच है।",
  },
  sosTitle: { en: "SOS from {name}", ml: "{name}-ൽ നിന്ന് SOS", hi: "{name} से SOS" },
  sosBody: { en: "Tap to see the location and say you're going.", ml: "സ്ഥലം കാണാനും 'ഞാൻ പോകുന്നു' എന്ന് പറയാനും അമർത്തുക.", hi: "जगह देखने और 'मैं जा रहा हूँ' बताने के लिए दबाएँ।" },
} as const;

export type MessageKey = keyof typeof T;

export function msg(key: MessageKey, lang: Lang | string | null | undefined, vars: Vars = {}): string {
  const l = (lang === "ml" || lang === "hi" ? lang : "en") as Lang;
  return T[key][l].replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
