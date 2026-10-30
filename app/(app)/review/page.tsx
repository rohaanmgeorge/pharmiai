"use client";

import { motion } from "motion/react";
import { BellRing, CircleHelp, Eye, Layers, ScanLine, ShieldCheck, Stethoscope } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePrefs } from "@/components/providers";
import { EmptyCard, ErrorCard, LoadingCards } from "@/components/states";
import { AiHeadline, cn, ExpandableCard, PillButton, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api-client";
import { useClientValue } from "@/lib/client";
import type { Status } from "@/lib/mock";
import { expandShorthand } from "@/lib/safety/shorthand";
import { useApi } from "@/lib/use-api";

type Candidate = { id: string; name: string; strength: string; ingredients: string[] };
type Item = {
  id: string;
  text_a: string | null;
  text_b: string | null;
  catalog_id: string | null;
  candidates: Candidate[];
  strength: string | null;
  dose_code: string | null;
  duration_days: number | null;
  food: "before" | "after" | null;
  status: Status;
  reasons: string[];
  verified_by?: "person" | "ai";
  ai_notes?: string[];
};
type Fill = { doseCode?: string; durationDays?: string };
type ReviewData = {
  prescription: { id: string; patient_id: string; state: string; doctor_name: string | null; doctor_read: string | null; photoUrl: string | null };
  items: Item[];
  duplicates: { ingredient: string; names: string[] }[];
  canManage: boolean;
};

function doseLabel(code: string | null) {
  const s = expandShorthand(code);
  if (!s) return code;
  return s.asNeeded ? "When needed (not an emergency)" : `${code} · ${s.meaning}`;
}

function ReadValue({ label, value, onType, placeholder, inputMode }: { label: string; value: string | null; onType?: (v: string) => void; placeholder: string; inputMode?: "numeric" | "text" }) {
  return (
    <div className={cn("rounded-sm p-3", value ? "bg-surface-2" : "border-2 border-dashed border-warn bg-warn-soft/50")}>
      <div className="text-xs font-bold text-ink-2">{label}</div>
      {value ? (
        <div className="font-bold">{value}</div>
      ) : (
        // Zero-Guess: never auto-filled. The person types it from the paper.
        <input
          aria-label={label}
          inputMode={inputMode}
          onChange={(e) => onType?.(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent font-bold text-warn outline-none placeholder:text-warn/80"
        />
      )}
    </div>
  );
}

// Timing choices for a line where no timing was written (fixed shorthand table only).
const DOSE_CHOICES = ["1-0-0", "0-0-1", "1-0-1", "1-1-1", "OD", "BD", "TDS", "HS"];

/** A line the app could not read as a medicine (e.g. a smudge or signature). */
function UnreadableLine({ item }: { item: Item }) {
  return (
    <div className="rounded-card bg-white/70 p-4 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-bold text-ink-2">{item.text_a ?? item.text_b ?? "Unreadable line"}</span>
        <span className="shrink-0 rounded-full bg-surface-2 px-3 py-1 text-xs font-bold text-ink-2">Unreadable line – not added</span>
      </div>
      {(item.ai_notes ?? item.reasons).map((n) => (
        <p key={n} className="mt-2 text-sm text-ink-2">
          {n}
        </p>
      ))}
    </div>
  );
}

/** Verified automatically by the scan: shows what was read, notes, and asks only for missing timing/days. */
function AutoItem({ item, fill, onFill }: { item: Item; fill: Fill; onFill: (f: Fill) => void }) {
  const { t } = usePrefs();
  const name = item.candidates.find((c) => c.id === item.catalog_id)?.name ?? item.text_a ?? item.text_b ?? "";
  const notes = item.ai_notes ?? [];
  return (
    <ExpandableCard
      defaultOpen={notes.length > 0 || !item.dose_code}
      header={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold">{name}</div>
            <div className="truncate text-sm text-ink-2">
              {item.dose_code ? `${doseLabel(item.dose_code)} · ` : ""}
              {item.duration_days ? `${item.duration_days} days` : "no end date"}
            </div>
          </div>
          <span className="flex shrink-0 items-center gap-1">
            <StatusBadge status="verified" layoutId={`badge-${item.id}`} />
            {item.verified_by === "ai" && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.65rem] font-bold text-ink-2">AI</span>}
          </span>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-sm bg-surface-2 p-3">
            <div className="flex items-center gap-1 text-xs font-bold text-ink-2">
              <Eye className="size-3.5" aria-hidden /> Reading 1
            </div>
            <div className="font-semibold">{item.text_a ?? "—"}</div>
          </div>
          <div className="rounded-sm bg-surface-2 p-3">
            <div className="flex items-center gap-1 text-xs font-bold text-ink-2">
              <Layers className="size-3.5" aria-hidden /> Reading 2
            </div>
            <div className="font-semibold">{item.text_b ?? "—"}</div>
          </div>
        </div>
        {notes.length > 0 && (
          <ul className="space-y-1 rounded-sm bg-lime-300/30 p-3 text-sm">
            {notes.map((n) => (
              <li key={n} className="flex items-start gap-2">
                <CircleHelp className="mt-0.5 size-4 shrink-0 text-green-700" aria-hidden /> {n}
              </li>
            ))}
          </ul>
        )}
        {!item.dose_code && (
          <label className="block">
            <span className="mb-1 block text-sm font-bold">When to take it (as the doctor said)</span>
            <select
              value={fill.doseCode ?? ""}
              onChange={(e) => onFill({ ...fill, doseCode: e.target.value || undefined })}
              className="min-h-12 w-full rounded-sm border border-line bg-white px-3 font-semibold"
            >
              <option value="">No reminder</option>
              {DOSE_CHOICES.map((c) => (
                <option key={c} value={c}>
                  {doseLabel(c)}
                </option>
              ))}
            </select>
          </label>
        )}
        {!item.duration_days && (
          <label className="block">
            <span className="mb-1 block text-sm font-bold">Number of days (leave empty for 90)</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              value={fill.durationDays ?? ""}
              onChange={(e) => onFill({ ...fill, durationDays: e.target.value })}
              className="min-h-12 w-full rounded-sm border border-line bg-white px-3 font-semibold"
            />
          </label>
        )}
        <div className="rounded-sm bg-surface-2 p-3 text-sm">
          <span className="text-xs font-bold text-ink-2">Food: </span>
          <span className="font-bold">{item.food ? t(item.food === "after" ? "afterFood" : "beforeFood") : "Not written"}</span>
        </div>
      </div>
    </ExpandableCard>
  );
}

function ItemCard({ item, canManage, onChange }: { item: Item; canManage: boolean; onChange: (i: Item) => void }) {
  const { t } = usePrefs();
  const lookAlikes = item.candidates.length > 1;
  // Both readings must agree on one catalog medicine; otherwise a person can't make it Verified.
  const agreed = item.catalog_id !== null;
  const [choice, setChoice] = useState<string | null>(lookAlikes ? null : item.catalog_id);
  const [typedDose, setTypedDose] = useState("");
  const [typedDays, setTypedDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dose = item.dose_code ?? typedDose.trim();
  const days = item.duration_days ?? Number(typedDays);
  const chosen = item.candidates.find((c) => c.id === (choice ?? item.catalog_id));
  const title = item.status === "not_recognized" ? "Unclear medicine" : (chosen?.name ?? item.text_a ?? item.text_b ?? "Unclear medicine");
  const ready = agreed && Boolean(choice) && Boolean(dose) && Number.isInteger(days) && days > 0;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ status: Status; reasons: string[] }>(`/api/items/${item.id}/confirm`, {
        method: "POST",
        json: { catalogId: choice, doseCode: dose, durationDays: days },
      });
      onChange({ ...item, status: res.status, reasons: res.reasons, catalog_id: choice, dose_code: dose, duration_days: days, candidates: item.candidates });
      if (res.status !== "verified") setError("Not verified yet — see the reasons above.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ExpandableCard
      defaultOpen={item.status !== "verified"}
      header={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold">{title}</div>
            <div className="truncate text-sm text-ink-2">
              {item.dose_code ? `${doseLabel(item.dose_code)} · ` : ""}
              {item.duration_days ? `${item.duration_days} days` : "duration missing"}
            </div>
          </div>
          <StatusBadge status={item.status} layoutId={`badge-${item.id}`} />
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-sm bg-surface-2 p-3">
            <div className="flex items-center gap-1 text-xs font-bold text-ink-2">
              <Eye className="size-3.5" aria-hidden /> Reading 1
            </div>
            <div className="font-semibold">{item.text_a ?? "[unreadable]"}</div>
          </div>
          <div className="rounded-sm bg-surface-2 p-3">
            <div className="flex items-center gap-1 text-xs font-bold text-ink-2">
              <Layers className="size-3.5" aria-hidden /> Reading 2
            </div>
            <div className={cn("font-semibold", item.text_a !== item.text_b && "text-warn")}>{item.text_b ?? "[unreadable]"}</div>
          </div>
        </div>

        {item.status !== "verified" && item.reasons.length > 0 && (
          <ul className="space-y-1 text-sm text-ink-2">
            {item.reasons.map((r) => (
              <li key={r} className="flex items-start gap-2">
                <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden /> {r}
              </li>
            ))}
          </ul>
        )}

        {item.status === "not_recognized" && (
          <p className="rounded-sm bg-surface-2 p-3 text-sm">
            We could not recognise this medicine, so we won&apos;t remind you about it or explain it. Please show the prescription to your pharmacist.
          </p>
        )}

        {item.status === "needs_check" && !agreed && (
          <p className="rounded-sm bg-surface-2 p-3 text-sm">
            The two readings did not agree on one medicine, so this line can&apos;t be verified. Try a clearer, flatter photo — or ask your pharmacist.
          </p>
        )}

        {item.status === "needs_check" && agreed && lookAlikes && (
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Which one is on the prescription? We never pick for you.</legend>
            <div className="space-y-2">
              {item.candidates.map((c) => (
                <label
                  key={c.id}
                  className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-sm border-2 p-3", choice === c.id ? "border-green-700 bg-ok-soft/40" : "border-line")}
                >
                  <input type="radio" name={item.id} checked={choice === c.id} onChange={() => setChoice(c.id)} className="size-5 accent-[#3f7d20]" />
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

        {item.status !== "not_recognized" && (
          <div className="grid grid-cols-3 gap-2 text-sm">
            <ReadValue label="Dose" value={doseLabel(item.dose_code)} onType={setTypedDose} placeholder="e.g. 1-0-1" />
            <ReadValue label="Days" value={item.duration_days ? `${item.duration_days} days` : null} onType={setTypedDays} placeholder="Type days" inputMode="numeric" />
            <div className="rounded-sm bg-surface-2 p-3">
              <div className="text-xs font-bold text-ink-2">Food</div>
              <div className="font-bold">{item.food ? t(item.food === "after" ? "afterFood" : "beforeFood") : "Not written"}</div>
            </div>
          </div>
        )}

        {error && <p className="text-sm font-semibold text-danger">{error}</p>}

        {item.status === "needs_check" && agreed && canManage && (
          <PillButton variant="green" className="w-full" disabled={!ready || busy} onClick={confirm}>
            <ShieldCheck className="size-5" aria-hidden /> {busy ? "Checking…" : "I checked the prescription — confirm"}
          </PillButton>
        )}
      </div>
    </ExpandableCard>
  );
}

function DoctorField({ data }: { data: ReviewData }) {
  const [name, setName] = useState(data.prescription.doctor_name ?? data.prescription.doctor_read ?? "");
  const [saved, setSaved] = useState(Boolean(data.prescription.doctor_name));
  if (!data.canManage) return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-card bg-white p-3 shadow-card">
      <Stethoscope className="size-5 shrink-0 text-ink-2" aria-hidden />
      <input
        aria-label="Doctor's name"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setSaved(false);
        }}
        placeholder="Doctor's name (optional)"
        className="min-w-0 flex-1 bg-transparent font-semibold outline-none"
      />
      <PillButton
        size="sm"
        variant={saved ? "outline" : "lime"}
        disabled={saved}
        onClick={async () => {
          await api(`/api/prescriptions/${data.prescription.id}/doctor`, { method: "POST", json: { name } }).catch(() => {});
          setSaved(true);
        }}
      >
        {saved ? "Saved" : "Confirm"}
      </PillButton>
    </div>
  );
}

export default function ReviewPage() {
  const router = useRouter();
  const id = useClientValue(() => new URLSearchParams(window.location.search).get("id"), null);
  const { data, error, loading, reload, setData } = useApi<ReviewData>(id ? `/api/prescriptions/${id}` : null);
  const [stock, setStock] = useState<Record<string, string>>({});
  const [fill, setFill] = useState<Record<string, Fill>>({});
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  if (!id) {
    return (
      <div className="mx-auto max-w-xl pt-10">
        <EmptyCard
          title="Nothing to review yet"
          body="Scan a prescription. We read it twice and you confirm each medicine."
          action={
            <Link href="/scan">
              <PillButton variant="green">
                <ScanLine className="size-5" aria-hidden /> Scan a prescription
              </PillButton>
            </Link>
          }
        />
      </div>
    );
  }
  if (loading) return <div className="mx-auto max-w-xl pt-10"><LoadingCards /></div>;
  if (error || !data) return <div className="mx-auto max-w-xl pt-10"><ErrorCard message={error ?? "Could not load"} onRetry={reload} /></div>;

  const items = data.items;
  const count = (s: Status) => items.filter((i) => i.status === s).length;
  const verifiedItems = items.filter((i) => i.status === "verified");

  async function approve() {
    setApproving(true);
    setApproveError(null);
    try {
      const body = Object.fromEntries(verifiedItems.map((i) => [i.id, Number(stock[i.id] ?? defaultStock(i, fill[i.id]))]));
      await api(`/api/prescriptions/${data!.prescription.id}/approve`, { method: "POST", json: { stock: body, fill } });
      router.push("/today");
    } catch (e) {
      setApproveError((e as Error).message);
      setApproving(false);
    }
  }

  const photo = data.prescription.photoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={data.prescription.photoUrl} alt="Your prescription photo" className="w-full rounded-card bg-white object-contain shadow-card" />
  ) : null;

  return (
    <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
      <div className="hidden lg:sticky lg:top-6 lg:block lg:self-start lg:pt-8">
        {photo}
        <p className="mt-4 text-center text-sm text-ink-2">Your photo is private. Only you and your caregivers can see it.</p>
      </div>

      <div className="pt-6">
        <AiHeadline sub="Please check each medicine. Reminders are only set for verified ones.">
          {items.length ? "Here's what I found in your prescription." : "I couldn't find any medicine lines."}
        </AiHeadline>

        <div className="my-6 flex flex-wrap justify-center gap-2">
          <span className="rounded-full bg-ok-soft px-3 py-1.5 text-sm font-bold text-ok">{count("verified")} verified</span>
          {count("needs_check") > 0 && <span className="rounded-full bg-warn-soft px-3 py-1.5 text-sm font-bold text-warn">{count("needs_check")} need check</span>}
          {count("not_recognized") > 0 && <span className="rounded-full bg-surface-2 px-3 py-1.5 text-sm font-bold text-ink-2">{count("not_recognized")} unreadable</span>}
        </div>

        {photo && (
          <div className="mb-4 lg:hidden">
            <details className="rounded-card bg-white p-4 shadow-card">
              <summary className="min-h-8 cursor-pointer font-bold">View prescription photo</summary>
              <div className="mt-4">{photo}</div>
            </details>
          </div>
        )}

        <DoctorField data={data} />

        {data.duplicates.map((d) => (
          <p key={d.ingredient} className="mb-3 rounded-sm bg-warn-soft p-3 text-sm font-semibold text-warn">
            Same active ingredient (<span className="capitalize">{d.ingredient}</span>) in {d.names.join(" and ")}. Please ask your doctor before taking both.
          </p>
        ))}

        <motion.div layout className="space-y-3">
          {items.map((item) =>
            item.status === "not_recognized" ? (
              <UnreadableLine key={item.id} item={item} />
            ) : item.status === "verified" && item.verified_by === "ai" ? (
              <AutoItem key={item.id} item={item} fill={fill[item.id] ?? {}} onFill={(f) => setFill((x) => ({ ...x, [item.id]: f }))} />
            ) : (
            <ItemCard
              key={item.id}
              item={item}
              canManage={data.canManage}
              onChange={(next) => setData((d) => d && { ...d, items: d.items.map((i) => (i.id === next.id ? next : i)) })}
            />
            ),
          )}
        </motion.div>

        {verifiedItems.length > 0 && data.prescription.state !== "approved" && data.canManage && (
          <div className="mt-6 rounded-card bg-white p-4 shadow-card">
            <div className="mb-2 font-bold">Tablets you have now</div>
            <p className="mb-3 text-sm text-ink-2">Used for the refill reminder. Change it if you bought fewer or more.</p>
            <div className="space-y-2">
              {verifiedItems.map((i) => (
                <label key={i.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-semibold">{i.candidates.find((c) => c.id === i.catalog_id)?.name ?? i.text_a}</span>
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    inputMode="numeric"
                    value={stock[i.id] ?? String(defaultStock(i, fill[i.id]))}
                    onChange={(e) => setStock((s) => ({ ...s, [i.id]: e.target.value }))}
                    className="w-24 rounded-sm bg-surface-2 px-3 py-2 text-right font-bold"
                  />
                </label>
              ))}
            </div>
          </div>
        )}

        {approveError && <p className="mt-3 text-sm font-semibold text-danger">{approveError}</p>}

        <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] mt-6 mr-[4.75rem] lg:bottom-6 lg:mr-0">
          {data.prescription.state === "approved" ? (
            <PillButton variant="green" size="lg" className="w-full shadow-float" onClick={() => router.push("/today")}>
              <BellRing className="size-5 shrink-0" aria-hidden /> Reminders are set — open Today
            </PillButton>
          ) : (
            <PillButton variant="green" size="lg" className="w-full shadow-float" disabled={!verifiedItems.length || approving || !data.canManage} onClick={approve}>
              <BellRing className="size-5 shrink-0" aria-hidden /> {approving ? "Setting reminders…" : `Remind me (${verifiedItems.length} verified)`}
            </PillButton>
          )}
        </div>
        <p className="mt-3 text-center text-xs text-ink-2">Every reading and confirmation is saved in a safety log.</p>
      </div>
    </div>
  );
}

/** Suggested count = tablets for the whole course. Shown for the person to correct, never used silently. */
function defaultStock(i: Item, f?: Fill) {
  const perDay = expandShorthand(i.dose_code ?? f?.doseCode)?.timesPerDay ?? 0;
  return perDay * (i.duration_days ?? (Number(f?.durationDays) || 0));
}
