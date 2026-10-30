"use client";

import { ChevronRight, PiggyBank } from "lucide-react";
import Link from "next/link";
import { CountUp } from "@/components/cards";
import { Card } from "@/components/ui";

export type SavingItem = {
  scheduleId: string;
  name: string;
  strength: string;
  dosesPerDay: number;
  brandPerTablet: number;
  yearly: number;
  generic: { code: string; name: string; perTablet: number; mrp: number; packSize: number };
};

export type SavingsData = { total: number; items: SavingItem[]; medicinesChecked: number };

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Real-data savings card: yearly total (counts up) and one row per medicine. */
export function SavingsView({ data, query = "" }: { data: SavingsData; query?: string }) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="bg-gradient-to-br from-lime-300 to-lime-500/70 p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-ink">
          <PiggyBank className="size-4" aria-hidden /> Yearly savings with Jan Aushadhi generics
        </div>
        <div className="mt-2 text-[2.5rem] leading-none font-extrabold tracking-tight text-ink">
          <CountUp value={data.total} prefix="₹" />
        </div>
        <div className="mt-1 text-sm text-ink/70">Same active ingredient and strength · verified medicines only</div>
      </div>
      {data.items.length > 0 && (
        <ul className="divide-y divide-line">
          {data.items.map((m) => (
            <li key={m.scheduleId}>
              <Link href={`/meds/${m.scheduleId}${query}`} className="flex min-h-16 items-center gap-3 px-5 py-3 hover:bg-surface-2/60">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{m.name}</div>
                  <div className="truncate text-sm text-ink-2">
                    Generic: {m.generic.name} · {m.dosesPerDay}/day
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div>
                    <span className="text-ink-2 line-through">{rupees(m.brandPerTablet)}</span>{" "}
                    <span className="font-bold text-green-700">{rupees(m.generic.perTablet)}</span>
                    <span className="text-ink-2">/tab</span>
                  </div>
                  <div className="font-bold">save ₹{m.yearly.toLocaleString("en-IN")}/yr</div>
                </div>
                <ChevronRight className="size-4 shrink-0 text-ink-2" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
