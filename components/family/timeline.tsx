"use client";

import { motion } from "motion/react";
import { Bell, CheckCircle2, HeartPulse, Phone, Pill } from "lucide-react";
import Link from "next/link";
import { Card, cn } from "@/components/ui";
import { clock } from "./format";
import type { TimelineEvent } from "./types";
import { uiLocale } from "@/lib/client";

const ICON = { missed: Pill, check: HeartPulse, alert: Bell, ack: Phone, ended: CheckCircle2 } as const;
const TONE = { missed: "bg-danger-soft text-danger", check: "bg-warn-soft text-warn", alert: "bg-surface-2 text-ink-2", ack: "bg-ok-soft text-ok", ended: "bg-ok-soft text-ok" } as const;

/** Missed-dose alerts and "Are you okay?" steps from the last 7 days, newest first. */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return <Card className="p-5 text-ink-2">No alerts in the last 7 days.</Card>;
  return (
    <Card className="p-4">
      <ol className="space-y-3">
        {events.map((e, i) => {
          const Icon = ICON[e.kind];
          const row = (
            <>
              <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", TONE[e.kind])}>
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="flex-1 text-sm">{e.text}</span>
              <span className="text-xs font-bold text-ink-2">
                {new Date(e.at).toLocaleDateString(uiLocale(), { day: "numeric", month: "short" })} {clock(e.at)}
              </span>
            </>
          );
          return (
            <motion.li key={e.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
              {e.checkId ? (
                <Link href={`/checks/${e.checkId}`} className="flex min-h-12 items-center gap-3">
                  {row}
                </Link>
              ) : (
                <div className="flex min-h-12 items-center gap-3">{row}</div>
              )}
            </motion.li>
          );
        })}
      </ol>
    </Card>
  );
}
