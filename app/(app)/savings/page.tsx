"use client";

import { MapPin } from "lucide-react";
import { MedicineSummary, SavingsCard } from "@/components/cards";
import { Card, PageHeader, SectionTitle } from "@/components/ui";
import { medicines } from "@/lib/mock";

export default function SavingsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Savings" subtitle="Brand price vs Jan Aushadhi generic" />
      <div className="mt-4">
        <SavingsCard />
      </div>
      <p className="mt-3 px-1 text-sm text-ink-2">
        A generic has the same active ingredient and strength. Ask your doctor or pharmacist before switching.
      </p>

      <SectionTitle>Your verified medicines</SectionTitle>
      <div className="space-y-3">
        {medicines.map((m) => (
          <MedicineSummary key={m.id} med={m} />
        ))}
      </div>

      <SectionTitle>Nearby Jan Aushadhi Kendras</SectionTitle>
      <Card className="divide-y divide-line p-0">
        {[
          ["Jan Aushadhi Kendra — Demo Road", "0.8 km · open till 9 PM"],
          ["Jan Aushadhi Kendra — Sample Junction", "2.1 km · open till 8 PM"],
        ].map(([name, meta]) => (
          <div key={name} className="flex items-center gap-3 p-4">
            <span className="flex size-10 items-center justify-center rounded-full bg-lime-300">
              <MapPin className="size-5" aria-hidden />
            </span>
            <div>
              <div className="font-bold">{name}</div>
              <div className="text-sm text-ink-2">{meta}</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
