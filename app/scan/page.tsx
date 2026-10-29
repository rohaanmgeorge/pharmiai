"use client";

import { AnimatePresence, motion } from "motion/react";
import { ImageUp, TriangleAlert, X, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn, StatChip } from "@/components/ui";
import { useClientValue } from "@/lib/client";

type Phase = "aiming" | "reading" | "done";
type Mode = "prescription" | "medicine";

/** Shrinks a photo to at most 1600px and JPEG, so uploads stay well under the 5 MB limit. */
async function toJpeg(source: CanvasImageSource, width: number, height: number): Promise<Blob> {
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read the photo"))), "image/jpeg", 0.85));
}

async function fileToJpeg(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // e.g. HEIC on some browsers: send as-is, the server checks it
  return toJpeg(bitmap, bitmap.width, bitmap.height);
}

function Bracket({ className }: { className: string }) {
  return <span className={`absolute size-12 border-white ${className}`} aria-hidden />;
}

export default function ScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState<"loading" | "on" | "off">("loading");
  const [phase, setPhase] = useState<Phase>("aiming");
  const initialMode = useClientValue<Mode>(() => (new URLSearchParams(window.location.search).get("mode") === "medicine" ? "medicine" : "prescription"), "prescription");
  const [modeChoice, setMode] = useState<Mode | null>(null);
  const mode = modeChoice ?? initialMode;
  const [result, setResult] = useState<{ count: number; needs: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCamera("on");
      } catch {
        setCamera("off"); // no camera / permission denied: show upload option
      }
    })();
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  async function upload(photo: Blob) {
    setPhase("reading");
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("image", photo, "photo.jpg");
      const patient = new URLSearchParams(window.location.search).get("patient");
      if (patient) form.append("patientId", patient);
      const res = await fetch(mode === "medicine" ? "/api/strips" : "/api/prescriptions", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Could not read the photo. Please try again.");
      setResult({ count: body.count ?? 1, needs: body.needsCheck ?? 0 });
      setPhase("done");
      setTimeout(() => router.push(mode === "medicine" ? `/strips/${body.stripId}` : `/review?id=${body.prescriptionId}`), 1100);
    } catch (e) {
      setError((e as Error).message);
      setPhase("aiming");
    }
  }

  const capture = async () => {
    const v = videoRef.current;
    if (camera !== "on" || !v || !v.videoWidth) {
      fileRef.current?.click();
      return;
    }
    upload(await toJpeg(v, v.videoWidth, v.videoHeight));
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-ink text-white">
      {/* Camera feed or a calm placeholder */}
      <video ref={videoRef} playsInline muted className="absolute inset-0 size-full object-cover" aria-hidden />
      {camera !== "on" && <div className="absolute inset-0 bg-gradient-to-b from-[#2b3a1f] via-ink to-ink" aria-hidden />}
      <div className="absolute inset-0 bg-black/25" aria-hidden />

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <Link href="/chat" aria-label="Close scanner" className="flex size-12 items-center justify-center rounded-full bg-white/15 backdrop-blur">
          <X className="size-6" aria-hidden />
        </Link>
        <AnimatePresence>
          {phase === "done" && result && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-end gap-2 text-ink">
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                <StatChip>{mode === "medicine" ? "Medicine read" : `${result.count} medicine${result.count === 1 ? "" : "s"} found`}</StatChip>
              </motion.div>
              {result.needs > 0 && (
                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                  <StatChip tone="warn">
                    <TriangleAlert className="size-4" aria-hidden /> {result.needs} need check
                  </StatChip>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {phase === "aiming" && (
          <button aria-label="Flash" className="flex size-12 items-center justify-center rounded-full bg-white/15 backdrop-blur">
            <Zap className="size-5" aria-hidden />
          </button>
        )}
      </div>

      {/* Frame */}
      <div className="absolute inset-x-8 top-[16%] bottom-[30%] mx-auto max-w-md">
        <div className="breathe relative size-full">
          <Bracket className="top-0 left-0 rounded-tl-[28px] border-t-[5px] border-l-[5px]" />
          <Bracket className="top-0 right-0 rounded-tr-[28px] border-t-[5px] border-r-[5px]" />
          <Bracket className="bottom-0 left-0 rounded-bl-[28px] border-b-[5px] border-l-[5px]" />
          <Bracket className="right-0 bottom-0 rounded-br-[28px] border-r-[5px] border-b-[5px]" />
        </div>
        {phase !== "done" && (
          <div className="absolute inset-x-4 top-4 bottom-4 overflow-hidden">
            {/* Full-height layer moved by translateY(0→100%) of its own height, carrying the line at its top. */}
            <div className="scanline absolute inset-0" style={{ ["--scan-distance" as string]: "100%" }}>
              <div className="h-1 w-full rounded-full bg-lime-500 shadow-[0_0_24px_6px_rgba(166,226,46,.6)]" />
            </div>
          </div>
        )}
        <AnimatePresence>
          {phase === "done" && (
            <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="absolute inset-0 flex items-center justify-center">
              <div className="flex size-24 items-center justify-center rounded-full bg-lime-500">
                <svg viewBox="0 0 24 24" className="size-12" aria-label="Done">
                  <motion.path
                    d="M5 12.5l4.5 4.5L19 7.5"
                    fill="none"
                    stroke="#1f2937"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
                  />
                </svg>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {camera === "off" && phase === "aiming" && (
          <p className="absolute inset-x-6 top-1/2 -translate-y-1/2 text-center text-white/80">
            Camera not available. Upload a photo of the {mode === "medicine" ? "strip or box" : "prescription"} instead.
          </p>
        )}
      </div>

      {/* Toast + controls */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-6 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-full bg-black/70 px-4 py-2 text-sm font-semibold backdrop-blur"
            role="status"
          >
            {phase === "aiming" ? (mode === "medicine" ? "Show the name and expiry date…" : "Please hold still…") : phase === "reading" ? "Reading twice to be sure…" : "Done — let's check together"}
          </motion.div>
        </AnimatePresence>
        {error && (
          <p role="alert" className="mx-6 max-w-sm rounded-sm bg-danger px-4 py-2 text-center text-sm font-semibold">
            {error}
          </p>
        )}
        {phase === "aiming" && (
          <div className="grid grid-cols-2 rounded-full bg-black/50 p-1 backdrop-blur" role="radiogroup" aria-label="What are you scanning?">
            {(["prescription", "medicine"] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={mode === m}
                onClick={() => setMode(m)}
                className={cn("min-h-11 rounded-full px-4 text-sm font-bold", mode === m ? "bg-lime-500 text-ink" : "text-white")}
              >
                {m === "prescription" ? "Prescription" : "Medicine strip"}
              </button>
            ))}
          </div>
        )}
        <div className="flex w-full max-w-sm items-center justify-between px-8">
          <button onClick={() => fileRef.current?.click()} aria-label="Upload photo" className="flex size-14 items-center justify-center rounded-full bg-white/15 backdrop-blur">
            <ImageUp className="size-6" aria-hidden />
          </button>
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={capture}
            disabled={phase !== "aiming"}
            aria-label={mode === "medicine" ? "Capture medicine strip" : "Capture prescription"}
            className="flex size-20 items-center justify-center rounded-full border-4 border-white"
          >
            <span className="size-16 rounded-full bg-white" />
          </motion.button>
          <span className="size-14" />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) upload(await fileToJpeg(f));
          }}
        />
      </div>
    </main>
  );
}
