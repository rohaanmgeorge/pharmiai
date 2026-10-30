"use client";

import { motion } from "motion/react";
import { BellRing, Moon, Package, PlayCircle, ScanLine, Sun, Sunrise } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCard, DoseCard, type DoseView } from "@/components/cards";
import { usePrefs } from "@/components/providers";
import { EmptyCard, ErrorCard, LoadingCards } from "@/components/states";
import { PageHeader, PillButton, SectionTitle } from "@/components/ui";
import { api, enablePush, newOpId, pushState, type PushState } from "@/lib/api-client";
import type { DoseState, Slot } from "@/lib/mock";
import { patientQuery, useApi } from "@/lib/use-api";

const SLOT_ICON = { morning: Sunrise, afternoon: Sun, night: Moon } as const;

type TodayData = {
  date: string;
  patientId: string;
  doses: (DoseView & { slot: Slot; scheduleId: string; catalogId: string })[];
  alerts: { kind: "low_stock" | "course_end"; scheduleId: string; name: string; daysLeft?: number; stock?: number; endDate?: string }[];
};

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-24">
      <svg viewBox="0 0 80 80" className="size-full -rotate-90" aria-hidden>
        <circle cx="40" cy="40" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
        <motion.circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke="var(--lime-500)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          animate={{ strokeDashoffset: c * (1 - (total ? done / total : 0)) }}
          transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-extrabold">
          {done}/{total}
        </span>
        <span className="text-[0.65rem] font-bold text-ink-2">taken</span>
      </div>
    </div>
  );
}

/** Asks for notification permission from a tap (browsers require a tap). */
function PushBanner() {
  const [state, setState] = useState<PushState | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    pushState().then(setState);
  }, []);
  if (state === null || state === "on") return null;
  return (
    <AlertCard
      tone="warn"
      title={state === "denied" ? "Notifications are blocked" : state === "unsupported" ? "Reminders need the installed app" : "Turn on reminders"}
      body={
        state === "denied"
          ? "Allow notifications for this site in your browser settings to get reminders."
          : state === "unsupported"
            ? "On iPhone, tap Share → Add to Home Screen, then open PharmiAI from there."
            : "We'll notify you at each dose time, with the strip photo."
      }
      action={
        state === "off" && (
          <div className="space-y-2">
            <PillButton
              size="sm"
              variant="green"
              onClick={async () => {
                setError(null);
                try {
                  setState(await enablePush());
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              <BellRing className="size-4" aria-hidden /> Turn on
            </PillButton>
            {error && <p className="text-sm font-semibold text-danger">{error}</p>}
          </div>
        )
      }
    />
  );
}

export default function TodayPage() {
  const { t } = usePrefs();
  const [query] = useState(patientQuery);
  const { data, error, loading, reload, setData } = useApi<TodayData>(`/api/today${query}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [actError, setActError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // Refresh when the app comes back to the front (e.g. after tapping a notification).
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reload]);

  async function act(id: string, action: DoseState) {
    setBusy(id);
    setActError(null);
    try {
      const res = await api<{ state: DoseState }>(`/api/doses/${id}/act`, { method: "POST", json: { action, opId: newOpId() } });
      setData((d) => d && { ...d, doses: d.doses.map((x) => (x.id === id ? { ...x, state: res.state } : x)) });
    } catch (e) {
      setActError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runNow() {
    setRunning(true);
    await api("/api/cron/run-now", { method: "POST" }).catch(() => {});
    setRunning(false);
    reload();
  }

  const doses = data?.doses ?? [];
  const taken = doses.filter((d) => d.state === "taken").length;
  const slots: Slot[] = ["morning", "afternoon", "night"];
  const dateLabel = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("today")} subtitle={dateLabel} right={doses.length > 0 && <ProgressRing done={taken} total={doses.length} />} />

      <div className="lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-8">
        <div>
          <div className="mt-2">
            <PushBanner />
          </div>
          {loading && (
            <div className="mt-6">
              <LoadingCards />
            </div>
          )}
          {error && (
            <div className="mt-6">
              <ErrorCard message={error} onRetry={reload} />
            </div>
          )}
          {actError && <p className="mt-3 rounded-sm bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{actError}</p>}
          {data && doses.length === 0 && (
            <div className="mt-6">
              <EmptyCard
                title="No reminders today"
                body="Scan a prescription and confirm each medicine. Reminders are only set for verified medicines."
                action={
                  <Link href="/scan">
                    <PillButton variant="green">
                      <ScanLine className="size-5" aria-hidden /> Scan a prescription
                    </PillButton>
                  </Link>
                }
              />
            </div>
          )}
          {slots.map((slot) => {
            const list = doses.filter((d) => d.slot === slot);
            if (list.length === 0) return null;
            const Icon = SLOT_ICON[slot];
            return (
              <section key={slot}>
                <SectionTitle>
                  <span className="inline-flex items-center gap-2">
                    <Icon className="size-5 text-green-700" aria-hidden /> {t(slot)}
                  </span>
                </SectionTitle>
                <div className="space-y-3">
                  {list.map((d) => (
                    <DoseCard key={d.id} dose={d} busy={busy === d.id} onAct={(s) => act(d.id, s)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div>
          {data && data.alerts.length > 0 && (
            <>
              <SectionTitle>Reminders</SectionTitle>
              <div className="space-y-3">
                {data.alerts.map((a) =>
                  a.kind === "low_stock" ? (
                    <AlertCard
                      key={`${a.kind}-${a.scheduleId}`}
                      tone="warn"
                      title={`${a.name} is running low`}
                      body={`${a.stock} left — about ${a.daysLeft} day${a.daysLeft === 1 ? "" : "s"}.`}
                      action={
                        <Link href="/refills">
                          <PillButton size="sm" variant="lime">
                            <Package className="size-4" aria-hidden /> Review refill
                          </PillButton>
                        </Link>
                      }
                    />
                  ) : (
                    <AlertCard key={`${a.kind}-${a.scheduleId}`} tone="ok" title={`${a.name} course ends ${a.endDate}`} body="Reminders stop automatically after the last dose." />
                  ),
                )}
              </div>
            </>
          )}
          <SectionTitle>Test mode</SectionTitle>
          <PillButton className="w-full" onClick={runNow} disabled={running}>
            <PlayCircle className="size-5" aria-hidden /> {running ? "Checking…" : "Run reminders now"}
          </PillButton>
          <p className="mt-6 text-center text-sm text-ink-2">Reminders exist only for verified medicines.</p>
        </div>
      </div>
    </div>
  );
}
