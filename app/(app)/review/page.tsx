"use client";

import { motion } from "motion/react";
import { BellRing, CircleHelp, Eye, Layers, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PrescriptionPaper } from "@/components/illustrations";
import { usePrefs } from "@/components/providers";
import { AiHeadline, cn, ExpandableCard, PillButton, StatusBadge } from "@/components/ui";
import { scanResult, type ScannedItem, type Status } from "@/lib/mock";

function Field({ label, value, missing, onFill }: { label: string; value: string | null; missing?: boolean; onFill?: (v: string) => void }) {
  return (
    <div className={cn("rounded-sm p-3", missing ? "border-2 border-dashed border-warn bg-warn-soft/50" : "bg-surface-2")}>
      <div className="text-xs font-bold text-ink-2">{label}</div>
      {value ? (
        <div className="font-bold">{value}</div>
      ) : (
        // Zero-Guess: never auto-filled. The person must type it from the prescription.
        <input aria-label={label} onChange={(e) => onFill?.(e.target.value)} placeholder="Not readable — type it" className="w-full bg-transparent font-bold text-warn outline-none placeholder:text-warn/80" />
      )}
    </div>
  );
}

function ItemCard({ item, status, onConfirm }: { item: ScannedItem; status: Status; onConfirm: () => void }) {
  const { t } = usePrefs();
  const [choice, setChoice] = useState<string | null>(null);
  const [typedDuration, setTypedDuration] = useState("");
  const name = item.candidates?.find((c) => c.id === choice)?.brand ?? item.readingA;
  const missingField = !item.doseCode || (!item.durationDays && !typedDuration.trim());
  const doseLabel = item.doseCode === "OD" ? "Once a day" : item.doseCode;

  return (
    <ExpandableCard
      defaultOpen={item.status !== "verified"}
      header={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-bold">{status === "not_recognized" ? "Unclear medicine" : name}</div>
            <div className="truncate text-sm text-ink-2">
              {item.doseCode ? `${doseLabel} · ` : ""}
              {item.durationDays ? `${item.durationDays} days` : "duration missing"}
            </div>
          </div>
          <StatusBadge status={status} layoutId={`badge-${item.id}`} />
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-sm bg-surface-2 p-3">
            <div className="flex items-center gap-1 text-xs font-bold text-ink-2">
              <Eye className="size-3.5" aria-hidden /> Reading 1
            </div>
            <div className="font-semibold">{item.readingA}</div>
          </div>
          <div className="rounded-sm bg-surface-2 p-3">
            <div className="flex items-center gap-1 text-xs font-bold text-ink-2">
              <Layers className="size-3.5" aria-hidden /> Reading 2
            </div>
            <div className={cn("font-semibold", item.readingA !== item.readingB && "text-warn")}>{item.readingB}</div>
          </div>
        </div>

        {item.reason && status !== "verified" && (
          <p className="flex items-start gap-2 text-sm text-ink-2">
            <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden /> {item.reason}
          </p>
        )}

        {item.duplicateOf && (
          <p className="rounded-sm bg-warn-soft p-3 text-sm font-semibold text-warn">
            Same active ingredient as {item.duplicateOf} (Metformin). Please ask your doctor before taking both.
          </p>
        )}

        {status === "not_recognized" && (
          <p className="rounded-sm bg-surface-2 p-3 text-sm">
            We could not recognise this medicine, so we won&apos;t remind you about it or explain it. Please show the prescription to your pharmacist.
          </p>
        )}

        {status === "needs_check" && item.candidates && item.candidates.length > 1 && (
          <fieldset>
            <legend className="mb-2 text-sm font-bold">Which one is on the prescription? We never pick for you.</legend>
            <div className="space-y-2">
              {item.candidates.map((c) => (
                <label
                  key={c.id}
                  className={cn("flex min-h-14 cursor-pointer items-center gap-3 rounded-sm border-2 p-3", choice === c.id ? "border-green-700 bg-ok-soft/40" : "border-line")}
                >
                  <input type="radio" name={item.id} checked={choice === c.id} onChange={() => setChoice(c.id)} className="size-5 accent-[#3f7d20]" />
                  <span>
                    <span className="font-bold">{c.brand}</span>
                    <span className="block text-sm text-ink-2">
                      {c.ingredient} {c.strength}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {status !== "not_recognized" && (
          <div className="grid grid-cols-3 gap-2 text-sm">
            <Field label="Dose" value={doseLabel} missing={!item.doseCode} />
            <Field
              label="Duration"
              value={item.durationDays ? `${item.durationDays} days` : null}
              missing={!item.durationDays}
              onFill={setTypedDuration}
            />
            <Field label="Food" value={item.food ? t(item.food === "after" ? "afterFood" : "beforeFood") : "Any time"} />
          </div>
        )}

        {status === "needs_check" && (
          <PillButton
            variant="green"
            className="w-full"
            disabled={missingField || Boolean(item.candidates && item.candidates.length > 1 && !choice)}
            onClick={onConfirm}
          >
            <ShieldCheck className="size-5" aria-hidden /> I checked the prescription — confirm
          </PillButton>
        )}
      </div>
    </ExpandableCard>
  );
}

export default function ReviewPage() {
  const router = useRouter();
  const [statuses, setStatuses] = useState<Record<string, Status>>(Object.fromEntries(scanResult.map((i) => [i.id, i.status])));
  const verified = Object.values(statuses).filter((s) => s === "verified").length;
  const needs = Object.values(statuses).filter((s) => s === "needs_check").length;

  return (
    <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
      <div className="hidden lg:sticky lg:top-6 lg:block lg:self-start lg:pt-8">
        <PrescriptionPaper />
        <p className="mt-4 text-center text-sm text-ink-2">Your photo is private. Only you and your caregivers can see it.</p>
      </div>

      <div className="pt-6">
        <AiHeadline sub="Please check each medicine. Reminders are only set for verified ones.">Here&apos;s what I found in your prescription.</AiHeadline>

        <div className="my-6 flex flex-wrap justify-center gap-2">
          <span className="rounded-full bg-ok-soft px-3 py-1.5 text-sm font-bold text-ok">{verified} verified</span>
          <span className="rounded-full bg-warn-soft px-3 py-1.5 text-sm font-bold text-warn">{needs} need check</span>
          <span className="rounded-full bg-surface-2 px-3 py-1.5 text-sm font-bold text-ink-2">1 not recognized</span>
        </div>

        <div className="mb-4 lg:hidden">
          <details className="rounded-card bg-white p-4 shadow-card">
            <summary className="min-h-8 cursor-pointer font-bold">View prescription photo</summary>
            <div className="mt-4">
              <PrescriptionPaper />
            </div>
          </details>
        </div>

        <motion.div layout className="space-y-3">
          {scanResult.map((item) => (
            <ItemCard key={item.id} item={item} status={statuses[item.id]} onConfirm={() => setStatuses((s) => ({ ...s, [item.id]: "verified" }))} />
          ))}
        </motion.div>

        <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] mt-6 mr-[4.75rem] lg:bottom-6 lg:mr-0">
          <PillButton variant="green" size="lg" className="w-full shadow-float" onClick={() => router.push("/today")}>
            <BellRing className="size-5 shrink-0" aria-hidden /> Remind me ({verified} verified)
          </PillButton>
        </div>
        <p className="mt-3 text-center text-xs text-ink-2">Every reading and confirmation is saved in a safety log.</p>
      </div>
    </div>
  );
}
