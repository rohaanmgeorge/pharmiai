"use client";

import { motion } from "motion/react";
import { ChevronLeft, MonitorSmartphone, ShieldCheck, Stethoscope, Utensils } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatDate } from "@/components/locker/locker-card";
import type { LockerDetail } from "@/components/locker/types";
import { usePrefs } from "@/components/providers";
import { ErrorCard, LoadingCards } from "@/components/states";
import { Card, cn, PillButton, SectionTitle, StatusBadge } from "@/components/ui";
import { useApi } from "@/lib/use-api";

// Read-only for everyone: the locker never edits or deletes a prescription.
export default function LockerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = usePrefs();
  const { data, error, loading, reload } = useApi<LockerDetail>(`/api/locker/${id}`);
  const rx = data?.prescription;

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/locker" className="inline-flex min-h-12 items-center gap-1 font-bold text-green-700">
        <ChevronLeft className="size-5" aria-hidden /> Locker
      </Link>

      {loading && <LoadingCards count={2} />}
      {error && <ErrorCard message={error} onRetry={reload} />}

      {rx && data && (
        <>
          <header className="mt-1 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-[1.75rem] leading-9 font-bold">{formatDate(rx.date)}</h1>
              <p className="flex items-center gap-1 text-ink-2">
                <Stethoscope className="size-4" aria-hidden /> {rx.doctorName ?? "Doctor not added"}
              </p>
            </div>
            <span className={cn("rounded-full px-3 py-1 text-sm font-bold", rx.active ? "bg-lime-300 text-ink" : "bg-surface-2 text-ink-2")}>
              {rx.active ? "Active" : "Completed"}
            </span>
          </header>

          <Link href={`/doctor-view/${rx.id}`} className="mt-4 block">
            <PillButton variant="green" size="lg" className="w-full">
              <MonitorSmartphone className="size-5" aria-hidden /> Show to doctor
            </PillButton>
          </Link>

          {rx.photoUrl && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4">
              <a href={rx.photoUrl} target="_blank" rel="noreferrer" aria-label="Open the prescription photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={rx.photoUrl} alt="Prescription photo" className="max-h-96 w-full rounded-card bg-surface-2 object-contain shadow-card" />
              </a>
              <p className="mt-1 px-1 text-xs text-ink-2">Photo link is private and expires in a minute. Reopen this page to see it again.</p>
            </motion.div>
          )}

          <SectionTitle>Confirmed medicines</SectionTitle>
          {data.medicines.length === 0 ? (
            <Card className="p-4 text-ink-2">No confirmed medicines on this prescription.</Card>
          ) : (
            <div className="space-y-3">
              {data.medicines.map((m) => (
                <Card key={m.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-lg font-bold">{m.name}</div>
                      <div className="text-sm text-ink-2">
                        {m.strength} · {m.form}
                      </div>
                    </div>
                    <StatusBadge status="verified" />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <span className="font-semibold">
                      {m.doseCode}
                      {m.doseMeaning && ` · ${m.doseMeaning}`}
                    </span>
                    <span>{m.durationDays} days</span>
                    {m.food && (
                      <span className="inline-flex items-center gap-1">
                        <Utensils className="size-3.5" aria-hidden /> {t(m.food === "after" ? "afterFood" : "beforeFood")}
                      </span>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}

          {rx.approvedAt && (
            <p className="mt-6 flex items-center gap-2 px-1 text-sm text-ink-2">
              <ShieldCheck className="size-4 text-ok" aria-hidden />
              Approved by {rx.approvedBy ?? "a family member"} on {formatDate(rx.approvedAt)}
            </p>
          )}
          <p className="mt-2 px-1 text-sm text-ink-2">{t("disclaimer")}</p>
        </>
      )}
    </div>
  );
}
