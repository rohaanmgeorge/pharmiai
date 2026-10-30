"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronLeft, FlaskConical, MapPin, Phone, ShieldCheck, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, PillButton, Toggle } from "@/components/ui";
import { ErrorCard } from "@/components/states";
import { SosContactList } from "@/components/emergency/sos-contact-list";
import type { SosView } from "@/components/emergency/sos-load";
import { useSosLive } from "@/components/emergency/use-sos-live";
import { api } from "@/lib/api-client";
import { useClientValue } from "@/lib/client";

const COUNTDOWN = 5;
type Place = { lat: number; lng: number } | null;

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
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-live="polite">
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

/** Ask for the location once, with a short timeout. Denied or slow → continue without it. */
function getPlace(): Promise<Place> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    const giveUp = setTimeout(() => resolve(null), 6000);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(giveUp);
        resolve({ lat: p.coords.latitude, lng: p.coords.longitude });
      },
      () => {
        clearTimeout(giveUp);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60_000 },
    );
  });
}

/** 108 (ambulance) and 112 (emergency) — always on screen, in every phase. */
function EmergencyNumbers() {
  return (
    <div className="grid grid-cols-2 gap-3">
      <a href="tel:108" className="flex min-h-16 items-center justify-center gap-2 rounded-full bg-danger text-lg font-extrabold text-white shadow-float">
        <Phone className="size-5" aria-hidden /> 108
      </a>
      <a href="tel:112" className="flex min-h-16 items-center justify-center gap-2 rounded-full border-2 border-danger bg-surface text-lg font-extrabold text-danger">
        <Phone className="size-5" aria-hidden /> 112
      </a>
    </div>
  );
}

function TestBanner() {
  return (
    <p className="flex items-center justify-center gap-1.5 rounded-full bg-warn-soft px-4 py-2 text-sm font-bold text-warn">
      <FlaskConical className="size-4" aria-hidden /> Test — no one is alarmed
    </p>
  );
}

export default function SOSPage() {
  // The URL is only known in the browser. Until then show just the emergency numbers.
  const search = useClientValue(() => window.location.search, null);
  if (search === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-end px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <EmergencyNumbers />
      </main>
    );
  }
  return <SosScreen params={new URLSearchParams(search)} />;
}

// ?test=1 · ?patient=<elder> (caregiver acting for them) · ?id=<sos> (opened from a notification)
function SosScreen({ params }: { params: URLSearchParams }) {
  const router = useRouter();
  const patient = params.get("patient");
  const [test, setTest] = useState(params.has("test"));
  const [phase, setPhase] = useState<"countdown" | "sending" | "sent" | "error">(params.get("id") ? "sent" : "countdown");
  const [left, setLeft] = useState(COUNTDOWN);
  const [sos, setSos] = useState<SosView | null>(null);
  const [sosId, setSosId] = useState<string | null>(params.get("id"));
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [ending, setEnding] = useState(false);
  const place = useRef<Promise<Place> | null>(null);

  // Start finding the location while the countdown runs, so it's ready at zero.
  useEffect(() => {
    if (phase === "countdown" && !place.current) place.current = getPlace();
  }, [phase]);

  const send = useCallback(async () => {
    setPhase("sending");
    setError(null);
    const where = await (place.current ?? Promise.resolve(null));
    try {
      const view = await api<SosView>("/api/sos", { method: "POST", json: { patientId: patient ?? undefined, lat: where?.lat, lng: where?.lng, isTest: test } });
      setSos(view);
      setSosId(view.id);
      setPhase("sent");
    } catch (e) {
      setError((e as Error).message);
      setPhase("error");
    }
  }, [patient, test]);

  useEffect(() => {
    if (phase !== "countdown") return;
    const id = setTimeout(() => {
      if (left <= 1) send();
      else setLeft(left - 1);
    }, 1000);
    return () => clearTimeout(id);
  }, [left, phase, send]);

  // Opened from a notification (?id=): load the existing alert.
  useEffect(() => {
    if (!sosId || sos) return;
    api<SosView>(`/api/sos/${sosId}`)
      .then(setSos)
      .catch((e: Error) => {
        setError(e.message);
        setPhase("error");
      });
  }, [sosId, sos]);

  const update = useCallback((fn: (v: SosView) => SosView) => setSos((v) => (v ? fn(v) : v)), []);
  useSosLive(sos?.state === "active" ? sosId : null, update);

  async function end(kind: "resolve" | "cancel") {
    if (!sos) return;
    setEnding(true);
    try {
      const res = await api<{ state: SosView["state"] }>(`/api/sos/${sos.id}/${kind}`, { method: "POST" });
      setSos({ ...sos, state: res.state });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setEnding(false);
    }
  }

  function cancelCountdown() {
    if (window.history.length > 1) router.back();
    else router.push("/today");
  }

  const going = sos?.contacts.find((c) => c.ackedAt);
  const isTest = sos ? sos.isTest : test;
  const ended = sos && sos.state !== "active";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between">
        <Link href="/today" aria-label="Back" className="flex size-12 items-center justify-center rounded-full bg-surface shadow-card">
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <span className="size-12" />
      </div>
      {isTest && (
        <div className="mt-3">
          <TestBanner />
        </div>
      )}

      <AnimatePresence mode="wait">
        {(phase === "countdown" || phase === "sending") && (
          <motion.section key="cd" exit={{ opacity: 0 }} className="flex flex-1 flex-col items-center justify-center text-center">
            <h1 className="text-[2rem] leading-tight font-light">{phase === "sending" ? "Sending SOS…" : "Sending SOS to your family"}</h1>
            <p className="mt-2 text-ink-2">with your location, if your phone allows it</p>
            <div className="my-8">
              <CountdownRing seconds={phase === "sending" ? 0 : left} />
            </div>
            <PillButton size="lg" className="w-full max-w-xs" onClick={cancelCountdown} disabled={phase === "sending"}>
              <X className="size-5" aria-hidden /> Cancel — I&apos;m OK
            </PillButton>
            <button onClick={send} disabled={phase === "sending"} className="mt-3 min-h-12 px-4 font-bold text-danger disabled:opacity-40">
              Send now
            </button>
            <label className="mt-4 flex min-h-12 items-center gap-3 text-sm font-bold text-ink-2">
              <Toggle checked={test} onChange={setTest} label="Test mode" /> Test mode (practice)
            </label>
            <div className="mt-6 w-full">
              <EmergencyNumbers />
            </div>
          </motion.section>
        )}

        {phase === "error" && (
          <motion.section key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col gap-4 pt-6">
            <EmergencyNumbers />
            <ErrorCard message={error ?? "Could not send SOS."} onRetry={sosId ? () => location.reload() : send} />
          </motion.section>
        )}

        {phase === "sent" && !sos && (
          <motion.section key="loading" className="flex flex-1 flex-col gap-4 pt-6">
            <EmergencyNumbers />
            <p className="text-center text-ink-2">Loading the alert…</p>
          </motion.section>
        )}

        {phase === "sent" && sos && !ended && (
          <motion.section key="sent" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-1 flex-col gap-4 pt-6">
            <div className="text-center">
              <h1 className="text-[2rem] leading-tight font-light">{going ? `${going.name} is on the way.` : "Alert sent. Stay calm."}</h1>
              <p className="mt-2 text-ink-2">{sos.isTest ? "This is a test — messages say TEST." : "Family in your circle got a notification. Tap below to tell each contact."}</p>
            </div>

            <EmergencyNumbers />

            <SosContactList contacts={sos.contacts} sent={sent} onSend={(id) => setSent((s) => new Set(s).add(id))} active />

            <Card className="flex items-center gap-3 p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lime-300">
                <MapPin className="size-5 text-ink" aria-hidden />
              </span>
              <div className="flex-1">
                <div className="font-bold">{sos.mapUrl ? "Location shared" : "Location not shared"}</div>
                <div className="text-sm text-ink-2">{sos.mapUrl ? "Included in every message as a Maps link." : "Location was off or slow. Say where you are when you call."}</div>
              </div>
            </Card>

            {error && <p className="rounded-sm bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{error}</p>}
            <div className="mt-auto space-y-2">
              <PillButton variant="green" size="lg" className="w-full" disabled={ending} onClick={() => end("resolve")}>
                <ShieldCheck className="size-5" aria-hidden /> I&apos;m safe — end alert
              </PillButton>
              <PillButton variant="ghost" className="w-full" disabled={ending} onClick={() => end("cancel")}>
                It was a mistake — cancel
              </PillButton>
            </div>
          </motion.section>
        )}

        {phase === "sent" && ended && (
          <motion.section key="safe" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <div className="flex size-24 items-center justify-center rounded-full bg-ok-soft text-ok">
              <ShieldCheck className="size-12" aria-hidden />
            </div>
            <h1 className="text-[2rem] font-light">{sos.state === "cancelled" ? "Alert cancelled" : "Alert ended"}</h1>
            <p className="text-ink-2">If you messaged anyone, let them know you are safe.</p>
            <div className="w-full">
              <EmergencyNumbers />
            </div>
            <PillButton className="mt-4" onClick={() => router.push("/today")}>
              Back to home
            </PillButton>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
