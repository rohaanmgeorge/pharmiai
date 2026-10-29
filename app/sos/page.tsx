"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, FlaskConical, MapPin, Phone, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useClientValue } from "@/lib/client";
import { type SosContactState, SOSStatusCard } from "@/components/cards";
import { Card, PillButton } from "@/components/ui";
import { contacts } from "@/lib/mock";

const COUNTDOWN = 5;

/** Calm circular countdown: one ring shrinking smoothly, big number, no flashing. */
function CountdownRing({ seconds }: { seconds: number }) {
  const r = 110;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-64">
      <svg viewBox="0 0 240 240" className="size-full -rotate-90" aria-hidden>
        <circle cx="120" cy="120" r={r} fill="none" stroke="var(--danger-soft)" strokeWidth="14" />
        <motion.circle
          cx="120"
          cy="120"
          r={r}
          fill="none"
          stroke="var(--danger)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: 0 }}
          animate={{ strokeDashoffset: c }}
          transition={{ duration: COUNTDOWN, ease: "linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={seconds}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.3 }}
            className="text-[5.5rem] leading-none font-extrabold text-danger"
          >
            {seconds}
          </motion.span>
        </AnimatePresence>
        <span className="mt-1 font-bold text-ink-2">seconds</span>
      </div>
    </div>
  );
}

export default function SOSPage() {
  const router = useRouter();
  const test = useClientValue(() => new URLSearchParams(window.location.search).has("test"), false);
  const [left, setLeft] = useState(COUNTDOWN);
  const [phase, setPhase] = useState<"countdown" | "sent" | "safe">("countdown");
  const [states, setStates] = useState<Record<string, SosContactState>>({});

  useEffect(() => {
    if (phase !== "countdown") return;
    const id = setTimeout(() => {
      if (left <= 1) setPhase("sent");
      else setLeft(left - 1);
    }, 1000);
    return () => clearTimeout(id);
  }, [left, phase]);

  // Design mode: simulate contacts receiving the alert and one acknowledging.
  useEffect(() => {
    if (phase !== "sent") return;
    const timers = [
      setTimeout(() => setStates({ c1: "notified", c2: "notifying", c3: "notifying" }), 900),
      setTimeout(() => setStates({ c1: "notified", c2: "notified", c3: "notified" }), 1800),
      setTimeout(() => setStates({ c1: "going", c2: "notified", c3: "notified" }), 3600),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between">
        <Link href="/chat" aria-label="Back" className="flex size-12 items-center justify-center rounded-full bg-white shadow-card">
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        {test && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warn-soft px-4 py-2 text-sm font-bold text-warn">
            <FlaskConical className="size-4" aria-hidden /> Test mode
          </span>
        )}
        <span className="size-12" />
      </div>

      <AnimatePresence mode="wait">
        {phase === "countdown" && (
          <motion.section key="cd" exit={{ opacity: 0 }} className="flex flex-1 flex-col items-center justify-center text-center">
            <h1 className="text-[2rem] leading-tight font-light">Sending SOS to your family</h1>
            <p className="mt-2 text-ink-2">with your live location</p>
            <div className="my-8">
              <CountdownRing seconds={left} />
            </div>
            <PillButton size="lg" className="w-full max-w-xs" onClick={() => router.back()}>
              Cancel — I&apos;m OK
            </PillButton>
            <button onClick={() => setPhase("sent")} className="mt-3 min-h-12 font-bold text-danger">
              Send now
            </button>
          </motion.section>
        )}

        {phase === "sent" && (
          <motion.section key="sent" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-1 flex-col gap-4 pt-6">
            <div className="text-center">
              <h1 className="text-[2rem] leading-tight font-light">
                {states.c1 === "going" ? "Anjali is on the way." : "Alert sent. Stay calm."}
              </h1>
              <p className="mt-2 text-ink-2">{test ? "This was a test — contacts saw TEST." : "We'll keep trying until someone responds."}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <a href="tel:108" className="flex min-h-16 items-center justify-center gap-2 rounded-full bg-danger text-lg font-extrabold text-white shadow-float">
                <Phone className="size-5" aria-hidden /> 108
              </a>
              <a href="tel:112" className="flex min-h-16 items-center justify-center gap-2 rounded-full border-2 border-danger text-lg font-extrabold text-danger">
                <Phone className="size-5" aria-hidden /> 112
              </a>
            </div>

            <SOSStatusCard contacts={contacts} states={states} />

            <Card className="flex items-center gap-3 p-4">
              <span className="flex size-10 items-center justify-center rounded-full bg-lime-300">
                <MapPin className="size-5" aria-hidden />
              </span>
              <div className="flex-1">
                <div className="font-bold">Location shared</div>
                <div className="text-sm text-ink-2">Updated a few seconds ago · ±15 m</div>
              </div>
            </Card>

            <PillButton variant="green" size="lg" className="mt-auto w-full" onClick={() => setPhase("safe")}>
              <ShieldCheck className="size-5" aria-hidden /> I&apos;m safe — end alert
            </PillButton>
          </motion.section>
        )}

        {phase === "safe" && (
          <motion.section key="safe" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="flex size-24 items-center justify-center rounded-full bg-ok-soft text-ok">
              <ShieldCheck className="size-12" aria-hidden />
            </div>
            <h1 className="mt-6 text-[2rem] font-light">Alert ended</h1>
            <p className="mt-2 text-ink-2">Your contacts were told you are safe.</p>
            <PillButton className="mt-8" onClick={() => router.push("/chat")}>
              Back to home
            </PillButton>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
