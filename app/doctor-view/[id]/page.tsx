"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { formatDate } from "@/components/locker/locker-card";
import type { LockerDetail } from "@/components/locker/types";
import { useApi } from "@/lib/use-api";

/** Keeps the screen on while the doctor reads it. Quietly does nothing where unsupported. */
function useWakeLock() {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") lock = await navigator.wakeLock.request("screen");
      } catch {
        // Battery saver or no permission: the screen may dim, which is fine.
      }
    };
    // The browser drops the lock when the tab is hidden; ask again when we come back.
    const onVisible = () => document.visibilityState === "visible" && request();
    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, []);
}

// "Show to doctor": white, huge, read-only. The only action is Close.
export default function DoctorViewPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading } = useApi<LockerDetail>(`/api/locker/${id}`);
  useWakeLock();
  const rx = data?.prescription;

  return (
    <main className="fixed inset-0 overflow-y-auto bg-white text-black">
      <div className="mx-auto max-w-3xl px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-16">
        <div className="flex justify-end">
          <Link href={`/locker/${id}`} className="inline-flex min-h-14 items-center gap-2 rounded-full border-2 border-black px-6 text-lg font-bold">
            <X className="size-6" aria-hidden /> Close
          </Link>
        </div>

        {loading && <p className="mt-10 text-2xl font-bold">Loading…</p>}
        {error && <p className="mt-10 text-2xl font-bold">{error}</p>}

        {rx && data && (
          <>
            <header className="mt-6 border-b-2 border-black pb-4">
              <p className="text-2xl font-bold">{rx.doctorName ?? "Doctor not added"}</p>
              <p className="text-xl">{formatDate(rx.date)}</p>
            </header>
            {data.medicines.length === 0 && <p className="mt-8 text-2xl">No confirmed medicines.</p>}
            <ul>
              {data.medicines.map((m) => (
                <li key={m.id} className="border-b border-neutral-300 py-6">
                  <p className="text-[2.25rem] leading-tight font-extrabold">{m.name}</p>
                  <p className="mt-1 text-2xl">{m.strength}</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {m.doseCode}
                    {m.doseMeaning && ` — ${m.doseMeaning}`}
                    {m.food && ` · ${m.food} food`}
                  </p>
                  <p className="text-2xl">{m.durationDays} days</p>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-lg text-neutral-600">Confirmed by the family in PharmiAI. Not medical advice.</p>
          </>
        )}
      </div>
    </main>
  );
}
