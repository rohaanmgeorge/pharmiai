"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PersonDetail } from "@/components/family/person-detail";

// Member detail (phone, or a direct link from a missed-dose notification).
export function MemberClient() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-5xl">
      <Link href="/family" className="mb-3 inline-flex min-h-12 items-center gap-1 font-bold text-ink-2">
        <ChevronLeft className="size-5" aria-hidden /> Family
      </Link>
      <PersonDetail patientId={id} />
    </div>
  );
}
