"use client";

import { AnimatePresence, motion } from "motion/react";
import { BellRing, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PillButton } from "@/components/ui";
import { api, newOpId } from "@/lib/api-client";

type Dose = { id: string; name: string; time: string; state: string };

// Shows a reminder inside the app when a dose is due, even if phone notifications are blocked.
// Checks every 60 s while the app is open (and when it comes back to the front).

function minutesNow() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** A short, gentle two-tone chime (no audio file needed). Phones may block it until the first tap. */
function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.25);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.25 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.4);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.25);
      o.stop(ctx.currentTime + i * 0.25 + 0.45);
    });
  } catch {}
  navigator.vibrate?.([200, 100, 200]);
}

export function DueBanner() {
  const [due, setDue] = useState<Dose | null>(null);
  const [busy, setBusy] = useState(false);
  const announced = useRef(new Set<string>());

  useEffect(() => {
    let stopped = false;
    async function check() {
      if (document.visibilityState !== "visible") return;
      const data = await api<{ doses: Dose[] }>("/api/today").catch(() => null);
      if (!data || stopped) return;
      const now = minutesNow();
      // Due = pending, time has come, and not more than 30 min ago (after that it's "missed").
      const next = data.doses.find((d) => d.state === "pending" && toMin(d.time) <= now && now - toMin(d.time) <= 30) ?? null;
      setDue(next);
      if (next && !announced.current.has(next.id)) {
        announced.current.add(next.id);
        chime();
      }
    }
    check();
    const timer = setInterval(check, 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  async function act(action: "taken" | "snoozed") {
    if (!due) return;
    setBusy(true);
    await api(`/api/doses/${due.id}/act`, { method: "POST", json: { action, opId: newOpId() } }).catch(() => {});
    setBusy(false);
    setDue(null);
  }

  return (
    <AnimatePresence>
      {due && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-50 mx-auto max-w-md rounded-card bg-ink p-4 text-white shadow-float"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-lime-500 text-ink">
              <BellRing className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-bold">Time for {due.name}</div>
              <div className="text-sm text-white/80">{due.time} dose</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <PillButton size="sm" className="border-white/40 text-white" disabled={busy} onClick={() => act("snoozed")}>
              Snooze 10 min
            </PillButton>
            <PillButton size="sm" variant="lime" disabled={busy} onClick={() => act("taken")}>
              <Check className="size-4" aria-hidden /> Taken
            </PillButton>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
