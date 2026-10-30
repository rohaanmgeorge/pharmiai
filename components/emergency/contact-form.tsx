"use client";

import { useState } from "react";
import { cn, PillButton } from "@/components/ui";
import { LANGS } from "@/lib/i18n";
import { type Contact, type ContactInput, RELATIONS } from "./contact-input";

const RELATION_LABEL = { spouse: "Spouse", guardian: "Guardian", child: "Child", other: "Other" } as const;

const field = "min-h-12 w-full rounded-sm border border-line bg-surface px-4 text-base outline-none focus:border-green-700";

/** Add or edit one emergency contact. The server checks everything again. */
export function ContactForm({ initial, onSave, onCancel }: { initial?: Contact; onSave: (v: Partial<ContactInput>) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "+91");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [relation, setRelation] = useState<ContactInput["relation"]>(initial?.relation ?? "child");
  const [lang, setLang] = useState<ContactInput["lang"]>(initial?.lang ?? "en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSave({ name, phone, email: email || null, relation, lang });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-ink-2">Name</span>
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-ink-2">Phone (with country code)</span>
        <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" required />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-bold text-ink-2">Email (optional)</span>
        <input className={field} value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" />
      </label>
      <fieldset>
        <legend className="mb-1 text-sm font-bold text-ink-2">Relation</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {RELATIONS.map((r) => (
            <button
              type="button"
              key={r}
              aria-pressed={relation === r}
              onClick={() => setRelation(r)}
              className={cn("min-h-12 rounded-full border font-bold", relation === r ? "border-lime-500 bg-lime-500 text-ink" : "border-line text-ink-2")}
            >
              {RELATION_LABEL[r]}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-bold text-ink-2">Their language</legend>
        <div className="grid grid-cols-3 gap-2">
          {LANGS.map((l) => (
            <button
              type="button"
              key={l.code}
              aria-pressed={lang === l.code}
              onClick={() => setLang(l.code)}
              className={cn("min-h-12 rounded-full border font-bold", lang === l.code ? "border-lime-500 bg-lime-500 text-ink" : "border-line text-ink-2")}
            >
              {l.label}
            </button>
          ))}
        </div>
      </fieldset>
      {error && <p className="rounded-sm bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
      <div className="flex gap-2">
        <PillButton type="button" className="flex-1" onClick={onCancel} disabled={busy}>
          Cancel
        </PillButton>
        <PillButton type="submit" variant="green" className="flex-1" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </PillButton>
      </div>
    </form>
  );
}
