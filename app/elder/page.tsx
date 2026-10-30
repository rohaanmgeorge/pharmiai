"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Mic, Settings, SkipForward } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type DoseView, PillStrip } from "@/components/cards";
import { usePrefs } from "@/components/providers";
import { ErrorCard, LoadingCards } from "@/components/states";
import { api, newOpId } from "@/lib/api-client";
import type { DoseState } from "@/lib/mock";
import { patientQuery, useApi } from "@/lib/use-api";

type TodayData = { doses: DoseView[] };
type Me = { me: { name: string } | null };

// Elder mode home: one thing at a time, huge text, one Talk button, SOS always visible.
export default function ElderHome() {
  const router = useRouter();
  const { t, setElder } = usePrefs();
  const [query] = useState(patientQuery);
  const { data, error, loading, reload, setData } = useApi<TodayData>(`/api/today${query}`);
  const { data: me } = useApi<Me>("/api/me");
  const [busy, setBusy] = useState(false);
  const [actError, setActError] = useState<string | null>(null);

  useEffect(() => setElder(true), [setElder]);

  // The next dose still to take today (doses come sorted by time).
  const dose = data?.doses.find((d) => d.state === "pending" || d.state === "snoozed") ?? null;

  async function act(action: DoseState) {
    if (!dose) return;
    setBusy(true);
    setActError(null);
    try {
      const res = await api<{ state: DoseState }>(`/api/doses/${dose.id}/act`, { method: "POST", json: { action, opId: newOpId() } });
      setData((d) => d && { ...d, doses: d.doses.map((x) => (x.id === dose.id ? { ...x, state: res.state } : x)) });
    } catch (e) {
      setActError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-ink-2">{t("goodMorning")},</div>
          <div className="text-[2rem] leading-tight font-extrabold">{me?.me?.name || " "}</div>
        </div>
        <Link href="/settings" aria-label="Settings" className="flex size-16 items-center justify-center rounded-full bg-white shadow-card">
          <Settings className="size-7 text-ink-2" aria-hidden />
        </Link>
      </div>

      <div className="mt-6 rounded-card bg-white p-6 shadow-card">
        <div className="font-bold text-ink-2">{t("nextMedicine")}</div>
        {loading ? (
          <div className="mt-3">
            <LoadingCards count={1} />
          </div>
        ) : error ? (
          <div className="mt-3">
            <ErrorCard message={error} onRetry={reload} />
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {!dose ? (
              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-6 text-center">
                <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-ok-soft text-ok">
                  <Check className="size-10" aria-hidden />
                </div>
                <div className="mt-4 text-2xl font-extrabold">{t("allDone")}</div>
              </motion.div>
            ) : (
              <motion.div key={dose.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="mt-3 flex items-center gap-4">
                  {dose.photoUrl ? (
                    // The family's own photo of this strip, so it can be matched at a glance.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={dose.photoUrl} alt={`Photo of ${dose.name} strip`} className="size-20 shrink-0 rounded-sm object-cover" />
                  ) : (
                    <PillStrip size={80} />
                  )}
                  <div className="min-w-0">
                    <div className="text-[1.75rem] leading-tight font-extrabold break-words">{dose.name}</div>
                    <div className="text-xl text-ink-2">
                      1 {dose.form.toLowerCase()} · {dose.time}
                    </div>
                    {dose.food && <div className="text-lg text-ink-2">{t(dose.food === "after" ? "afterFood" : "beforeFood")}</div>}
                  </div>
                </div>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  disabled={busy}
                  onClick={() => act("taken")}
                  className="mt-6 flex min-h-20 w-full items-center justify-center gap-3 rounded-full bg-lime-500 text-2xl font-extrabold text-ink disabled:opacity-50"
                >
                  <Check className="size-8" aria-hidden /> {t("taken")}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  disabled={busy}
                  onClick={() => act("skipped")}
                  className="mt-3 flex min-h-16 w-full items-center justify-center gap-3 rounded-full border-2 border-line bg-white text-xl font-bold text-ink disabled:opacity-50"
                >
                  <SkipForward className="size-6" aria-hidden /> {t("skip")}
                </motion.button>
                {actError && <p className="mt-3 text-center text-lg font-semibold text-danger">{actError}</p>}
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-6">
        <Link href="/voice" aria-label={t("talk")} className="flex flex-col items-center gap-3">
          <motion.span whileTap={{ scale: 0.95 }} className="flex size-24 items-center justify-center rounded-full bg-green-700 text-white shadow-float">
            <Mic className="size-11" aria-hidden />
          </motion.span>
          <span className="text-2xl font-extrabold">{t("talk")}</span>
        </Link>
      </div>

      {/* Pinned to the bottom so SOS is always on screen, even with large text. */}
      <div className="sticky bottom-0 -mx-5 grid grid-cols-2 gap-3 bg-gradient-to-t from-white via-white to-white/0 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <Link href="/sos" className="flex min-h-20 items-center justify-center rounded-full bg-danger text-2xl font-extrabold text-white">
          SOS
        </Link>
        <button
          onClick={() => {
            setElder(false);
            router.push("/chat");
          }}
          className="min-h-20 rounded-full border-2 border-line bg-white text-lg font-bold"
        >
          Full app
        </button>
      </div>
    </main>
  );
}
