"use client";

import { ChevronRight, ShieldCheck, TriangleAlert, UserPlus } from "lucide-react";
import Link from "next/link";
import { usePrefs } from "@/components/providers";
import { Avatar, Card, ConsentChip, PageHeader, PillButton, SectionTitle } from "@/components/ui";
import { caredFor, circle } from "@/lib/mock";

export default function FamilyPage() {
  const { t } = usePrefs();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={t("family")}
        subtitle="Family Care Circle"
        right={
          <PillButton size="sm" variant="lime">
            <UserPlus className="size-4" aria-hidden /> Invite
          </PillButton>
        }
      />

      <SectionTitle>People you care for</SectionTitle>
      <div className="grid gap-3 md:grid-cols-2">
        {caredFor.map((p) => (
          <Link key={p.id} href={`/family/${p.id}`}>
            <Card className="p-5 transition-transform hover:-translate-y-0.5">
              <div className="flex items-center gap-3">
                <Avatar name={p.name} color={p.color} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="text-lg font-bold">{p.relation}</div>
                  <div className="text-sm text-ink-2">
                    {p.name} · {p.age}
                  </div>
                </div>
                <ChevronRight className="size-5 text-ink-2" aria-hidden />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-sm bg-surface-2 p-3">
                  <div className="text-xs font-bold text-ink-2">This week</div>
                  <div className="text-xl font-extrabold">{p.adherence}%</div>
                </div>
                <div className="rounded-sm bg-surface-2 p-3">
                  <div className="text-xs font-bold text-ink-2">Next</div>
                  <div className="truncate font-bold">{p.next}</div>
                </div>
              </div>
              {p.alert ? (
                <div className="mt-3 flex items-center gap-2 rounded-full bg-danger-soft px-3 py-2 text-sm font-bold text-danger">
                  <TriangleAlert className="size-4" aria-hidden /> {p.alert}
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2 rounded-full bg-ok-soft px-3 py-2 text-sm font-bold text-ok">
                  <ShieldCheck className="size-4" aria-hidden /> All doses on track
                </div>
              )}
            </Card>
          </Link>
        ))}
      </div>

      <SectionTitle>Amma&apos;s care circle</SectionTitle>
      <Card className="divide-y divide-line p-0">
        {circle.map((m) => (
          <div key={m.id} className="flex items-center gap-3 p-4">
            <Avatar name={m.name} color={m.color} />
            <div className="min-w-0 flex-1">
              <div className="font-bold">{m.name}</div>
              <div className="text-sm text-ink-2">
                {m.relation} · <span className="capitalize">{m.role}</span> · {m.lang}
              </div>
            </div>
            <ConsentChip consent={m.consent} />
          </div>
        ))}
      </Card>
      <p className="mt-3 px-1 text-sm text-ink-2">
        Caregivers can manage medicines. Viewers can only see. Amma must accept before anyone gets access, and can remove them any time.
      </p>
    </div>
  );
}
