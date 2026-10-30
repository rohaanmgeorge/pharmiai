"use client";

import { CalendarClock, Check, FileText, PiggyBank, ShieldCheck, Siren, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { CountUp, DoseCard, type DoseView } from "@/components/cards";
import { Card, cn, PillButton } from "@/components/ui";
import { api, newOpId } from "@/lib/api-client";
import type { DoseState } from "@/lib/mock";

// Renders the cards the assistant API returns. Every word in these cards comes from the
// database (built on the server from rows), never from the AI's text.

export type AgentCard = { kind: string; [key: string]: unknown };
export type ConfirmCard = { kind: "confirm"; text: string; doseId: string; action: "taken" | "skipped" | "snoozed" };

type MedicineCard = { name: string; strength: string; form: string; uses: string | null; sideEffects: string | null; source: string; inEnglish: boolean };
type SavingsRow = { name: string; brandMrp: number; brandPack: number; genericName: string; genericMrp: number; genericPack: number; yearly: number };
type ExpiryItem = { id: string; name: string; month: string; daysLeft: number; badge: "ok" | "soon" | "expired" };
type LockerItem = { id: string; date: string; doctor: string | null; medicines: string[] };

/** Dose cards with working Taken / Skip / Snooze buttons. */
function Doses({ initial, compact }: { initial: DoseView[]; compact?: boolean }) {
  const [doses, setDoses] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(id: string, action: DoseState) {
    setBusy(id);
    setError(null);
    try {
      const res = await api<{ state: DoseState }>(`/api/doses/${id}/act`, { method: "POST", json: { action, opId: newOpId() } });
      setDoses((d) => d.map((x) => (x.id === id ? { ...x, state: res.state } : x)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-2">
      {doses.map((d) => (
        <DoseCard key={d.id} dose={d} compact={compact} busy={busy === d.id} onAct={(s) => act(d.id, s)} />
      ))}
      {error && <p className="text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}

function Medicine({ card }: { card: MedicineCard }) {
  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-ok" aria-hidden />
        <span className="text-lg font-bold">{card.name}</span>
        <span className="text-sm text-ink-2">
          {card.strength} · {card.form}
        </span>
      </div>
      {card.uses && (
        <div>
          <div className="text-sm font-bold text-ink-2">Used for</div>
          <p>{card.uses}</p>
        </div>
      )}
      {card.sideEffects && (
        <div>
          <div className="text-sm font-bold text-ink-2">Common side effects</div>
          <p>{card.sideEffects}</p>
        </div>
      )}
      <p className="border-t border-line pt-2 text-xs text-ink-2">
        Source: {card.source}
        {card.inEnglish && " · Shown in English (translation not reviewed yet)"} · Not medical advice.
      </p>
    </Card>
  );
}

function Savings({ rows, total }: { rows: SavingsRow[]; total: number }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="bg-gradient-to-br from-lime-300 to-lime-500/70 p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-ink">
          <PiggyBank className="size-4" aria-hidden /> Yearly savings with Jan Aushadhi generics
        </div>
        <div className="mt-1 text-[2rem] leading-none font-extrabold text-ink">
          <CountUp value={total} prefix="₹" />
        </div>
        <div className="mt-1 text-xs text-ink/70">Same ingredient and strength · verified medicines only</div>
      </div>
      <ul className="divide-y divide-line px-4">
        {rows.map((r) => (
          <li key={r.name} className="py-3 text-sm">
            <div className="font-semibold">{r.name}</div>
            <div className="flex flex-wrap justify-between gap-x-3 text-ink-2">
              <span>
                ₹{r.brandMrp} / {r.brandPack} → {r.genericName} ₹{r.genericMrp} / {r.genericPack}
              </span>
              <span className="font-bold text-green-700">₹{r.yearly.toLocaleString("en-IN")} a year</span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const BADGE = {
  ok: { text: "OK", cls: "bg-ok-soft text-ok" },
  soon: { text: "Expiring soon", cls: "bg-warn-soft text-warn" },
  expired: { text: "Expired", cls: "bg-danger-soft text-danger" },
};

function Expiry({ items }: { items: ExpiryItem[] }) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-ink-2">
        <CalendarClock className="size-4" aria-hidden /> Expiry dates (confirmed)
      </div>
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
            <span className="min-w-0">
              <span className="block font-semibold">{i.name}</span>
              <span className="text-sm text-ink-2">Expires {i.month}</span>
            </span>
            <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-bold", BADGE[i.badge].cls)}>{BADGE[i.badge].text}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Locker({ items }: { items: LockerItem[] }) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-bold text-ink-2">
        <FileText className="size-4" aria-hidden /> Prescriptions
      </div>
      <ul className="divide-y divide-line">
        {items.map((p) => (
          <li key={p.id} className="py-2.5">
            <div className="font-semibold">
              {p.date}
              {p.doctor && ` · ${p.doctor}`}
            </div>
            {p.medicines.length > 0 && <div className="text-sm text-ink-2">{p.medicines.join(", ")}</div>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Yes / No for a confirm-back. Only the latest message's buttons are active. */
function Confirm({ card, active, onAnswer, big }: { card: ConfirmCard; active: boolean; onAnswer: (answer: "yes" | "no", card: ConfirmCard) => void; big?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <PillButton size={big ? "lg" : "md"} disabled={!active} onClick={() => onAnswer("no", card)}>
        <X className="size-5" aria-hidden /> No
      </PillButton>
      <PillButton size={big ? "lg" : "md"} variant="green" disabled={!active} onClick={() => onAnswer("yes", card)}>
        <Check className="size-5" aria-hidden /> Yes
      </PillButton>
    </div>
  );
}

function SosButton() {
  return (
    <Link href="/sos" className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-danger px-6 text-lg font-extrabold text-white">
      <Siren className="size-5" aria-hidden /> Open SOS
      <span className="text-sm font-semibold opacity-90">(5 s countdown, you can cancel)</span>
    </Link>
  );
}

export function AgentCards({
  cards,
  confirmActive = false,
  onConfirm,
  compactDoses = false,
  big = false,
}: {
  cards: AgentCard[];
  confirmActive?: boolean;
  onConfirm?: (answer: "yes" | "no", card: ConfirmCard) => void;
  compactDoses?: boolean;
  big?: boolean;
}) {
  return (
    <>
      {cards.map((c, i) => {
        const key = `${c.kind}-${i}`;
        switch (c.kind) {
          case "doses":
            return <Doses key={key} initial={c.doses as DoseView[]} compact={compactDoses} />;
          case "medicine":
            return <Medicine key={key} card={c as unknown as MedicineCard} />;
          case "savings":
            return <Savings key={key} rows={c.rows as SavingsRow[]} total={Number(c.total)} />;
          case "expiry":
            return <Expiry key={key} items={c.items as ExpiryItem[]} />;
          case "locker":
            return <Locker key={key} items={c.items as LockerItem[]} />;
          case "confirm":
            return <Confirm key={key} card={c as ConfirmCard} active={confirmActive} onAnswer={(a, card) => onConfirm?.(a, card)} big={big} />;
          case "sos":
            return <SosButton key={key} />;
          case "medicine_info":
            return <MedicineInfo key={key} card={c as unknown as MedicineInfoCard} />;
          case "medicine_choices":
            return <MedicineChoices key={key} card={c as unknown as ChoicesCard} />;
          case "alternatives":
            return <Alternatives key={key} card={c as unknown as AlternativesCard} />;
          case "refill_draft":
            return <RefillDraft key={key} id={String(c.suggestionId)} text={String(c.text ?? "")} />;
          default:
            return null;
        }
      })}
    </>
  );
}

type MedicineInfoCard = { name: string; composition: string; manufacturer: string | null; uses: string | null; sideEffects: string | null; price: string | null; source: string };
type ChoicesCard = { asked: string; choices: { name: string; composition: string }[] };
type AlternativesCard = {
  base: { name: string; composition: string; price: string | null };
  brands: { name: string; manufacturer: string | null; price: string | null }[];
  generics: { name: string; price: string | null }[];
  source: string;
};

/** Any medicine from the database (not necessarily on the prescription). */
function MedicineInfo({ card }: { card: MedicineInfoCard }) {
  return (
    <Card className="space-y-3 p-4">
      <div>
        <div className="text-lg font-bold">{card.name}</div>
        <div className="text-sm text-ink-2 capitalize">{card.composition}</div>
        {card.manufacturer && <div className="text-xs text-ink-2">{card.manufacturer}</div>}
      </div>
      {card.uses && (
        <div>
          <div className="text-sm font-bold text-ink-2">Used for</div>
          <p className="line-clamp-6">{card.uses}</p>
        </div>
      )}
      {card.sideEffects && (
        <div>
          <div className="text-sm font-bold text-ink-2">Common side effects</div>
          <p className="line-clamp-4">{card.sideEffects}</p>
        </div>
      )}
      {card.price && <div className="text-sm font-semibold">Price: {card.price}</div>}
      <p className="border-t border-line pt-2 text-xs text-ink-2">Source: {card.source} · Not medical advice. Ask your doctor before starting any medicine.</p>
    </Card>
  );
}

/** Several names look alike: we list them and never pick one. */
function MedicineChoices({ card }: { card: ChoicesCard }) {
  return (
    <Card className="p-4">
      <div className="mb-2 text-sm font-bold text-ink-2">Which one did you mean? These names look alike:</div>
      <ul className="space-y-1">
        {card.choices.map((c) => (
          <li key={c.name} className="rounded-sm bg-surface-2 px-3 py-2">
            <span className="font-bold">{c.name}</span> <span className="text-sm text-ink-2 capitalize">· {c.composition}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Same active ingredients and strength, cheapest first. Switching is the doctor's decision. */
function Alternatives({ card }: { card: AlternativesCard }) {
  return (
    <Card className="space-y-3 p-4">
      <div>
        <div className="text-sm font-bold text-ink-2">Same medicine, other makers</div>
        <div className="font-bold">
          {card.base.name} {card.base.price && <span className="text-sm font-normal text-ink-2">· {card.base.price}</span>}
        </div>
        <div className="text-sm text-ink-2 capitalize">{card.base.composition}</div>
      </div>
      {card.generics.length > 0 && (
        <div>
          <div className="text-sm font-bold text-green-700">Jan Aushadhi generic</div>
          {card.generics.map((g) => (
            <div key={g.name} className="flex flex-wrap justify-between gap-x-3 text-sm">
              <span className="min-w-0">{g.name}</span>
              <span className="font-bold text-green-700">{g.price}</span>
            </div>
          ))}
        </div>
      )}
      {card.brands.length > 0 ? (
        <div>
          <div className="text-sm font-bold text-ink-2">Other brands</div>
          {card.brands.map((b) => (
            <div key={b.name} className="flex flex-wrap justify-between gap-x-3 text-sm">
              <span className="min-w-0">
                {b.name}
                {b.manufacturer && <span className="text-ink-2"> · {b.manufacturer}</span>}
              </span>
              <span className="font-semibold">{b.price ?? "—"}</span>
            </div>
          ))}
        </div>
      ) : (
        card.generics.length === 0 && <p className="text-sm text-ink-2">No other brand with exactly the same ingredients and strength in our list.</p>
      )}
      <p className="border-t border-line pt-2 text-xs text-ink-2">
        Source: {card.source} · Ask your doctor or pharmacist before switching to any of these.
      </p>
    </Card>
  );
}

/** Small label under answers that come from general AI knowledge, not from our database. */
export function GeneralInfoNote() {
  return <p className="mt-1 text-xs font-semibold text-ink-2">General information from AI — not personal medical advice. Check with your doctor or pharmacist.</p>;
}

/** The refill agent's draft: the person reviews, edits and sends it themselves on the refill screen. */
function RefillDraft({ id, text }: { id: string; text: string }) {
  return (
    <Card className="p-4">
      <div className="mb-2 text-sm font-bold text-ink-2">Draft reorder message</div>
      <p className="whitespace-pre-line">{text}</p>
      <Link href={`/refills/${id}`} className="mt-3 block">
        <PillButton variant="green" size="sm" className="w-full">
          Review and send
        </PillButton>
      </Link>
    </Card>
  );
}

/** The confirm-back still waiting for an answer, if the latest assistant reply has one. */
export function pendingFrom(cards: AgentCard[] | undefined): { doseId: string; action: string } | null {
  const c = cards?.find((x) => x.kind === "confirm") as ConfirmCard | undefined;
  return c ? { doseId: c.doseId, action: c.action } : null;
}
