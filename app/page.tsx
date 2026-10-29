"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { OnboardingIllustration } from "@/components/illustrations";
import { usePrefs } from "@/components/providers";
import { cn, PillButton, Toggle } from "@/components/ui";
import { LANGS } from "@/lib/i18n";

const SLIDES = [
  { title: "Scan a prescription", body: "Take a photo. PharmiAI reads it twice and asks you to confirm anything unclear." },
  { title: "Never miss a dose", body: "Gentle reminders with a photo of the strip. Tap Taken, Skip or Snooze." },
  { title: "Care together", body: "Family can help from far away — only with the elder's consent." },
];

export default function Welcome() {
  const router = useRouter();
  const { t, lang, setLang, elder, setElder } = usePrefs();
  const [slide, setSlide] = useState(0);
  const last = slide === SLIDES.length - 1;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex justify-center gap-1 rounded-full bg-white/70 p-1 shadow-card" role="radiogroup" aria-label="Language">
        {LANGS.map((l) => (
          <button
            key={l.code}
            role="radio"
            aria-checked={lang === l.code}
            onClick={() => setLang(l.code)}
            className={cn("relative min-h-11 flex-1 rounded-full px-3 text-sm font-bold", lang === l.code ? "text-ink" : "text-ink-2")}
          >
            {lang === l.code && <motion.span layoutId="lang-pill" className="absolute inset-0 rounded-full bg-lime-500" />}
            <span className="relative">{l.label}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            className="flex flex-col items-center"
          >
            <OnboardingIllustration variant={slide as 0 | 1 | 2} />
            <h1 className="mt-6 text-[2.25rem] leading-tight font-light tracking-tight">{SLIDES[slide].title}</h1>
            <p className="mt-3 max-w-xs text-lg text-ink-2">{SLIDES[slide].body}</p>
          </motion.div>
        </AnimatePresence>
        <div className="mt-6 flex gap-2" aria-hidden>
          {SLIDES.map((_, i) => (
            <motion.span key={i} animate={{ width: i === slide ? 24 : 8 }} className={cn("h-2 rounded-full", i === slide ? "bg-green-700" : "bg-line")} />
          ))}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between rounded-card bg-white p-4 shadow-card">
        <div className="text-left">
          <div className="font-bold">Elder mode</div>
          <div className="text-sm text-ink-2">Bigger text, bigger buttons, one Talk button</div>
        </div>
        <Toggle checked={elder} onChange={setElder} label="Elder mode" />
      </div>

      <PillButton
        variant="green"
        size="lg"
        className="w-full"
        onClick={() => (last ? router.push(elder ? "/elder" : "/chat") : setSlide(slide + 1))}
      >
        {last ? t("getStarted") : "Next"} <ArrowRight className="size-5" aria-hidden />
      </PillButton>
      {!last && (
        <button onClick={() => router.push(elder ? "/elder" : "/chat")} className="mt-2 min-h-12 font-semibold text-ink-2">
          Skip
        </button>
      )}
      <p className="mt-2 text-center text-xs text-ink-2">{t("disclaimer")}</p>
    </main>
  );
}
