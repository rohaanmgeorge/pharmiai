"use client";

import { motion } from "motion/react";
import { BookOpen, CalendarCheck, ChevronLeft, Clock, Package, PiggyBank, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PillStrip } from "@/components/cards";
import { usePrefs } from "@/components/providers";
import { ErrorCard, LoadingCards } from "@/components/states";
import { Card, PillButton, SectionTitle, StatusBadge } from "@/components/ui";
import { patientQuery, useApi } from "@/lib/use-api";

type MedDetail = {
  id: string;
  name: string;
  ingredients: string[];
  strength: string;
  form: string;
  doseCode: string | null;
  doseMeaning: string | null;
  food: "before" | "after" | null;
  durationDays: number | null;
  slotTimes: string[];
  startDate: string;
  endDate: string;
  active: boolean;
  stock: number;
  daysLeft: number | null;
  photoUrl: string | null;
  uses: string | null;
  sideEffects: string | null;
  source: string;
  reviewer: string;
  reviewedAt: string;
  duplicates: { ingredient: string; names: string[] }[];
  saving: { brandPerTablet: number; yearly: number; generic: { name: string; perTablet: number; mrp: number; packSize: number } } | null;
};

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function MedicineClient() {
  const { id } = useParams<{ id: string }>();
  const { t } = usePrefs();
  const [query] = useState(patientQuery);
  const { data: med, error, loading, reload } = useApi<MedDetail>(`/api/meds/${id}`);

  const back = (
    <Link href={`/today${query}`} className="mb-3 inline-flex min-h-12 items-center gap-1 font-bold text-ink-2">
      <ChevronLeft className="size-5" aria-hidden /> Back
    </Link>
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl">
        {back}
        <LoadingCards />
      </div>
    );
  }
  if (error || !med) {
    return (
      <div className="mx-auto max-w-2xl">
        {back}
        <ErrorCard message={error ?? "Medicine not found"} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      {back}

      <motion.div layoutId={`med-${med.id}`} className="rounded-card bg-surface p-5 shadow-card">
        <div className="flex items-center gap-4">
          {med.photoUrl ? (
            // The family's own photo of this strip.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={med.photoUrl} alt={`Photo of ${med.name} strip`} className="size-18 shrink-0 rounded-sm object-cover" />
          ) : (
            <PillStrip size={72} />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold">{med.name}</h1>
            <p className="text-ink-2">
              {med.ingredients.join(" + ")} {med.strength} · {med.form}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusBadge status="verified" />
        </div>
      </motion.div>

      {med.duplicates.length > 0 && (
        <Card className="mt-4 flex items-start gap-3 border-2 border-warn p-4">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warn" aria-hidden />
          <div>
            <div className="font-bold">Same ingredient in another medicine</div>
            {med.duplicates.map((d) => (
              <p key={d.ingredient} className="text-sm text-ink-2">
                {d.ingredient} is also in {d.names.join(", ")}. Please ask your doctor or pharmacist before taking both.
              </p>
            ))}
          </div>
        </Card>
      )}

      <SectionTitle>How to take</SectionTitle>
      <Card className="grid grid-cols-3 divide-x divide-line p-0 text-center">
        <div className="p-4">
          <div className="text-xs font-bold text-ink-2">Pattern</div>
          <div className="text-xl font-extrabold">{med.doseCode}</div>
        </div>
        <div className="p-4">
          <div className="text-xs font-bold text-ink-2">Times</div>
          <div className="font-bold">{med.slotTimes.join(", ")}</div>
        </div>
        <div className="p-4">
          <div className="text-xs font-bold text-ink-2">Course</div>
          <div className="text-xl font-extrabold">{med.durationDays} days</div>
        </div>
      </Card>
      <p className="mt-2 px-1 text-sm text-ink-2">
        <Clock className="mr-1 inline size-4" aria-hidden />
        {med.doseMeaning ? `${med.doseCode} means ${med.doseMeaning}` : `Pattern ${med.doseCode}`}
        {med.food ? `, ${t(med.food === "after" ? "afterFood" : "beforeFood").toLowerCase()}` : ""} — as written by your doctor.
      </p>

      {med.uses && (
        <>
          <SectionTitle>What it&apos;s for</SectionTitle>
          <Card className="p-5">
            <p className="text-lg">{med.uses}</p>
          </Card>
        </>
      )}

      {med.sideEffects && (
        <>
          <SectionTitle>Common side effects</SectionTitle>
          <Card className="p-5">
            <p>{med.sideEffects}</p>
            <p className="mt-4 flex items-start gap-2 text-sm text-ink-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden /> If you feel unwell, call your doctor. PharmiAI cannot judge symptoms.
            </p>
          </Card>
        </>
      )}

      <SectionTitle>Stock & course</SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        <Card className="p-4">
          <Package className="size-5 text-green-700" aria-hidden />
          <div className="mt-2 text-2xl font-extrabold">{med.stock}</div>
          <div className="text-sm text-ink-2">tablets{med.daysLeft !== null ? ` · ~${med.daysLeft} day${med.daysLeft === 1 ? "" : "s"}` : ""}</div>
        </Card>
        <Card className="p-4">
          <CalendarCheck className="size-5 text-green-700" aria-hidden />
          <div className="mt-2 text-lg font-extrabold">{day(med.endDate)}</div>
          <div className="text-sm text-ink-2">{med.active ? "course ends" : "course ended"}</div>
        </Card>
      </div>

      {med.saving && (
        <>
          <SectionTitle>Jan Aushadhi generic</SectionTitle>
          <Card className="flex items-start gap-3 p-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lime-300">
              <PiggyBank className="size-5 text-ink" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-bold">{med.saving.generic.name}</div>
              <div className="text-sm text-ink-2">
                <span className="font-bold text-green-700">{rupees(med.saving.generic.perTablet)}</span>/tablet vs{" "}
                <span className="line-through">{rupees(med.saving.brandPerTablet)}</span> · save about ₹{med.saving.yearly.toLocaleString("en-IN")} a year
              </div>
              <div className="mt-1 text-xs text-ink-2">Same ingredient and strength. Ask your doctor or pharmacist before switching.</div>
            </div>
          </Card>
        </>
      )}

      <p className="mt-6 flex items-start gap-2 px-1 text-xs text-ink-2">
        <BookOpen className="mt-0.5 size-4 shrink-0" aria-hidden /> Source: {med.source} · checked by {med.reviewer} on {day(med.reviewedAt)}. Information comes only from our checked database, never written by AI.
      </p>
      <div className="mt-6">
        <PillButton className="w-full" onClick={() => history.back()}>
          Done
        </PillButton>
      </div>
    </div>
  );
}
