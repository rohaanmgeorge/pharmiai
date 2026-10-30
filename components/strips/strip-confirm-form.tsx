"use client";

import { Link2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { cn, PillButton } from "@/components/ui";
import { api } from "@/lib/api-client";
import { ExpiryPicker } from "./expiry-picker";
import type { MatchingSchedule } from "./strip-result";

type Candidate = { id: string; name: string; strength: string; ingredients: string[] };

/**
 * The person's check of a strip: pick the medicine (look-alikes: no default), fill the expiry
 * only when the readings could not agree, optionally link a reminder for the SAME medicine.
 */
export function StripConfirmForm(props: {
  stripId: string;
  catalogId: string | null; // the entry both readings agreed on (null = they did not agree)
  candidates: Candidate[];
  expiryRead: string | null; // "YYYY-MM" both readings agreed on
  expiryReadLabel: string | null;
  batch: string | null;
  matching: MatchingSchedule[];
  photo: React.ReactNode;
  onDone: () => void;
}) {
  const { stripId, catalogId, candidates, expiryRead, expiryReadLabel, batch, matching, photo, onDone } = props;
  const lookAlikes = candidates.length > 1;
  const [choice, setChoice] = useState<string | null>(lookAlikes ? null : catalogId);
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [quantity, setQuantity] = useState("");
  const [scheduleId, setScheduleId] = useState<string | null>(null); // never linked automatically
  const [addToStock, setAddToStock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const expiry = expiryRead ?? (month && year ? `${year}-${month}` : "");
  const qty = quantity.trim() === "" ? null : Number(quantity);
  // Only reminders for the medicine the person picked (exact catalog id) may be linked.
  const linkable = choice !== null && choice === catalogId ? matching : [];
  const linkId = linkable.some((m) => m.id === scheduleId) ? scheduleId : null;
  const ready = Boolean(catalogId && choice && expiry) && (!addToStock || !linkId || (qty !== null && qty > 0));

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ status: string; reasons: string[] }>(`/api/strips/${stripId}/confirm`, {
        method: "POST",
        json: { catalogId: choice, expiry, batch: batch ?? undefined, quantity: qty, scheduleId: linkId, addToStock: addToStock && linkId !== null },
      });
      if (res.status !== "verified") setError(res.reasons[0] ?? "Not verified yet — see the reasons above.");
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {lookAlikes && (
        <fieldset>
          <legend className="mb-2 text-sm font-bold">Which one is printed on the strip? We never pick for you.</legend>
          <div className="space-y-2">
            {candidates.map((c) => (
              <label key={c.id} className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-sm border-2 p-3", choice === c.id ? "border-green-700 bg-ok-soft/40" : "border-line")}>
                <input type="radio" name={`strip-${stripId}`} checked={choice === c.id} onChange={() => setChoice(c.id)} className="size-5 accent-[#3f7d20]" />
                <span>
                  <span className="font-bold">{c.name}</span>
                  <span className="block text-sm text-ink-2 capitalize">
                    {c.ingredients.join(", ")} {c.strength}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {expiryRead ? (
        <div className="rounded-sm bg-surface-2 p-3">
          <div className="text-xs font-bold text-ink-2">Expiry (both readings agree)</div>
          <div className="text-lg font-bold">{expiryReadLabel}</div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-bold">The expiry date was not clear. Please read it from the strip and choose it below.</p>
          {photo}
          <ExpiryPicker month={month} year={year} onMonth={setMonth} onYear={setYear} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-sm bg-surface-2 p-3">
          <div className="text-xs font-bold text-ink-2">Batch</div>
          <div className="font-bold">{batch ?? "Not read (optional)"}</div>
        </div>
        <label className="rounded-sm bg-surface-2 p-3">
          <span className="block text-xs font-bold text-ink-2">Tablets in this strip</span>
          <input
            type="number"
            min={0}
            max={1000}
            inputMode="numeric"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="e.g. 10"
            className="min-h-8 w-full bg-transparent font-bold outline-none"
          />
        </label>
      </div>

      {linkable.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-bold">Use this photo for your reminder?</legend>
          {linkable.map((m) => (
            <label key={m.id} className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-sm border-2 p-3", scheduleId === m.id ? "border-green-700 bg-ok-soft/40" : "border-line")}>
              <input
                type="checkbox"
                checked={scheduleId === m.id}
                onChange={(e) => setScheduleId(e.target.checked ? m.id : null)}
                className="size-5 accent-[#3f7d20]"
              />
              <Link2 className="size-5 shrink-0 text-ink-2" aria-hidden />
              <span className="font-semibold">Link to my reminder for {m.name}</span>
            </label>
          ))}
          {linkId && (
            <label className="flex min-h-12 cursor-pointer items-center gap-3 px-1">
              <input type="checkbox" checked={addToStock} onChange={(e) => setAddToStock(e.target.checked)} className="size-5 accent-[#3f7d20]" />
              <span className="font-semibold">Add {qty && qty > 0 ? `${qty} tablets` : "these tablets"} to stock</span>
            </label>
          )}
        </fieldset>
      )}

      {error && <p className="text-sm font-semibold text-danger">{error}</p>}

      <PillButton variant="green" size="lg" className="w-full" disabled={!ready || busy} onClick={confirm}>
        <ShieldCheck className="size-5" aria-hidden /> {busy ? "Checking…" : "I checked the strip — confirm"}
      </PillButton>
    </div>
  );
}
