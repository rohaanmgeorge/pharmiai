// Builds the SOS message and the one-tap WhatsApp / SMS / Call links for each contact.
// The family taps these to send from their OWN phone — PharmiAI never sends SMS by itself.
// Fixed templates (no AI). Malayalam/Hindi are drafts for Person B to review.

type Lang = "en" | "ml" | "hi";

const TEXT = {
  sos: {
    en: "SOS from {name}. Please help now.",
    ml: "{name}-ൽ നിന്ന് SOS. ദയവായി ഉടൻ സഹായിക്കുക.",
    hi: "{name} से SOS। कृपया तुरंत मदद करें।",
  },
  test: {
    en: "TEST — practice only, no action needed.",
    ml: "ടെസ്റ്റ് — പരിശീലനം മാത്രം, ഒന്നും ചെയ്യേണ്ട.",
    hi: "टेस्ट — सिर्फ़ अभ्यास, कुछ करने की ज़रूरत नहीं।",
  },
  where: { en: "Location: {map}", ml: "സ്ഥലം: {map}", hi: "जगह: {map}" },
  noWhere: { en: "Location not available.", ml: "സ്ഥലം ലഭ്യമല്ല.", hi: "जगह उपलब्ध नहीं।" },
  ack: {
    en: "Tap to say you're going: {ack}",
    ml: "'ഞാൻ പോകുന്നു' എന്ന് അറിയിക്കാൻ: {ack}",
    hi: "'मैं जा रहा हूँ' बताने के लिए: {ack}",
  },
} as const;

const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

export function mapLink(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

export function sosMessage(o: { name: string; lang: string; lat: number | null; lng: number | null; ackUrl: string; isTest: boolean }): string {
  const l: Lang = o.lang === "ml" || o.lang === "hi" ? o.lang : "en";
  const map = mapLink(o.lat, o.lng);
  return [
    o.isTest ? TEXT.test[l] : null,
    fill(TEXT.sos[l], { name: o.name }),
    map ? fill(TEXT.where[l], { map }) : TEXT.noWhere[l],
    fill(TEXT.ack[l], { ack: o.ackUrl }),
  ]
    .filter(Boolean)
    .join("\n");
}

/** WhatsApp needs the full international number without "+". Assume India (+91) for 10-digit numbers. */
function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return !phone.startsWith("+") && digits.length === 10 ? `91${digits}` : digits;
}

export type SosContactView = {
  id: string; // sos_acks row id
  contactId: string;
  name: string;
  relation: string;
  phone: string;
  priority: number;
  ackedAt: string | null;
  ackUrl: string;
  whatsappUrl: string;
  smsUrl: string;
  callUrl: string;
};

export function contactLinks(
  origin: string,
  ack: { id: string; token: string; acked_at: string | null },
  contact: { id: string; name: string; relation: string; phone: string; priority: number; lang: string },
  event: { name: string; lat: number | null; lng: number | null; isTest: boolean },
): SosContactView {
  const ackUrl = `${origin}/ack/${ack.token}`;
  const text = sosMessage({ name: event.name, lang: contact.lang, lat: event.lat, lng: event.lng, ackUrl, isTest: event.isTest });
  const body = encodeURIComponent(text);
  return {
    id: ack.id,
    contactId: contact.id,
    name: contact.name,
    relation: contact.relation,
    phone: contact.phone,
    priority: contact.priority,
    ackedAt: ack.acked_at,
    ackUrl,
    whatsappUrl: `https://wa.me/${waNumber(contact.phone)}?text=${body}`,
    smsUrl: `sms:${contact.phone}?body=${body}`,
    callUrl: `tel:${contact.phone}`,
  };
}
