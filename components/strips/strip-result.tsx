"use client";

import { motion } from "motion/react";
import { BadgeIndianRupee, BookOpen, CheckCircle2, Stethoscope, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui";
import { ExpiryBadge, type ExpiryBadgeKind } from "./expiry-badge";

export type MatchingSchedule = { id: string; name: string; stock: number; slots: ("morning" | "afternoon" | "night")[] };
export type MedicineInfo = { uses: string | null; sideEffects: string | null; source: string };
export type GenericOffer = { name: string; mrp: number; packSize: number; brandMrp: number | null; brandPackSize: number | null };

const perTablet = (price: number, pack: number) => (pack > 0 ? price / pack : null);

/** Shown after a strip is Verified. All facts come from our checked DB tables, never AI text. */
export function StripResult(props: {
  name: string;
  expiry: string | null;
  badge: ExpiryBadgeKind;
  matching: MatchingSchedule[];
  duplicates: { ingredient: string; names: string[] }[];
  info: MedicineInfo | null;
  generic: GenericOffer | null;
}) {
  const { name, expiry, badge, matching, duplicates, info, generic } = props;
  const slots = [...new Set(matching.flatMap((m) => m.slots))];
  const brandEach = generic?.brandMrp && generic.brandPackSize ? perTablet(generic.brandMrp, generic.brandPackSize) : null;
  const genericEach = generic ? perTablet(generic.mrp, generic.packSize) : null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      <Card className="p-4">
        {matching.length > 0 ? (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-ok" aria-hidden />
            <p className="text-lg font-bold">
              This is your {name}
              {slots.length > 0 && <span className="font-semibold text-ink-2"> (taken {slots.join(" and ")})</span>}.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-3">
            <Stethoscope className="mt-0.5 size-6 shrink-0 text-warn" aria-hidden />
            <p className="text-lg font-bold">This is not in your current medicines — ask your doctor before taking it.</p>
          </div>
        )}
        <div className="mt-3 flex items-center gap-2 text-sm">
          <ExpiryBadge badge={badge} />
          {expiry && <span className="font-semibold">{badge === "expired" ? `Expired ${expiry}` : `Good until end of ${expiry}`}</span>}
        </div>
      </Card>

      {duplicates.map((d) => (
        <p key={d.ingredient} className="flex items-start gap-2 rounded-sm bg-warn-soft p-3 text-sm font-semibold text-warn">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Same active ingredient (<span className="capitalize">{d.ingredient}</span>) in {d.names.join(" and ")}. Please ask your doctor before taking both.
          </span>
        </p>
      ))}

      {info && (info.uses || info.sideEffects) && (
        <Card className="space-y-2 p-4 text-sm">
          <div className="flex items-center gap-2 font-bold">
            <BookOpen className="size-5" aria-hidden /> About this medicine
          </div>
          {info.uses && (
            <p>
              <span className="font-bold">Used for: </span>
              {info.uses}
            </p>
          )}
          {info.sideEffects && (
            <p>
              <span className="font-bold">Common side effects: </span>
              {info.sideEffects}
            </p>
          )}
          <p className="text-xs text-ink-2">Source: {info.source}. Not medical advice.</p>
        </Card>
      )}

      {generic && (
        <Card className="flex items-start gap-3 p-4 text-sm">
          <BadgeIndianRupee className="mt-0.5 size-6 shrink-0 text-ok" aria-hidden />
          <div>
            <div className="font-bold">Jan Aushadhi option: {generic.name}</div>
            <div>
              ₹{generic.mrp.toFixed(2)} for {generic.packSize}
              {genericEach !== null && ` (₹${genericEach.toFixed(2)} each`}
              {genericEach !== null && brandEach !== null && ` vs ₹${brandEach.toFixed(2)} for this brand`}
              {genericEach !== null && ")"}
            </div>
            <div className="text-xs text-ink-2">Same ingredients and strength. Ask your doctor or pharmacist before switching.</div>
          </div>
        </Card>
      )}
    </motion.div>
  );
}
