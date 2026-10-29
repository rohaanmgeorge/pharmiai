// UI strings in English, Malayalam and Hindi.
// Malayalam and Hindi are drafts — Person B must review them before the demo (see docs/NEEDS.md).
// Medical facts never live here: they come from the medicine database.

export type Lang = "en" | "ml" | "hi";

export const LANGS: { code: Lang; label: string; speech: string }[] = [
  { code: "en", label: "English", speech: "en-IN" },
  { code: "ml", label: "മലയാളം", speech: "ml-IN" },
  { code: "hi", label: "हिन्दी", speech: "hi-IN" },
];

const strings = {
  chat: { en: "Chat", ml: "ചാറ്റ്", hi: "चैट" },
  today: { en: "Today", ml: "ഇന്ന്", hi: "आज" },
  scan: { en: "Scan", ml: "സ്കാൻ", hi: "स्कैन" },
  family: { en: "Family", ml: "കുടുംബം", hi: "परिवार" },
  more: { en: "More", ml: "കൂടുതൽ", hi: "और" },
  taken: { en: "Taken", ml: "കഴിച്ചു", hi: "ले ली" },
  skip: { en: "Skip", ml: "ഒഴിവാക്കുക", hi: "छोड़ें" },
  snooze: { en: "Snooze", ml: "പിന്നീട്", hi: "बाद में" },
  talk: { en: "Talk", ml: "സംസാരിക്കൂ", hi: "बोलें" },
  getStarted: { en: "Get Started", ml: "തുടങ്ങാം", hi: "शुरू करें" },
  goodMorning: { en: "Good morning", ml: "സുപ്രഭാതം", hi: "सुप्रभात" },
  nextMedicine: { en: "Next medicine", ml: "അടുത്ത മരുന്ന്", hi: "अगली दवा" },
  verified: { en: "Verified", ml: "സ്ഥിരീകരിച്ചു", hi: "सत्यापित" },
  needsCheck: { en: "Needs check", ml: "പരിശോധിക്കണം", hi: "जाँच ज़रूरी" },
  notRecognized: { en: "Not recognized", ml: "തിരിച്ചറിഞ്ഞില്ല", hi: "पहचानी नहीं गई" },
  voiceMode: { en: "Voice Mode", ml: "വോയ്സ് മോഡ്", hi: "वॉइस मोड" },
  listening: { en: "Listening…", ml: "കേൾക്കുന്നു…", hi: "सुन रहा हूँ…" },
  whenNeeded: { en: "When needed", ml: "ആവശ്യമുള്ളപ്പോൾ", hi: "ज़रूरत होने पर" },
  inputPlaceholder: {
    en: "Type or tap mic to talk...",
    ml: "ടൈപ്പ് ചെയ്യൂ, അല്ലെങ്കിൽ മൈക്ക് അമർത്തി സംസാരിക്കൂ...",
    hi: "लिखें या बोलने के लिए माइक दबाएँ...",
  },
  disclaimer: {
    en: "PharmiAI is not a doctor. It never gives dose advice.",
    ml: "ഫാർമി എഐ ഡോക്ടറല്ല. ഡോസ് ഉപദേശം നൽകില്ല.",
    hi: "फार्मी एआई डॉक्टर नहीं है। यह खुराक की सलाह नहीं देता।",
  },
  allDone: { en: "All done for now", ml: "ഇപ്പോഴത്തേത് കഴിഞ്ഞു", hi: "अभी के लिए सब हो गया" },
  callHelp: { en: "Call for help", ml: "സഹായം വിളിക്കൂ", hi: "मदद बुलाएँ" },
  morning: { en: "Morning", ml: "രാവിലെ", hi: "सुबह" },
  afternoon: { en: "Afternoon", ml: "ഉച്ചയ്ക്ക്", hi: "दोपहर" },
  night: { en: "Night", ml: "രാത്രി", hi: "रात" },
  afterFood: { en: "After food", ml: "ഭക്ഷണശേഷം", hi: "खाने के बाद" },
  beforeFood: { en: "Before food", ml: "ഭക്ഷണത്തിന് മുമ്പ്", hi: "खाने से पहले" },
} as const;

export type StringKey = keyof typeof strings;

export function translate(key: StringKey, lang: Lang): string {
  return strings[key][lang] ?? strings[key].en;
}
