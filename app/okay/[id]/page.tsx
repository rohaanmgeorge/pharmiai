"use client";

import { motion } from "motion/react";
import { Check, Heart } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import type { CheckData } from "@/components/family/types";
import { PillButton } from "@/components/ui";
import { api } from "@/lib/api-client";
import { useApi } from "@/lib/use-api";

// "Are you okay?" — full screen, calm: one giant button, no countdown, no flashing.
// Opened from the notification (or its "I'm okay" action answers without opening).
export default function OkayPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading } = useApi<CheckData>(`/api/checks/${id}`);
  const [answered, setAnswered] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function sayOkay() {
    setBusy(true);
    setSendError(null);
    try {
      await api(`/api/checks/${id}/ok`, { method: "POST" });
      setAnswered(true);
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const open = data && (data.check.state === "asking" || data.check.state === "escalating");
  const done = answered || (data && !open);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10 text-center">
      {loading && <p className="text-lg text-ink-2">One moment…</p>}
      {error && (
        <div className="space-y-4">
          <p className="text-lg font-bold">{error}</p>
          <Link href="/today">
            <PillButton size="lg">Go to Today</PillButton>
          </Link>
        </div>
      )}

      {data && !data.isPatient && (
        <div className="space-y-4">
          <p className="text-lg">This question is for {data.patient.name}.</p>
          <Link href={`/checks/${id}`}>
            <PillButton size="lg" variant="green">
              See the check
            </PillButton>
          </Link>
        </div>
      )}

      {data && data.isPatient && !done && (
        <>
          <Heart className="size-10 text-green-700" aria-hidden />
          <h1 className="mt-4 text-[2.5rem] leading-tight font-bold">Are you okay?</h1>
          <p className="mt-3 max-w-sm text-lg text-ink-2">We noticed some missed medicines. Tap the button so your family knows you are fine.</p>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={sayOkay}
            disabled={busy}
            className="mt-10 flex size-40 flex-col items-center justify-center rounded-full bg-lime-500 text-2xl font-extrabold text-ink shadow-float disabled:opacity-60"
          >
            <Check className="mb-1 size-10" aria-hidden />
            I&apos;m okay
          </motion.button>
          {sendError && <p className="mt-6 rounded-sm bg-danger-soft px-4 py-3 font-semibold text-danger">{sendError}</p>}
          <p className="mt-10 max-w-sm text-sm text-ink-2">If you need help now, use the SOS button in the app.</p>
        </>
      )}

      {data && data.isPatient && done && (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
          <span className="mx-auto flex size-20 items-center justify-center rounded-full bg-ok-soft text-ok">
            <Check className="size-10" aria-hidden />
          </span>
          <h1 className="text-[2rem] font-bold">Thank you</h1>
          <p className="text-lg text-ink-2">{answered || data.check.state === "ok" ? "Your family will see that you are okay." : "This check is already closed."}</p>
          <Link href="/today">
            <PillButton size="lg" variant="green">
              Go to Today
            </PillButton>
          </Link>
        </motion.div>
      )}
    </main>
  );
}
