"use client";

import { ChevronLeft, Save } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ErrorCard, LoadingCards } from "@/components/states";
import { Card, cn, PageHeader, PillButton, SectionTitle, Toggle } from "@/components/ui";
import { api } from "@/lib/api-client";
import type { CareSettings } from "@/lib/safety/wellness";
import { patientQuery, useApi } from "@/lib/use-api";

type Data = { settings: CareSettings & { id: string; name: string }; isSelf: boolean; canManage: boolean };

// Form values are kept as text while typing; numbers are checked by the server (same ranges as the DB).
type Form = Record<"refill_days" | "check_missed" | "check_idle_hours" | "check_wait_min" | "expiry_alert_days" | "quiet_start" | "quiet_end", string> & {
  presence: CareSettings["presence"];
  check_consent: boolean;
};

const toForm = (s: CareSettings): Form => ({
  refill_days: String(s.refill_days),
  check_missed: String(s.check_missed),
  check_idle_hours: String(s.check_idle_hours),
  check_wait_min: String(s.check_wait_min),
  expiry_alert_days: s.expiry_alert_days.join(", "),
  quiet_start: s.quiet_start,
  quiet_end: s.quiet_end,
  presence: s.presence,
  check_consent: s.check_consent,
});

function NumberRow({ label, help, value, min, max, unit, disabled, onChange }: { label: string; help: string; value: string; min: number; max: number; unit: string; disabled: boolean; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-4 p-4">
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{label}</span>
        <span className="block text-sm text-ink-2">{help}</span>
      </span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-12 w-20 rounded-sm bg-surface-2 px-3 text-center text-lg font-bold disabled:opacity-60"
        />
        <span className="w-10 text-sm text-ink-2">{unit}</span>
      </span>
    </label>
  );
}

function CareForm({ data }: { data: Data }) {
  const [form, setForm] = useState<Form>(() => toForm(data.settings));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const ro = !data.canManage;
  const name = data.isSelf ? "you" : data.settings.name;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setBusy(true);
    setNote(null);
    try {
      const res = await api<{ settings: CareSettings }>(`/api/profile/care-settings${patientQuery()}`, {
        method: "PATCH",
        json: {
          ...form,
          refill_days: Number(form.refill_days),
          check_missed: Number(form.check_missed),
          check_idle_hours: Number(form.check_idle_hours),
          check_wait_min: Number(form.check_wait_min),
        },
      });
      setForm(toForm(res.settings));
      setNote({ ok: true, text: "Saved." });
    } catch (e) {
      setNote({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {ro && <p className="mt-2 rounded-sm bg-surface-2 px-4 py-3 text-sm font-semibold text-ink-2">You can view these settings. Only {data.settings.name} or a caregiver can change them.</p>}

      <SectionTitle>Where {data.isSelf ? "are you" : `is ${name}`}?</SectionTitle>
      <Card className="grid grid-cols-3 gap-2 p-2">
        {(["home", "away", "hospital"] as const).map((p) => (
          <button
            key={p}
            disabled={ro}
            aria-pressed={form.presence === p}
            onClick={() => set("presence", p)}
            className={cn("min-h-12 rounded-full font-bold capitalize transition-colors", form.presence === p ? "bg-lime-500 text-ink" : "text-ink-2 hover:bg-surface-2")}
          >
            {p}
          </button>
        ))}
      </Card>
      <p className="mt-2 px-1 text-sm text-ink-2">The &ldquo;Are you okay?&rdquo; check only runs at Home.</p>

      <SectionTitle>&ldquo;Are you okay?&rdquo; check</SectionTitle>
      <Card className="divide-y divide-line p-0">
        <div className="flex items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <div className="font-bold">Turn on the check</div>
            <div className="text-sm text-ink-2">
              If {name === "you" ? "you miss" : `${name} misses`} doses and {name === "you" ? "don't" : "doesn't"} open the app for a while, PharmiAI asks &ldquo;Are you okay?&rdquo;. With no answer, family is told,
              then emergency contacts. Never during quiet hours.
            </div>
          </div>
          <Toggle checked={form.check_consent} onChange={(v) => !ro && set("check_consent", v)} label="Are you okay check" />
        </div>
        <NumberRow label="Missed doses in a row" help="Before asking" value={form.check_missed} min={1} max={10} unit="doses" disabled={ro} onChange={(v) => set("check_missed", v)} />
        <NumberRow label="No activity for" help="App not opened, no dose tapped" value={form.check_idle_hours} min={1} max={24} unit="hours" disabled={ro} onChange={(v) => set("check_idle_hours", v)} />
        <NumberRow label="Wait for an answer" help="Before each next step" value={form.check_wait_min} min={1} max={120} unit="min" disabled={ro} onChange={(v) => set("check_wait_min", v)} />
      </Card>

      <SectionTitle>Quiet hours</SectionTitle>
      <Card className="grid grid-cols-2 gap-3 p-4">
        {(["quiet_start", "quiet_end"] as const).map((k) => (
          <label key={k} className="block">
            <span className="mb-1 block text-sm font-bold text-ink-2">{k === "quiet_start" ? "From" : "Until"}</span>
            <input type="time" value={form[k]} disabled={ro} onChange={(e) => set(k, e.target.value)} className="min-h-12 w-full rounded-sm bg-surface-2 px-3 text-lg font-bold disabled:opacity-60" />
          </label>
        ))}
      </Card>

      <SectionTitle>Refills and expiry</SectionTitle>
      <Card className="divide-y divide-line p-0">
        <NumberRow label="Refill reminder" help="When this many days of tablets are left" value={form.refill_days} min={1} max={30} unit="days" disabled={ro} onChange={(v) => set("refill_days", v)} />
        <label className="block p-4">
          <span className="block font-bold">Expiry alerts</span>
          <span className="block text-sm text-ink-2">Days before a strip expires, separated by commas (0 = on the day)</span>
          <input
            value={form.expiry_alert_days}
            disabled={ro}
            onChange={(e) => set("expiry_alert_days", e.target.value)}
            placeholder="30, 7, 0"
            className="mt-2 min-h-12 w-full rounded-sm bg-surface-2 px-3 text-lg font-bold disabled:opacity-60"
          />
        </label>
      </Card>

      {!ro && (
        <div className="sticky bottom-24 mt-6 lg:bottom-6">
          <PillButton variant="green" size="lg" className="w-full" disabled={busy} onClick={save}>
            <Save className="size-5" aria-hidden /> {busy ? "Saving…" : "Save"}
          </PillButton>
        </div>
      )}
      {note && (
        <p role="status" className={cn("mt-3 rounded-sm px-4 py-3 text-sm font-semibold", note.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>
          {note.text}
        </p>
      )}
    </>
  );
}

export default function CareSettingsPage() {
  const [query] = useState(patientQuery);
  const { data, error, loading, reload } = useApi<Data>(`/api/profile/care-settings${query}`);
  return (
    <div className="mx-auto max-w-2xl pb-10">
      <Link href="/settings" className="mb-1 inline-flex min-h-12 items-center gap-1 font-bold text-ink-2">
        <ChevronLeft className="size-5" aria-hidden /> Settings
      </Link>
      <PageHeader title="Care settings" subtitle={data && !data.isSelf ? `For ${data.settings.name}` : "Reminders, checks and quiet hours"} />
      {loading && <LoadingCards count={3} />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      {data && <CareForm key={data.settings.id} data={data} />}
    </div>
  );
}
