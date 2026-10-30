"use client";

import { Store } from "lucide-react";
import { useState } from "react";
import { Card, PillButton } from "@/components/ui";
import { api } from "@/lib/api-client";
import type { Pharmacy } from "./types";

const field = "mt-1 min-h-12 w-full rounded-sm border border-line bg-surface px-3 text-base outline-none focus:border-green-700";

/** Where reorder messages go. Saved on the patient's profile (patient or caregiver can change it). */
export function PharmacyForm({ patientId, initial, onSaved }: { patientId: string; initial: Pharmacy; onSaved: (p: Pharmacy) => void }) {
  const [name, setName] = useState(initial.name ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await api<Pharmacy>(`/api/profile/pharmacy?patient=${encodeURIComponent(patientId)}`, { method: "PATCH", json: { name, phone, email } });
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <form onSubmit={save} className="space-y-3">
        <div className="flex items-center gap-2 font-bold">
          <Store className="size-5 text-green-700" aria-hidden /> Your pharmacy
        </div>
        <label className="block text-sm font-bold text-ink-2">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} className={field} autoComplete="organization" />
        </label>
        <label className="block text-sm font-bold text-ink-2">
          Phone (WhatsApp / SMS)
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={field} type="tel" inputMode="tel" placeholder="98470 12345" />
        </label>
        <label className="block text-sm font-bold text-ink-2">
          Email (optional)
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={field} type="email" inputMode="email" />
        </label>
        {error && <p className="rounded-sm bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">{error}</p>}
        <PillButton type="submit" variant="green" className="w-full" disabled={busy || (!phone.trim() && !email.trim())}>
          {busy ? "Saving…" : "Save pharmacy"}
        </PillButton>
      </form>
    </Card>
  );
}
