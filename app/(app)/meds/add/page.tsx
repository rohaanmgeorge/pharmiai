"use client";

import { BellRing, Check, Search, Sparkles, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { usePrefs } from "@/components/providers";
import { Card, cn, PageHeader, PillButton, SectionTitle } from "@/components/ui";
import { api } from "@/lib/api-client";
import { expandShorthand } from "@/lib/safety/shorthand";
import { reminderTimes } from "@/lib/safety/slots";

// Add a medicine without a prescription photo (e.g. the doctor said it aloud).
// Zero-Guess: the person picks the exact medicine from our database, the dose from a fixed list,
// and types the days — every field comes from a person, never from AI.

type Result = { id: string; name: string; ingredients: string[]; strength: string; form: string; manufacturer: string | null; reviewed: boolean };

const DOSES: { code: string; label: string }[] = [
  { code: "1-0-0", label: "Morning" },
  { code: "0-1-0", label: "Afternoon" },
  { code: "0-0-1", label: "Night" },
  { code: "1-0-1", label: "Morning + night" },
  { code: "1-1-0", label: "Morning + afternoon" },
  { code: "0-1-1", label: "Afternoon + night" },
  { code: "1-1-1", label: "3 times a day" },
  { code: "OD", label: "Once a day" },
  { code: "BD", label: "Twice a day" },
  { code: "TDS", label: "Three times a day" },
  { code: "QID", label: "Four times a day" },
  { code: "HS", label: "At bedtime" },
];

const field = "min-h-12 w-full rounded-input bg-white px-4 text-base shadow-card outline-none";

function MedicineSearch({ onPick }: { onPick: (r: Result) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [searching, setSearching] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);

  // Not in the saved list yet: ask Gemini to identify it (then it is saved for everyone).
  async function lookUpWithAi() {
    setAiBusy(true);
    setAiNote(null);
    try {
      const res = await api<{ results: Result[]; message?: string }>("/api/catalog/identify", { method: "POST", json: { name: q.trim() } });
      setResults(res.results);
      if (res.message) setAiNote(res.message);
    } catch (e) {
      setAiNote((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }

  // Wait until typing pauses, then search (keeps it fast on slow phones).
  useEffect(() => {
    if (q.trim().length < 2) return;
    const id = setTimeout(async () => {
      setSearching(true);
      const res = await api<{ results: Result[] }>(`/api/catalog/search?q=${encodeURIComponent(q.trim())}`).catch(() => ({ results: [] }));
      setResults(res.results);
      setSearching(false);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const shown = q.trim().length >= 2 ? results : [];
  return (
    <div>
      <label className="flex min-h-14 items-center gap-3 rounded-input bg-white px-4 shadow-card">
        <Search className="size-5 shrink-0 text-ink-2" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type the medicine name, e.g. Dolo 650"
          aria-label="Medicine name"
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-ink-2"
        />
      </label>
      <div className="mt-3 space-y-2" aria-live="polite">
        {searching && <p className="px-1 text-sm text-ink-2">Searching…</p>}
        {!searching && q.trim().length >= 2 && (
          <Card className="p-4 text-sm">
            <p className="font-bold">{shown.length ? "Not the right one?" : "Not in our saved list yet."}</p>
            <p className="text-ink-2">Gemini AI can identify it from the name. Check the result against the strip before choosing it.</p>
            <PillButton size="sm" variant="green" className="mt-3" disabled={aiBusy} onClick={lookUpWithAi}>
              <Sparkles className="size-4" aria-hidden /> {aiBusy ? "Looking up…" : `Look up “${q.trim()}” with AI`}
            </PillButton>
            {aiNote && <p className="mt-2 font-semibold text-warn">{aiNote}</p>}
          </Card>
        )}
        {shown.map((r) => (
          <button key={r.id} onClick={() => onPick(r)} className="block w-full rounded-card bg-white p-4 text-left shadow-card active:scale-[0.99]">
            <div className="font-bold">{r.name}</div>
            <div className="text-sm text-ink-2 capitalize">
              {r.ingredients.join(" + ")} · {r.strength}
            </div>
            {r.manufacturer && <div className="text-xs text-ink-2">{r.manufacturer}</div>}
            {!r.reviewed && <div className="mt-1 text-xs font-semibold text-warn">Identified by AI · not pharmacist-reviewed</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AddMedicinePage() {
  const router = useRouter();
  const { t } = usePrefs();
  const [med, setMed] = useState<Result | null>(null);
  const [dose, setDose] = useState<string | null>(null);
  const [days, setDays] = useState("");
  const [food, setFood] = useState<"before" | "after" | null>(null);
  const [stock, setStock] = useState<string | null>(null);
  const [doctor, setDoctor] = useState("");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<{ ingredient: string; names: string[] }[] | null>(null);

  const perDay = expandShorthand(dose)?.timesPerDay ?? 0;
  const dayCount = Number(days);
  const validDays = Number.isInteger(dayCount) && dayCount >= 1 && dayCount <= 365;
  const suggestedStock = perDay && validDays ? String(perDay * dayCount) : "";
  const times = dose ? reminderTimes(dose) : null;
  const ready = Boolean(med && dose && validDays && checked);

  async function save(acceptDuplicate = false) {
    if (!med || !dose) return;
    setBusy(true);
    setError(null);
    const patientId = new URLSearchParams(window.location.search).get("patient") ?? undefined;
    const res = await fetch("/api/manual-medicines", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ patientId, catalogId: med.id, doseCode: dose, durationDays: dayCount, food, stock: stock ?? suggestedStock, doctorName: doctor, acceptDuplicate }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 409 && body.error === "duplicate") return setDuplicates(body.duplicates);
    if (!res.ok) return setError(body.error ?? "Could not save. Please try again.");
    router.push(patientId ? `/today?patient=${patientId}` : "/today");
  }

  return (
    <div className="mx-auto max-w-2xl pb-6">
      <PageHeader title="Add a medicine" subtitle="When there's no prescription to scan" />

      <SectionTitle>1. Which medicine?</SectionTitle>
      {med ? (
        <Card className="flex items-start gap-3 p-4">
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold">{med.name}</div>
            <div className="text-sm text-ink-2 capitalize">
              {med.ingredients.join(" + ")} · {med.strength}
            </div>
            {med.manufacturer && <div className="text-xs text-ink-2">{med.manufacturer}</div>}
          </div>
          <button onClick={() => setMed(null)} aria-label="Choose a different medicine" className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-2">
            <X className="size-5" aria-hidden />
          </button>
        </Card>
      ) : (
        <MedicineSearch onPick={setMed} />
      )}

      {med && (
        <>
          <SectionTitle>2. How often? (as the doctor said)</SectionTitle>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {DOSES.map((d) => (
              <button
                key={d.code}
                onClick={() => setDose(d.code)}
                aria-pressed={dose === d.code}
                className={cn("min-h-14 rounded-sm border-2 px-3 py-2 text-left", dose === d.code ? "border-green-700 bg-ok-soft/40" : "border-line bg-white")}
              >
                <div className="font-bold">{d.label}</div>
                <div className="text-xs text-ink-2">{d.code}</div>
              </button>
            ))}
          </div>
          {times && <p className="mt-2 px-1 text-sm text-ink-2">Reminders at {times.join(", ")}. You can see them on Today.</p>}

          <SectionTitle>3. For how many days?</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {[5, 7, 10, 15, 30].map((n) => (
              <PillButton key={n} size="sm" variant={days === String(n) ? "lime" : "outline"} onClick={() => setDays(String(n))}>
                {n} days
              </PillButton>
            ))}
          </div>
          <input type="number" inputMode="numeric" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} placeholder="Or type the number of days" aria-label="Number of days" className={cn(field, "mt-2")} />

          <SectionTitle>4. Food</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            {([["before", t("beforeFood")], ["after", t("afterFood")], [null, "Not said"]] as const).map(([v, label]) => (
              <PillButton key={label} size="sm" variant={food === v ? "lime" : "outline"} onClick={() => setFood(v)}>
                {label}
              </PillButton>
            ))}
          </div>

          <SectionTitle>5. Tablets you have now</SectionTitle>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={1000}
            value={stock ?? suggestedStock}
            onChange={(e) => setStock(e.target.value)}
            aria-label="Tablets you have now"
            className={field}
          />
          <p className="mt-1 px-1 text-sm text-ink-2">Used for the refill reminder. Change it if you bought fewer or more.</p>

          <SectionTitle>Doctor (optional)</SectionTitle>
          <input value={doctor} onChange={(e) => setDoctor(e.target.value)} placeholder="Doctor's name" aria-label="Doctor's name" className={field} />

          <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-card bg-white p-4 shadow-card">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-1 size-6 shrink-0 accent-[#3f7d20]" />
            <span>
              <span className="font-bold">I checked this with the doctor&apos;s instructions.</span>
              <span className="block text-sm text-ink-2">PharmiAI only reminds you; it never decides doses.</span>
            </span>
          </label>

          {duplicates && (
            <div role="alert" className="mt-4 rounded-card bg-warn-soft p-4 text-warn">
              <div className="flex items-center gap-2 font-bold">
                <TriangleAlert className="size-5" aria-hidden /> Same active ingredient
              </div>
              {duplicates.map((d) => (
                <p key={d.ingredient} className="mt-1 text-sm">
                  <span className="capitalize">{d.ingredient}</span> is also in {d.names.join(", ")}. Taking both can mean a double dose — please ask your doctor first.
                </p>
              ))}
              <div className="mt-3 flex flex-wrap gap-2">
                <PillButton size="sm" onClick={() => setDuplicates(null)}>
                  Cancel
                </PillButton>
                <PillButton size="sm" variant="green" disabled={busy} onClick={() => save(true)}>
                  The doctor said to take both
                </PillButton>
              </div>
            </div>
          )}

          {error && <p className="mt-4 rounded-sm bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{error}</p>}

          <PillButton variant="green" size="lg" className="mt-6 w-full" disabled={!ready || busy || Boolean(duplicates)} onClick={() => save()}>
            {busy ? <Check className="size-5" aria-hidden /> : <BellRing className="size-5" aria-hidden />} {busy ? "Saving…" : "Add and set reminders"}
          </PillButton>
        </>
      )}
    </div>
  );
}
