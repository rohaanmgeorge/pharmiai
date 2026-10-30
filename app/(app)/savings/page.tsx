"use client";

import { ScanLine } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { type SavingsData, SavingsView } from "@/components/savings-view";
import { EmptyCard, ErrorCard, LoadingCards } from "@/components/states";
import { PageHeader, PillButton } from "@/components/ui";
import { patientQuery, useApi } from "@/lib/use-api";

export default function SavingsPage() {
  const [query] = useState(patientQuery);
  const { data, error, loading, reload } = useApi<SavingsData>(`/api/savings${query}`);

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Savings" subtitle="Brand price vs Jan Aushadhi generic" />
      <div className="mt-4">
        {loading && <LoadingCards count={2} />}
        {error && <ErrorCard message={error} onRetry={reload} />}
        {data && data.medicinesChecked === 0 && (
          <EmptyCard
            title="No verified medicines yet"
            body="Savings are worked out only for medicines you have confirmed."
            action={
              <Link href="/scan">
                <PillButton variant="green">
                  <ScanLine className="size-5" aria-hidden /> Scan a prescription
                </PillButton>
              </Link>
            }
          />
        )}
        {data && data.medicinesChecked > 0 && data.items.length === 0 && (
          <EmptyCard title="No cheaper generic found" body="None of your verified medicines has a Jan Aushadhi generic with the same ingredients and strength in our list, or a price is missing." />
        )}
        {data && data.items.length > 0 && <SavingsView data={data} query={query} />}
      </div>
      <p className="mt-3 px-1 text-sm text-ink-2">
        Prices per tablet = pack MRP ÷ pack size, from our checked price list. A generic has the same active ingredient and strength. Ask your doctor or pharmacist before switching.
      </p>
      {data && data.items.length > 0 && data.items.length < data.medicinesChecked && (
        <p className="mt-2 px-1 text-sm text-ink-2">Medicines without an exact generic or a known price are not counted.</p>
      )}
    </div>
  );
}
