"use client";

import { CheckCircle2, CircleHelp, Clock, TriangleAlert } from "lucide-react";
import { cn } from "@/components/ui";

export type ExpiryBadgeKind = "ok" | "soon" | "expired" | "needs_check";

// DESIGN.md §7 ExpiryBadge: always icon + text, never colour alone.
const META = {
  ok: { Icon: CheckCircle2, label: "OK", cls: "bg-ok-soft text-ok" },
  soon: { Icon: Clock, label: "Expiring soon", cls: "bg-warn-soft text-warn" },
  expired: { Icon: TriangleAlert, label: "Expired", cls: "bg-danger-soft text-danger" },
  needs_check: { Icon: CircleHelp, label: "Needs check", cls: "bg-surface-2 text-ink-2" },
} as const;

export function ExpiryBadge({ badge }: { badge: ExpiryBadgeKind }) {
  const m = META[badge];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold", m.cls)}>
      <m.Icon className="size-3.5" aria-hidden />
      {m.label}
    </span>
  );
}
