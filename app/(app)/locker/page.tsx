"use client";

import { CalendarRange, ScanLine } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type LockerItem, LockerCard } from "@/components/locker/locker-card";
import { SearchBar } from "@/components/locker/search-bar";
import { EmptyCard, ErrorCard, LoadingCards } from "@/components/states";
import { PageHeader, PillButton } from "@/components/ui";
import { useApi } from "@/lib/use-api";

type LockerData = { patientId: string; prescriptions: LockerItem[] };

/** Patient id from "?patient=<id>" (caregiver view), or "" for yourself. */
const patientParam = () => (typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("patient") ?? ""));

export default function LockerPage() {
  const [patient] = useState(patientParam);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showDates, setShowDates] = useState(false);

  // Wait until typing pauses before searching, so we don't call the API on every key.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300);
    return () => clearTimeout(t);
  }, [text]);

  const params = new URLSearchParams();
  if (patient) params.set("patient", patient);
  if (q) params.set("q", q);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const { data, error, loading, reload } = useApi<LockerData>(`/api/locker?${params}`);
  const list = data?.prescriptions ?? [];
  const filtering = Boolean(q || from || to);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Prescription locker" subtitle="Every approved prescription, newest first" />

      <div className="mt-2 flex gap-2">
        <div className="flex-1">
          <SearchBar value={text} onChange={setText} placeholder="Search medicine or doctor" />
        </div>
        <PillButton aria-label="Filter by date" aria-expanded={showDates} onClick={() => setShowDates(!showDates)} className="w-12 px-0">
          <CalendarRange className="size-5" aria-hidden />
        </PillButton>
      </div>
      {showDates && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-sm font-bold text-ink-2">
            From
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="mt-1 min-h-12 w-full rounded-sm border border-line bg-surface px-3 font-semibold text-ink" />
          </label>
          <label className="text-sm font-bold text-ink-2">
            To
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="mt-1 min-h-12 w-full rounded-sm border border-line bg-surface px-3 font-semibold text-ink" />
          </label>
        </div>
      )}
      <p className="mt-2 px-1 text-xs text-ink-2">Search looks only at confirmed medicines and doctor names.</p>

      <div className="mt-4 space-y-3">
        {loading && <LoadingCards />}
        {error && <ErrorCard message={error} onRetry={reload} />}
        {data && list.length === 0 &&
          (filtering ? (
            <EmptyCard title="Nothing found" body="Try another medicine, ingredient or doctor name, or clear the dates." />
          ) : (
            <EmptyCard
              title="Your locker is empty"
              body="Prescriptions appear here after every medicine on them is checked and approved."
              action={
                <Link href="/scan">
                  <PillButton variant="green">
                    <ScanLine className="size-5" aria-hidden /> Scan a prescription
                  </PillButton>
                </Link>
              }
            />
          ))}
        {list.map((item, i) => (
          <LockerCard key={item.id} item={item} index={i} href={`/locker/${item.id}`} />
        ))}
      </div>
    </div>
  );
}
