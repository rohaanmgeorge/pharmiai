"use client";

import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { PillButton } from "@/components/ui";
import { api } from "@/lib/api-client";

/** Big "I'm going" button. The family's SOS screen updates live when this is tapped. */
export function AckButton({ token, ackedAt }: { token: string; ackedAt: string | null }) {
  const [done, setDone] = useState(Boolean(ackedAt));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <p className="flex min-h-16 items-center justify-center gap-2 rounded-full bg-ok-soft text-lg font-extrabold text-ok">
        <CheckCircle2 className="size-6" aria-hidden /> Thank you — they know you&apos;re going
      </p>
    );
  }

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/ack/${token}`, { method: "POST" });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PillButton variant="green" size="lg" className="min-h-16 w-full text-xl" disabled={busy} onClick={go}>
        {busy ? "Sending…" : "I'm going"}
      </PillButton>
      {error && <p className="mt-3 rounded-sm bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
    </div>
  );
}
