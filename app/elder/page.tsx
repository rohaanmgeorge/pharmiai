"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Mic, Settings } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PillStrip } from "@/components/cards";
import { usePrefs } from "@/components/providers";
import { getMedicine, todayDoses } from "@/lib/mock";

// Elder mode home: one thing at a time, huge text, one Talk button, SOS always visible.
export default function ElderHome() {
  const router = useRouter();
  const { t, setElder } = usePrefs();
  const [taken, setTaken] = useState(false);
  const dose = todayDoses[2];
  const med = getMedicine(dose.medicineId)!;

  useEffect(() => setElder(true), [setElder]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-ink-2">{t("goodMorning")},</div>
          <div className="text-[2rem] leading-tight font-extrabold">Amma</div>
        </div>
        <Link href="/settings" aria-label="Settings" className="flex size-16 items-center justify-center rounded-full bg-white shadow-card">
          <Settings className="size-7 text-ink-2" aria-hidden />
        </Link>
      </div>

      <div className="mt-6 rounded-card bg-white p-6 shadow-card">
        <div className="font-bold text-ink-2">{t("nextMedicine")}</div>
        <AnimatePresence mode="wait">
          {taken ? (
            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-6 text-center">
              <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-ok-soft text-ok">
                <Check className="size-10" aria-hidden />
              </div>
              <div className="mt-4 text-2xl font-extrabold">{t("allDone")}</div>
              <div className="text-ink-2">Next: Glyconil 500 at 20:30</div>
            </motion.div>
          ) : (
            <motion.div key="due" exit={{ opacity: 0 }}>
              <div className="mt-3 flex items-center gap-4">
                <PillStrip color={med.color} size={80} />
                <div>
                  <div className="text-[1.75rem] leading-tight font-extrabold">{med.brand}</div>
                  <div className="text-xl text-ink-2">1 tablet · {dose.time}</div>
                </div>
              </div>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setTaken(true)}
                className="mt-6 flex min-h-20 w-full items-center justify-center gap-3 rounded-full bg-lime-500 text-2xl font-extrabold text-ink"
              >
                <Check className="size-8" aria-hidden /> {t("taken")}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-6">
        <Link href="/voice" aria-label={t("talk")} className="flex flex-col items-center gap-3">
          <motion.span whileTap={{ scale: 0.95 }} className="flex size-28 items-center justify-center rounded-full bg-green-700 text-white shadow-float">
            <Mic className="size-12" aria-hidden />
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
          className="min-h-20 rounded-full border-2 border-line bg-white text-lg font-bold">
          Full app
        </button>
      </div>
    </main>
  );
}
