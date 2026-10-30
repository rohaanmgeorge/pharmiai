"use client";

import { useState } from "react";
import { usePrefs } from "@/components/providers";
import { EmptyCard, ErrorCard, LoadingCards } from "@/components/states";
import { PageHeader, SectionTitle } from "@/components/ui";
import { CareCircle } from "@/components/family/care-circle";
import { ElderSummaryCard } from "@/components/family/elder-summary-card";
import { LivePill } from "@/components/family/live-pill";
import { PersonDetail } from "@/components/family/person-detail";
import type { DashboardData } from "@/components/family/types";
import { useDesktop } from "@/components/family/use-desktop";
import { useLive, useSnapshot } from "@/lib/use-live";

// Live family dashboard. Phone: cards stacked, tap opens /family/<id>.
// Laptop: list on the left, the selected person on the right.
export default function FamilyPage() {
  const { t } = usePrefs();
  const { data, error, loading, updatedAt, reload } = useSnapshot<DashboardData>("/api/dashboard");
  const people = data?.people ?? [];
  const status = useLive(
    people.map((p) => p.id),
    reload,
  );
  const desktop = useDesktop();
  const [picked, setPicked] = useState<string | null>(null);
  const selected = people.find((p) => p.id === picked)?.id ?? people[0]?.id ?? null;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={t("family")} subtitle="Family Care Circle" right={people.length > 0 && <LivePill status={status} updatedAt={updatedAt} />} />

      <div className="lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-8">
        <div>
          <SectionTitle>People you care for</SectionTitle>
          {loading && <LoadingCards count={2} />}
          {error && !data && <ErrorCard message={error} onRetry={reload} />}
          {data && people.length === 0 && (
            <EmptyCard
              kind="family"
              title="No one to show yet"
              body="When a family member adds you to their care circle and allows access, their day appears here live."
            />
          )}
          <div className="space-y-3">
            {people.map((p) => (
              <ElderSummaryCard key={p.id} person={p} selected={p.id === selected} onSelect={setPicked} />
            ))}
          </div>

          <CareCircle onChange={reload} />
        </div>

        {/* Right pane only on laptop; phones open /family/<id> instead. */}
        <div className="hidden lg:block">
          {desktop && selected && (
            <div className="sticky top-6 mt-6">
              <PersonDetail key={selected} patientId={selected} showLive={false} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
