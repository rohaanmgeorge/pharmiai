"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefillCard } from "@/components/refill-card";
import type { RefillsData } from "@/components/refill/types";
import { EmptyCard, ErrorCard, LoadingCards } from "@/components/states";
import { PageHeader } from "@/components/ui";
import { api } from "@/lib/api-client";
import { patientQuery, useApi } from "@/lib/use-api";

// Refill suggestions. They are created by the scheduler (deterministic run-out date); this
// screen only lets the family review, snooze, order and record what they bought.
export default function RefillsPage() {
  const router = useRouter();
  const [query] = useState(patientQuery);
  const { data, error, loading, reload, setData } = useApi<RefillsData>(`/api/refills${query}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [actError, setActError] = useState<string | null>(null);

  async function later(id: string) {
    setBusy(id);
    setActError(null);
    try {
      await api(`/api/refills/${id}/later`, { method: "POST" });
      setData((d) => d && { ...d, refills: d.refills.map((r) => (r.id === id ? { ...r, state: "later" } : r)) });
    } catch (e) {
      setActError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const list = data?.refills ?? [];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Refills" subtitle="Medicines that are running low" />
      {actError && <p className="mt-3 rounded-sm bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{actError}</p>}
      <div className="mt-4 space-y-3">
        {loading && <LoadingCards count={2} />}
        {error && <ErrorCard message={error} onRetry={reload} />}
        {data && list.length === 0 && <EmptyCard title="Nothing to refill" body="We'll let you know a few days before any medicine runs out." />}
        <AnimatePresence initial={false}>
          {list.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <RefillCard
                name={r.medicine.name}
                strength={r.medicine.strength}
                daysLeft={r.daysLeft}
                state={r.state}
                generic={r.generic}
                approvedByName={r.approvedBy?.name}
                busy={busy === r.id}
                // Viewers are read-only: no actions, just a link to see the details.
                onReview={data?.canManage ? () => router.push(`/refills/${r.id}`) : undefined}
                onLater={data?.canManage && r.state === "open" ? () => later(r.id) : undefined}
              />
              {!data?.canManage && (
                <Link href={`/refills/${r.id}`} className="mt-1 inline-flex min-h-12 items-center px-2 font-bold text-green-700">
                  View details
                </Link>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
