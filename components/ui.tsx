"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, CircleHelp, Clock, ShieldCheck, Sparkles, TriangleAlert, X } from "lucide-react";
import { useState } from "react";
import { usePrefs } from "@/components/providers";
import type { Consent, Status } from "@/lib/mock";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-card bg-surface shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

type PillVariant = "outline" | "lime" | "green" | "danger" | "ghost";

const pillStyles: Record<PillVariant, string> = {
  outline: "border border-line bg-surface text-ink hover:bg-surface-2",
  lime: "bg-lime-500 text-ink hover:brightness-95", // dark text on lime only (contrast)
  green: "bg-green-700 text-white hover:brightness-110",
  danger: "bg-danger text-white hover:brightness-110",
  ghost: "text-ink-2 hover:bg-surface-2",
};

export function PillButton({
  variant = "outline",
  size = "md",
  className,
  children,
  ...rest
}: React.ComponentProps<typeof motion.button> & { variant?: PillVariant; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "min-h-10 px-4 text-sm", md: "min-h-12 px-5 text-base", lg: "min-h-14 px-7 text-lg" };
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.15 }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none",
        sizes[size],
        pillStyles[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </motion.button>
  );
}

const statusMeta = {
  verified: { key: "verified", Icon: ShieldCheck, cls: "bg-ok-soft text-ok", dot: "bg-ok" },
  needs_check: { key: "needsCheck", Icon: TriangleAlert, cls: "bg-warn-soft text-warn", dot: "bg-warn" },
  not_recognized: { key: "notRecognized", Icon: CircleHelp, cls: "bg-surface-2 text-ink-2", dot: "bg-muted" },
} as const;

/** Status is never shown by color alone: dot + icon + text. Morphs smoothly when it changes. */
export function StatusBadge({ status, layoutId }: { status: Status; layoutId?: string }) {
  const { t } = usePrefs();
  const meta = statusMeta[status];
  return (
    <motion.span
      layout
      layoutId={layoutId}
      className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold", meta.cls)}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={status}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          className="inline-flex items-center gap-1"
        >
          <meta.Icon className="size-3.5" aria-hidden />
          {t(meta.key)}
        </motion.span>
      </AnimatePresence>
    </motion.span>
  );
}

export function ConsentChip({ consent }: { consent: Consent }) {
  const map = {
    given: { Icon: Check, label: "Consent given", cls: "bg-ok-soft text-ok" },
    pending: { Icon: Clock, label: "Pending", cls: "bg-warn-soft text-warn" },
    revoked: { Icon: X, label: "Revoked", cls: "bg-surface-2 text-ink-2" },
  }[consent];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold", map.cls)}>
      <map.Icon className="size-3.5" aria-hidden />
      {map.label}
    </span>
  );
}

export function StatChip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "warn" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-sm font-bold shadow-float",
        tone === "warn" ? "text-warn" : "text-ink",
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({ name, color, size = 44 }: { name: string; color: string; size?: number }) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-ink"
      style={{ width: size, height: size, background: color, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** Small sparkle + very large light headline used on AI result screens. */
export function AiHeadline({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="px-2 text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0, rotate: -20 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 22 }}
        className="mx-auto mb-4 flex size-10 items-center justify-center rounded-full bg-lime-300"
      >
        <Sparkles className="size-5 text-green-700" aria-hidden />
      </motion.div>
      <motion.h1
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05 }}
        className="text-[2rem] leading-tight font-light tracking-tight text-ink sm:text-[2.5rem]"
      >
        {children}
      </motion.h1>
      {sub && <p className="mt-3 text-ink-2">{sub}</p>}
    </div>
  );
}

export function ExpandableCard({
  header,
  children,
  defaultOpen = false,
  className,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <motion.div layout className={cn("overflow-hidden rounded-card bg-surface shadow-card", className)}>
      <motion.button
        layout="position"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-4 text-left"
      >
        <div className="min-w-0 flex-1">{header}</div>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.22 }} className="text-ink-2">
          <ChevronDown className="size-5" aria-hidden />
        </motion.span>
      </motion.button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-sm", className)} aria-hidden />;
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-6 flex items-center justify-between px-1">
      <h2 className="text-lg font-bold text-ink">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 pt-2 pb-2">
      <div>
        <h1 className="text-[1.75rem] leading-9 font-bold text-ink">{title}</h1>
        {subtitle && <p className="text-ink-2">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-8 w-14 shrink-0 rounded-full transition-colors", checked ? "bg-green-700" : "bg-line")}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 32 }}
        className={cn("absolute top-1 size-6 rounded-full bg-white shadow", checked ? "right-1" : "left-1")}
      />
    </button>
  );
}

export function DemoTag() {
  return (
    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[0.7rem] font-bold tracking-wide text-ink-2 uppercase">
      Demo data
    </span>
  );
}
