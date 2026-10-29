"use client";

import { animate, AnimatePresence, motion, useMotionValue, useTransform } from "motion/react";
import { AlarmClock, Check, CheckCircle2, Clock, IndianRupee, MapPin, Phone, PiggyBank, SkipForward, TriangleAlert, Utensils } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { usePrefs } from "@/components/providers";
import { Avatar, Card, cn, PillButton, StatusBadge } from "@/components/ui";
import { type Contact, type Dose, type DoseState, getMedicine, type Medicine, medicines, weekAdherence, yearlySavings } from "@/lib/mock";

/** Simple illustrated pill-strip "photo" placeholder (real app shows the user's own strip photo). */
export function PillStrip({ color = "#ffffff", size = 56 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" aria-hidden className="shrink-0">
      <rect x="2" y="8" width="52" height="40" rx="10" fill="#e5e7eb" />
      <rect x="4" y="10" width="48" height="36" rx="9" fill="#f3f4f6" />
      {[0, 1, 2].map((c) =>
        [0, 1].map((r) => (
          <g key={`${c}${r}`}>
            <ellipse cx={14 + c * 14} cy={20 + r * 16} rx="5.5" ry="5.5" fill="#d1d5db" />
            <ellipse cx={14 + c * 14} cy={19.5 + r * 16} rx="4.5" ry="4.5" fill={color} stroke="#cbd5e1" />
          </g>
        )),
      )}
    </svg>
  );
}

const stateLabel: Record<DoseState, { text: string; cls: string }> = {
  pending: { text: "Due", cls: "bg-lime-300 text-ink" },
  taken: { text: "Taken", cls: "bg-ok-soft text-ok" },
  skipped: { text: "Skipped", cls: "bg-surface-2 text-ink-2" },
  snoozed: { text: "Snoozed 10 min", cls: "bg-warn-soft text-warn" },
  missed: { text: "Missed", cls: "bg-danger-soft text-danger" },
};

export function DoseCard({ dose, onAct, compact = false }: { dose: Dose; onAct?: (state: DoseState) => void; compact?: boolean }) {
  const { t } = usePrefs();
  const med = getMedicine(dose.medicineId)!;
  const label = stateLabel[dose.state];
  const actionable = dose.state === "pending" || dose.state === "snoozed";
  return (
    <motion.div layout className="rounded-card bg-surface p-4 shadow-card">
      <div className="flex items-center gap-3">
        <PillStrip color={med.color} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{med.brand}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-2">
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden /> {dose.time}
            </span>
            <span>1 {med.form.toLowerCase()}</span>
            {med.food && (
              <span className="inline-flex items-center gap-1">
                <Utensils className="size-3.5" aria-hidden /> {t(med.food === "after" ? "afterFood" : "beforeFood")}
              </span>
            )}
          </div>
        </div>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={dose.state}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className={cn("rounded-full px-2.5 py-1 text-xs font-bold", label.cls)}
          >
            {dose.state === "taken" && <Check className="mr-0.5 inline size-3.5" aria-hidden />}
            {label.text}
          </motion.span>
        </AnimatePresence>
      </div>
      {actionable && onAct && !compact && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          <PillButton size="sm" onClick={() => onAct("skipped")}>
            <SkipForward className="size-4" aria-hidden /> {t("skip")}
          </PillButton>
          <PillButton size="sm" onClick={() => onAct("snoozed")}>
            <AlarmClock className="size-4" aria-hidden /> {t("snooze")}
          </PillButton>
          <PillButton size="sm" variant="lime" onClick={() => onAct("taken")}>
            <Check className="size-4" aria-hidden /> {t("taken")}
          </PillButton>
        </div>
      )}
    </motion.div>
  );
}

export function MedicineSummary({ med }: { med: Medicine }) {
  return (
    <Link href={`/meds/${med.id}`} className="block">
      <motion.div layoutId={`med-${med.id}`} className="flex items-center gap-3 rounded-card bg-surface p-4 shadow-card">
        <PillStrip color={med.color} size={48} />
        <div className="min-w-0 flex-1">
          <div className="font-bold">{med.brand}</div>
          <div className="text-sm text-ink-2">
            {med.ingredient} {med.strength} · {med.doseCode}
          </div>
        </div>
        <StatusBadge status={med.status} />
      </motion.div>
    </Link>
  );
}

/** Number that counts up smoothly (transform-free, text only). */
export function CountUp({ value, prefix = "", duration = 0.8 }: { value: number; prefix?: string; duration?: number }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${prefix}${Math.round(v).toLocaleString("en-IN")}`);
  useEffect(() => {
    const controls = animate(mv, value, { duration, ease: [0.2, 0.8, 0.2, 1] });
    return () => controls.stop();
  }, [mv, value, duration]);
  return <motion.span>{text}</motion.span>;
}

export function SavingsCard({ compact = false }: { compact?: boolean }) {
  const total = yearlySavings();
  return (
    <Card className="overflow-hidden p-0">
      <div className="bg-gradient-to-br from-lime-300 to-lime-500/70 p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-ink">
          <PiggyBank className="size-4" aria-hidden /> Yearly savings with Jan Aushadhi generics
        </div>
        <div className="mt-2 text-[2.5rem] leading-none font-extrabold tracking-tight text-ink">
          <CountUp value={total} prefix="₹" />
        </div>
        <div className="mt-1 text-sm text-ink/70">Same active ingredient and strength · verified medicines only</div>
      </div>
      {!compact && (
        <ul className="divide-y divide-line px-5">
          {medicines.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-3 text-sm">
              <span className="font-semibold">{m.brand}</span>
              <span className="flex items-center gap-3">
                <span className="text-ink-2 line-through">₹{m.brandPricePerStrip}</span>
                <span className="font-bold text-green-700">₹{m.genericPricePerStrip}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export type SosContactState = "notifying" | "notified" | "going";

export function SOSStatusCard({ contacts, states }: { contacts: Contact[]; states: Record<string, SosContactState> }) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-2">
        <MapPin className="size-4 text-danger" aria-hidden /> Live location shared with
      </div>
      <ul className="space-y-3">
        {contacts.map((c) => {
          const s = states[c.id] ?? "notifying";
          return (
            <li key={c.id} className="flex items-center gap-3">
              <Avatar name={c.name} color={c.color} size={40} />
              <div className="min-w-0 flex-1">
                <div className="font-bold">{c.name}</div>
                <div className="text-sm text-ink-2">
                  {c.relation} · #{c.priority}
                </div>
              </div>
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={s}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold",
                    s === "going" ? "bg-ok-soft text-ok" : s === "notified" ? "bg-lime-300 text-ink" : "bg-surface-2 text-ink-2",
                  )}
                >
                  {s === "going" ? <CheckCircle2 className="size-3.5" aria-hidden /> : s === "notified" ? <Check className="size-3.5" aria-hidden /> : <Phone className="size-3.5" aria-hidden />}
                  {s === "going" ? "I'm going" : s === "notified" ? "Notified" : "Notifying…"}
                </motion.span>
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Weekly adherence: rounded vertical bars, lime = taken, grey = missed. */
export function AdherenceBars() {
  const max = 5;
  return (
    <Card className="p-5">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-sm font-bold text-ink-2">This week</div>
          <div className="text-[2rem] leading-tight font-extrabold">
            {Math.round((weekAdherence.reduce((a, d) => a + d.taken, 0) / weekAdherence.reduce((a, d) => a + d.total, 0)) * 100)}%
          </div>
        </div>
        <div className="flex gap-3 text-xs font-bold text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-lime-500" /> Taken
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-line" /> Missed
          </span>
        </div>
      </div>
      <div className="mt-5 grid h-36 grid-cols-7 items-end gap-2.5" role="img" aria-label="Doses taken each day this week">
        {weekAdherence.map((d, i) => (
          <div key={d.day} className="flex h-full flex-col items-center gap-2">
            <div className="flex w-full flex-1 flex-col justify-end gap-1">
              <motion.div
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.35, delay: i * 0.04, ease: [0.2, 0.8, 0.2, 1] }}
                style={{ height: `${((d.total - d.taken) / max) * 100}%`, transformOrigin: "bottom" }}
                className={cn("w-full rounded-full bg-line", d.total === d.taken && "hidden")}
              />
              <motion.div
                initial={{ scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ duration: 0.35, delay: i * 0.04, ease: [0.2, 0.8, 0.2, 1] }}
                style={{ height: `${(d.taken / max) * 100}%`, transformOrigin: "bottom" }}
                className="w-full rounded-full bg-lime-500"
                title={`${d.day}: ${d.taken} of ${d.total} taken`}
              />
            </div>
            <span className="text-xs font-bold text-ink-2">{d.day}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function AlertCard({ tone, title, body, action }: { tone: "warn" | "ok" | "danger"; title: string; body: string; action?: React.ReactNode }) {
  const tones = {
    warn: "bg-warn-soft text-warn",
    ok: "bg-ok-soft text-ok",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <Card className="flex items-start gap-3 p-4">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full", tones[tone])}>
        {tone === "ok" ? <CheckCircle2 className="size-5" aria-hidden /> : tone === "danger" ? <IndianRupee className="size-5" aria-hidden /> : <TriangleAlert className="size-5" aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-bold">{title}</div>
        <p className="text-sm text-ink-2">{body}</p>
        {action && <div className="mt-3">{action}</div>}
      </div>
    </Card>
  );
}
