"use client";

import { motion } from "motion/react";
import { Moon, Package, Sun, Sunrise } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AdherenceBars, AlertCard, DoseCard } from "@/components/cards";
import { usePrefs } from "@/components/providers";
import { PageHeader, PillButton, SectionTitle } from "@/components/ui";
import { type DoseState, type Slot, todayDoses } from "@/lib/mock";

const SLOT_ICON = { morning: Sunrise, afternoon: Sun, night: Moon } as const;

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
          animate={{ strokeDashoffset: c * (1 - done / total) }}
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

export default function TodayPage() {
  const { t } = usePrefs();
  const [states, setStates] = useState<Record<string, DoseState>>(Object.fromEntries(todayDoses.map((d) => [d.id, d.state])));
  const doses = todayDoses.map((d) => ({ ...d, state: states[d.id] }));
  const taken = doses.filter((d) => d.state === "taken").length;
  const slots: Slot[] = ["morning", "afternoon", "night"];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title={t("today")} subtitle="Thursday, 29 October · Amma" right={<ProgressRing done={taken} total={doses.length} />} />

      <div className="lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] lg:gap-8">
        <div>
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
                    <DoseCard key={d.id} dose={d} onAct={(s) => setStates((x) => ({ ...x, [d.id]: s }))} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div>
          <SectionTitle>Adherence</SectionTitle>
          <AdherenceBars />
          <SectionTitle>Reminders</SectionTitle>
          <div className="space-y-3">
            <AlertCard
              tone="warn"
              title="Pressana 5 is running low"
              body="4 tablets left — about 4 days. Time to restock."
              action={
                <PillButton size="sm" variant="lime">
                  <Package className="size-4" aria-hidden /> Remind me to buy
                </PillButton>
              }
            />
            <AlertCard tone="ok" title="Pantora 40 course ends Saturday" body="5-day course. We'll stop reminders automatically after the last dose." />
          </div>
          <p className="mt-6 text-center text-sm text-ink-2">
            Reminders exist only for verified medicines.{" "}
            <Link href="/review" className="font-bold text-green-700 underline">
              Review last scan
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
