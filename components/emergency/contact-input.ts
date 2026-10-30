// Shared by the contacts API (checks input) and the contacts page (form choices).
// Plain checks, no library, so beginners can read every rule.

export const RELATIONS = ["spouse", "guardian", "child", "other"] as const;
export type Relation = (typeof RELATIONS)[number];
export const CONTACT_LANGS = ["en", "ml", "hi"] as const;

export type ContactInput = {
  name: string;
  phone: string;
  email: string | null;
  relation: Relation;
  priority: number;
  lang: (typeof CONTACT_LANGS)[number];
};

export type Contact = ContactInput & { id: string; patient_id: string };

/** Returns clean values, or an error sentence to show the person. `partial` = PATCH. */
export function checkContact(body: Record<string, unknown>, partial = false): { value: Partial<ContactInput> } | { error: string } {
  const value: Partial<ContactInput> = {};

  if (body.name !== undefined || !partial) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 80) return { error: "Please enter a name" };
    value.name = name;
  }
  if (body.phone !== undefined || !partial) {
    // Keep + and digits only, so tel:, sms: and WhatsApp links all work.
    const phone = typeof body.phone === "string" ? body.phone.replace(/[^\d+]/g, "") : "";
    if (!/^\+?\d{7,15}$/.test(phone)) return { error: "Please enter a phone number with country code, e.g. +91…" };
    value.phone = phone;
  }
  if (body.email !== undefined) {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email doesn't look right" };
    value.email = email || null;
  }
  if (body.relation !== undefined || !partial) {
    if (!RELATIONS.includes(body.relation as Relation)) return { error: "Please choose a relation" };
    value.relation = body.relation as Relation;
  }
  if (body.priority !== undefined) {
    const p = Number(body.priority);
    if (!Number.isInteger(p) || p < 1 || p > 99) return { error: "Priority must be a number from 1" };
    value.priority = p;
  }
  if (body.lang !== undefined) {
    if (!CONTACT_LANGS.includes(body.lang as ContactInput["lang"])) return { error: "Please choose a language" };
    value.lang = body.lang as ContactInput["lang"];
  }
  return { value };
}
