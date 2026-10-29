"use client";

import { motion } from "motion/react";
import { BookOpen, ChevronLeft, Clock, Package, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PillStrip } from "@/components/cards";
import { usePrefs } from "@/components/providers";
import { Card, DemoTag, PillButton, SectionTitle, StatusBadge } from "@/components/ui";
import { getMedicine } from "@/lib/mock";

export function MedicineClient() {
  const { id } = useParams<{ id: string }>();
  const { t } = usePrefs();
  const med = getMedicine(id);

  if (!med) {
    return (
      <div className="pt-20 text-center">
        <p className="text-lg font-bold">Medicine not found</p>
        <Link href="/today" className="mt-4 inline-block font-bold text-green-700 underline">
          Back to today
        </Link>
      </div>
    );
  }

  const daysLeft = Math.floor(med.stockLeft / med.slots.length);
  const yearly = Math.round(((med.brandPricePerStrip - med.genericPricePerStrip) / med.stripSize) * med.slots.length * 365);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/today" className="mb-3 inline-flex min-h-12 items-center gap-1 font-bold text-ink-2">
        <ChevronLeft className="size-5" aria-hidden /> Back
      </Link>

      <motion.div layoutId={`med-${med.id}`} className="rounded-card bg-white p-5 shadow-card">
        <div className="flex items-center gap-4">
          <PillStrip color={med.color} size={72} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold">{med.brand}</h1>
            <p className="text-ink-2">
              {med.ingredient} {med.strength} · {med.form}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge status={med.status} />
          <DemoTag />
        </div>
      </motion.div>

      <SectionTitle>How to take</SectionTitle>
      <Card className="grid grid-cols-3 divide-x divide-line p-0 text-center">
        <div className="p-4">
          <div className="text-xs font-bold text-ink-2">Pattern</div>
          <div className="text-xl font-extrabold">{med.doseCode === "OD" ? "Once daily" : med.doseCode}</div>
        </div>
        <div className="p-4">
          <div className="text-xs font-bold text-ink-2">When</div>
          <div className="font-bold">{med.slots.map((s) => t(s)).join(" + ")}</div>
        </div>
        <div className="p-4">
          <div className="text-xs font-bold text-ink-2">Course</div>
          <div className="text-xl font-extrabold">{med.durationDays} days</div>
        </div>
      </Card>
      <p className="mt-2 px-1 text-sm text-ink-2">
        <Clock className="mr-1 inline size-4" aria-hidden />
        {med.doseCode} means {med.slots.map((s) => t(s).toLowerCase()).join(" and ")}
        {med.food ? `, ${t(med.food === "after" ? "afterFood" : "beforeFood").toLowerCase()}` : ""} — as written by your doctor.
      </p>

      <SectionTitle>What it&apos;s for</SectionTitle>
      <Card className="p-5">
        <p className="text-lg">{med.uses}</p>
      </Card>

      <SectionTitle>Common side effects</SectionTitle>
      <Card className="p-5">
        <ul className="flex flex-wrap gap-2">
          {med.sideEffects.map((s) => (
            <li key={s} className="rounded-full bg-surface-2 px-3 py-1.5 text-sm font-semibold">
              {s}
            </li>
          ))}
        </ul>
        <p className="mt-4 flex items-start gap-2 text-sm text-ink-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden /> If you feel unwell, call your doctor. PharmiAI cannot judge symptoms.
        </p>
      </Card>

      <SectionTitle>Stock & price</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <Package className="size-5 text-green-700" aria-hidden />
          <div className="mt-2 text-2xl font-extrabold">{med.stockLeft}</div>
          <div className="text-sm text-ink-2">tablets · ~{daysLeft} days</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm font-bold text-ink-2">Jan Aushadhi generic</div>
          <div className="mt-1 text-2xl font-extrabold text-green-700">₹{med.genericPricePerStrip}</div>
          <div className="text-sm text-ink-2">
            vs <span className="line-through">₹{med.brandPricePerStrip}</span> · save ₹{yearly}/yr
          </div>
        </Card>
      </div>

      <p className="mt-6 flex items-start gap-2 px-1 text-xs text-ink-2">
        <BookOpen className="mt-0.5 size-4 shrink-0" aria-hidden /> Source: {med.source}. Information comes only from our checked database, never written by AI.
      </p>
      <div className="mt-6">
        <PillButton className="w-full" onClick={() => history.back()}>
          Done
        </PillButton>
      </div>
    </div>
  );
}
