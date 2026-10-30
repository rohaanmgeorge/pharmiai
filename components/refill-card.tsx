"use client";

import { motion } from "motion/react";
import { CheckCircle2, Clock, IndianRupee, Pill, ShoppingBag } from "lucide-react";
import { Card, PillButton } from "@/components/ui";

// Refill suggestion card (DESIGN.md §7). Plain props + callbacks so Home and chat can reuse it.
// Leave out onReview / onLater for read-only viewers: no buttons are shown.

export type RefillCardGeneric = { name: string; pricePerUnit: number; brandPricePerUnit: number | null };

export type RefillCardProps = {
  name: string;
  strength?: string;
  daysLeft: number;
  state?: "open" | "later" | "approved" | "refilled" | "dismissed";
  generic?: RefillCardGeneric | null; // Jan Aushadhi option — only ever passed for Verified medicines
  approvedByName?: string | null;
  onReview?: () => void;
  onLater?: () => void;
  busy?: boolean;
};

const rupees = (n: number) => `₹${n.toFixed(2)}`;

export function runsOutText(days: number) {
  if (days <= 0) return "Runs out today";
  return `Runs out in ${days} day${days === 1 ? "" : "s"}`;
}

export function RefillCard({ name, strength, daysLeft, state = "open", generic, approvedByName, onReview, onLater, busy }: RefillCardProps) {
  return (
    <motion.div layout>
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-lime-300 text-ink">
            <Pill className="size-6" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold">
              {name}
              {strength && <span className="ml-1 text-sm font-semibold text-ink-2">{strength}</span>}
            </div>
            <div className={daysLeft <= 2 ? "flex items-center gap-1 font-bold text-danger" : "flex items-center gap-1 font-bold text-warn"}>
              <Clock className="size-4" aria-hidden /> {runsOutText(daysLeft)}
            </div>
            {state === "later" && <div className="text-sm text-ink-2">Snoozed until tomorrow</div>}
            {state === "approved" && (
              <div className="flex items-center gap-1 text-sm font-semibold text-ok">
                <CheckCircle2 className="size-4" aria-hidden /> Order sent{approvedByName ? ` by ${approvedByName}` : ""}
              </div>
            )}
          </div>
        </div>

        {generic && (
          <div className="mt-3 flex items-start gap-2 rounded-sm bg-ok-soft p-3 text-sm text-ok">
            <IndianRupee className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              <b>Jan Aushadhi:</b> {generic.name} — {rupees(generic.pricePerUnit)} per tablet
              {generic.brandPricePerUnit !== null && ` vs ${rupees(generic.brandPricePerUnit)} brand`}. Ask your doctor or pharmacist before switching.
            </span>
          </div>
        )}

        {(onReview || onLater) && (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {onLater && (
              <PillButton onClick={onLater} disabled={busy} className={onReview ? "" : "col-span-2"}>
                Later
              </PillButton>
            )}
            {onReview && (
              <PillButton variant="green" onClick={onReview} disabled={busy} className={onLater ? "" : "col-span-2"}>
                <ShoppingBag className="size-4" aria-hidden /> {state === "approved" ? "Open order" : "Review order"}
              </PillButton>
            )}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
