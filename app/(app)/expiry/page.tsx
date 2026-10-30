"use client";

import { motion } from "motion/react";
import { CheckCheck, ChevronRight, ScanLine } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { EmptyCard, ErrorCard, LoadingCards } from "@/components/states";
import { ExpiryBadge, type ExpiryBadgeKind } from "@/components/strips/expiry-badge";
import { Card, PageHeader, PillButton } from "@/components/ui";
import { api } from "@/lib/api-client";
import { patientQuery, useApi } from "@/lib/use-api";

type StripRow = { id: string; name: string; status: string; expiry: string | null; badge: ExpiryBadgeKind; daysLeft: number | null; quantity: number | null };
type ExpiryData = { patientId: string; strips: StripRow[]; canManage: boolean };

function whenText(s: StripRow) {
  if (!s.expiry) return "Expiry not confirmed yet — tap to check";
  if (s.badge === "expired") return `Expired ${s.expiry}. Please don't use it.`;
  if (s.daysLeft === 0) return `Expires today (${s.expiry})`;
  return `Good until end of ${s.expiry} · ${s.daysLeft} days`;
}

export default function ExpiryPage() {
  const [query] = useState(patientQuery);
  const { data, error, loading, reload, setData } = useApi<ExpiryData>(`/api/strips${query}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function finish(id: string) {
    setBusy(id);
    setActionError(null);
    try {
      await api(`/api/strips/${id}/finish`, { method: "POST" });
      setData((d) => d && { ...d, strips: d.strips.filter((s) => s.id !== id) });
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const scanLink = `/scan?mode=medicine${query ? `&${query.slice(1)}` : ""}`;
  const scanButton = (
    <Link href={scanLink}>
      <PillButton variant="green">
        <ScanLine className="size-5" aria-hidden /> Scan a strip
      </PillButton>
    </Link>
  );

  return (
    <div className="mx-auto max-w-xl pt-4">
      <PageHeader title="Expiry" subtitle="Medicines at home, soonest expiry first." />
      <div className="my-4">{scanButton}</div>

      {loading && <LoadingCards />}
      {error && <ErrorCard message={error} onRetry={reload} />}
      {data && data.strips.length === 0 && (
        <EmptyCard title="No medicine strips yet" body="Scan a strip or box. We read the name and expiry twice and you confirm." />
      )}
      {actionError && <p className="mb-3 text-sm font-semibold text-danger">{actionError}</p>}

      <div className="space-y-3">
        {data?.strips.map((s, i) => (
          <motion.div key={s.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
            <Card className="p-4">
              <Link href={`/strips/${s.id}${query}`} className="flex min-h-12 items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-bold">{s.name}</div>
                  <div className="text-sm text-ink-2">{whenText(s)}</div>
                  {s.quantity !== null && <div className="text-sm text-ink-2">{s.quantity} tablets</div>}
                </div>
                <ExpiryBadge badge={s.badge} />
                <ChevronRight className="size-5 shrink-0 text-ink-2" aria-hidden />
              </Link>
              {data.canManage && (
                <PillButton size="md" className="mt-3 w-full" disabled={busy === s.id} onClick={() => finish(s.id)}>
                  <CheckCheck className="size-5" aria-hidden /> {busy === s.id ? "Saving…" : "Mark finished"}
                </PillButton>
              )}
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
