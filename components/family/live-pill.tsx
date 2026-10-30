"use client";

import { usePrefs } from "@/components/providers";
import { cn } from "@/components/ui";
import type { LiveStatus } from "@/lib/use-live";
import { clock } from "./format";

/** "● Live" / "Reconnecting…" / "Offline, last updated 10:42". Never colour alone: dot + text. */
export function LivePill({ status, updatedAt }: { status: LiveStatus; updatedAt: Date | null }) {
  const { elder } = usePrefs();
  const offline = status === "offline";
  const waiting = status === "reconnecting" || status === "connecting";
  const label = offline ? `Offline${updatedAt ? `, last updated ${clock(updatedAt)}` : ""}` : waiting ? (status === "connecting" ? "Connecting…" : "Reconnecting…") : "Live";
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold",
        offline ? "bg-surface-2 text-ink-2" : waiting ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok",
      )}
    >
      {/* Slow pulse while reconnecting — but no loops in Elder mode. */}
      <span className={cn("size-2 rounded-full", offline ? "bg-muted" : waiting ? "bg-warn" : "bg-ok", waiting && !elder && "animate-pulse")} aria-hidden />
      {label}
    </span>
  );
}
