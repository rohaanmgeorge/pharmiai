"use client";

import { motion } from "motion/react";
import { ChevronRight, FileText, Stethoscope } from "lucide-react";
import Link from "next/link";
import { cn } from "@/components/ui";
import { uiLocale } from "@/lib/client";

export type LockerItem = {
  id: string;
  date: string;
  doctorName: string | null;
  medicineCount: number;
  medicines: string[];
  active: boolean;
  thumbnailUrl: string | null;
};

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString(uiLocale(), { day: "numeric", month: "short", year: "numeric" });

/** One prescription in the locker (DESIGN.md §7). Enters 40 ms after the previous card. */
export function LockerCard({ item, href, index }: { item: LockerItem; href: string; index: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, delay: index * 0.04, ease: [0.2, 0.8, 0.2, 1] }}>
      <Link href={href} className="flex min-h-12 items-center gap-3 rounded-card bg-surface p-4 shadow-card">
        {item.thumbnailUrl ? (
          // Signed link, valid 60 s — fine for a thumbnail that loads right away.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.thumbnailUrl} alt="" className="size-14 shrink-0 rounded-sm object-cover" />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-2">
            <FileText className="size-6" aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{formatDate(item.date)}</span>
            <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-bold", item.active ? "bg-lime-300 text-ink" : "bg-surface-2 text-ink-2")}>
              {item.active ? "Active" : "Completed"}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1 truncate text-sm text-ink-2">
            <Stethoscope className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{item.doctorName ?? "Doctor not added"}</span>
          </div>
          <div className="truncate text-sm text-ink-2">
            {item.medicineCount} medicine{item.medicineCount === 1 ? "" : "s"}
            {item.medicines.length > 0 && ` · ${item.medicines.join(", ")}`}
          </div>
        </div>
        <ChevronRight className="size-5 shrink-0 text-ink-2" aria-hidden />
      </Link>
    </motion.div>
  );
}
