"use client";

import { AnimatePresence, motion } from "motion/react";
import { CalendarClock, ChevronRight, HeartPulse, Package, Pill, Siren } from "lucide-react";
import Link from "next/link";
import { Avatar, cn } from "@/components/ui";
import { ago, clock, colorFor, PRESENCE_LABEL } from "./format";
import type { PersonSummary } from "./types";

/** A value that crossfades (220ms, opacity only) when it changes after a live update. */
export function Fade({ value, className }: { value: string | number; className?: string }) {
  return (
    <span className={cn("relative inline-grid", className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={String(value)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

function Stat({ icon: Icon, label, value, tone = "default" }: { icon: typeof Pill; label: string; value: string | number; tone?: "default" | "warn" }) {
  return (
    <div className={cn("rounded-sm p-3", tone === "warn" ? "bg-warn-soft" : "bg-surface-2")}>
      <div className={cn("flex items-center gap-1 text-xs font-bold", tone === "warn" ? "text-warn" : "text-ink-2")}>
        <Icon className="size-3.5" aria-hidden /> {label}
      </div>
      <Fade value={value} className="text-xl font-extrabold" />
    </div>
  );
}

const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;

/**
 * Dashboard card for one person. Phone: opens /family/<id>. Laptop: selects them in the right pane.
 * Red ring when a check or SOS is active.
 */
export function ElderSummaryCard({ person, selected, onSelect }: { person: PersonSummary; selected?: boolean; onSelect?: (id: string) => void }) {
  const urgent = Boolean(person.check || person.sos);
  const title = person.role === "self" ? `${person.name} (you)` : person.name;
  return (
    <div
      className={cn(
        "rounded-card bg-surface shadow-card transition-shadow",
        urgent ? "ring-4 ring-danger" : selected ? "ring-2 ring-green-700" : "",
      )}
    >
      <Link
        href={`/family/${person.id}`}
        aria-current={selected ? "true" : undefined}
        onClick={(e) => {
          if (onSelect && isDesktop()) {
            e.preventDefault();
            onSelect(person.id);
          }
        }}
        className="block rounded-card p-5"
      >
        <div className="flex items-center gap-3">
          <Avatar name={person.name} color={colorFor(person.id)} size={52} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold">{title}</div>
            <div className="text-sm text-ink-2">
              {PRESENCE_LABEL[person.presence] ?? person.presence} · active <Fade value={ago(person.lastActivityAt)} />
            </div>
          </div>
          <ChevronRight className="size-5 text-ink-2" aria-hidden />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat icon={Pill} label="Doses today" value={`${person.doses.taken}/${person.doses.total}`} tone={person.doses.missed > 0 ? "warn" : "default"} />
          <Stat icon={Package} label="Low stock" value={person.lowStock} tone={person.lowStock > 0 ? "warn" : "default"} />
          <Stat icon={CalendarClock} label="Expiring" value={person.expiringSoon} tone={person.expiringSoon > 0 ? "warn" : "default"} />
        </div>
        {!urgent && (
          <p className="mt-3 text-sm text-ink-2">
            {person.doses.missed > 0
              ? `${person.doses.missed} dose${person.doses.missed === 1 ? "" : "s"} missed today`
              : person.doses.nextAt
                ? `Next dose at ${clock(person.doses.nextAt)}`
                : person.doses.total > 0
                  ? "All of today's doses done"
                  : "No doses today"}
          </p>
        )}
      </Link>
      {person.sos && (
        <Link href={`/sos?patient=${person.id}`} className="mx-5 mb-5 flex min-h-12 items-center gap-2 rounded-full bg-danger px-4 text-sm font-bold text-white">
          <Siren className="size-4" aria-hidden /> {person.sos.isTest ? "Test SOS" : "SOS active"} since {clock(person.sos.startedAt)}
        </Link>
      )}
      {person.check && !person.sos && (
        <Link href={`/checks/${person.check.id}`} className="mx-5 mb-5 flex min-h-12 items-center gap-2 rounded-full bg-danger-soft px-4 text-sm font-bold text-danger">
          <HeartPulse className="size-4" aria-hidden /> &ldquo;Are you okay?&rdquo; check since {clock(person.check.startedAt)} — open
        </Link>
      )}
    </div>
  );
}
