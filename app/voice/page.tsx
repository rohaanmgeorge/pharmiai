"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronLeft, Mic, Square, Volume2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AgentCards, GeneralInfoNote, pendingFrom } from "@/components/chat/agent-cards";
import { askAgent, type AgentAnswer, type Turn } from "@/components/chat/ask-agent";
import { usePrefs } from "@/components/providers";
import { AiHeadline, cn, PillButton } from "@/components/ui";
import { type Lang, LANGS } from "@/lib/i18n";
import { api } from "@/lib/api-client";
import { sayAloud, transcribe, unlockAudio, useMicLevel, useRecorder, useSpeechToText } from "@/lib/voice";

const BARS = 28;

const DEMO_SCRIPT = {
  en: "What is my next tablet today?",
  ml: "ഇന്ന് എന്റെ അടുത്ത ഗുളിക ഏതാണ്?",
  hi: "आज मेरी अगली गोली कौन सी है?",
};

const OFFLINE: Record<Lang, string> = {
  en: "Sorry, I couldn't reach the assistant. Please try again.",
  ml: "ക്ഷമിക്കണം, സഹായിയുമായി ബന്ധപ്പെടാനായില്ല. വീണ്ടും ശ്രമിക്കൂ.",
  hi: "माफ़ कीजिए, सहायक से जुड़ नहीं पाए। फिर से कोशिश करें।",
};

const NO_VOICE: Record<Lang, string> = {
  en: "Voice not available, reading on screen",
  ml: "ശബ്ദം ലഭ്യമല്ല, സ്ക്രീനിൽ വായിക്കൂ",
  hi: "आवाज़ उपलब्ध नहीं, स्क्रीन पर पढ़ें",
};

/** Waveform bars driven by mic level via rAF → direct style writes (no React re-render per frame). */
function Waveform({ level, active }: { level: React.RefObject<number>; active: boolean }) {
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = performance.now() / 1000;
      barsRef.current.forEach((el, i) => {
        if (!el) return;
        const center = 1 - Math.abs(i - BARS / 2) / (BARS / 2); // taller in the middle
        const wobble = 0.55 + 0.45 * Math.sin(t * 8 + i * 0.7);
        const s = active ? 0.12 + level.current * center * wobble * 1.6 : 0.12;
        el.style.transform = `scaleY(${Math.min(1, s)})`;
      });
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [active, level]);

  return (
    <div className="flex h-24 items-center justify-center gap-[5px]" aria-hidden>
      {Array.from({ length: BARS }).map((_, i) => (
        <span
          key={i}
          ref={(el) => {
            barsRef.current[i] = el;
          }}
          className="h-full w-[5px] rounded-full bg-lime-500 will-change-transform"
          style={{ transform: "scaleY(0.12)", opacity: 0.55 + 0.45 * (1 - Math.abs(i - BARS / 2) / (BARS / 2)) }}
        />
      ))}
    </div>
  );
}

type Phase = "idle" | "listening" | "thinking" | "reply";

export default function VoicePage() {
  const { t, lang, setLang } = usePrefs();
  const speechLang = LANGS.find((l) => l.code === lang)!.speech;
  const stt = useSpeechToText(speechLang, DEMO_SCRIPT[lang]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [noVoice, setNoVoice] = useState(false);
  const [reply, setReply] = useState<AgentAnswer | null>(null);
  // This visit's conversation, in memory only (never saved): lets "yes" answer a confirm-back.
  const [history, setHistory] = useState<Turn[]>([]);
  // "sarvam" = server voice (works in Malayalam/Hindi on any phone); "browser" = the phone's own.
  const [engine, setEngine] = useState<"sarvam" | "browser">("browser");
  const [heard, setHeard] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recorder = useRecorder();
  const mic = useMicLevel(phase === "listening" && engine === "browser");
  const level = engine === "sarvam" ? recorder.level : mic.level;

  const [ready, setReady] = useState(false);
  useEffect(() => {
    api<{ sarvam: boolean }>("/api/voice/status")
      .then((v) => setEngine(v.sarvam ? "sarvam" : "browser"))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (phase !== "listening") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  const begin = async () => {
    unlockAudio(); // must happen inside the tap, so the spoken reply is allowed to play later
    setSeconds(0);
    setHeard("");
    setVoiceError(null);
    if (engine === "sarvam") {
      if (await recorder.start()) setPhase("listening");
      return;
    }
    setPhase("listening");
    stt.start();
  };
  // Opened from a Siri Shortcut ("Hey Siri, Pharmi") as /voice?listen=1: start listening right away.
  // If the phone needs a tap first, the mic button is still there.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (!ready || autoStarted.current) return;
    if (new URLSearchParams(window.location.search).get("listen") !== "1") return;
    autoStarted.current = true;
    setTimeout(begin, 0); // after this render, like a tap (runs once: autoStarted)
  });

  const cancel = () => {
    recorder.cancel();
    stt.cancel();
    setPhase("idle");
  };
  // Send what was heard (or a Yes/No tap) to the assistant, then show and speak the reply.
  async function ask(text: string) {
    if (!text) return setPhase("idle");
    setPhase("thinking");
    const pending = pendingFrom(reply?.cards);
    let answer: AgentAnswer;
    try {
      answer = await askAgent({ text, lang, history, pending });
    } catch {
      answer = { speech: OFFLINE[lang], cards: [] };
    }
    setHistory((h) => [...h, { role: "user" as const, text }, { role: "model" as const, text: answer.speech }].slice(-10));
    setReply(answer);
    setPhase("reply");
    setNoVoice(!(await sayAloud(answer.speech, lang, speechLang)));
  }

  const confirm = async () => {
    if (engine === "sarvam") {
      const audio = await recorder.stop();
      if (!audio) return setPhase("idle");
      setPhase("thinking");
      try {
        const text = await transcribe(audio, lang);
        setHeard(text);
        if (!text) {
          setVoiceError("I didn't catch that. Please tap the mic and try again.");
          return setPhase("idle");
        }
        return ask(text);
      } catch (e) {
        setVoiceError((e as Error).message);
        return setPhase("idle");
      }
    }
    stt.stop();
    ask(`${stt.finalText} ${stt.interim}`.trim());
  };

  const words = stt.finalText ? stt.finalText.split(" ") : [];
  const timer = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-5 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between">
        <Link href="/chat" aria-label="Back to chat" className="flex size-12 items-center justify-center rounded-full bg-white shadow-card">
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold shadow-card">
          <Mic className="size-4 text-green-700" aria-hidden /> {t("voiceMode")}
        </span>
        <select
          value={lang}
          onChange={(e) => setLang(e.target.value as typeof lang)}
          aria-label="Voice language"
          className="h-12 rounded-full bg-white px-3 text-sm font-bold shadow-card"
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
        <AnimatePresence mode="wait">
          {phase === "reply" ? (
            <motion.div key="reply" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full space-y-5">
              <AiHeadline>
                {/* Word-by-word reveal (MotionConfig turns movement off for reduced motion). */}
                {(reply?.speech ?? "").split(" ").map((w, i) => (
                  <motion.span key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06, duration: 0.2 }}>
                    {w}{" "}
                  </motion.span>
                ))}
              </AiHeadline>
              {reply?.general && <GeneralInfoNote />}
              {reply && reply.cards.length > 0 && (
                <div className="space-y-3 text-left">
                  <AgentCards cards={reply.cards} confirmActive onConfirm={(answer) => ask(answer)} big />
                </div>
              )}
              {noVoice ? (
                <p className="rounded-full bg-warn-soft px-4 py-2 text-sm font-semibold text-warn" role="status">
                  {NO_VOICE[lang]}
                </p>
              ) : (
                <PillButton
                  onClick={async () => {
                    unlockAudio();
                    setNoVoice(!(await sayAloud(reply?.speech ?? "", lang, speechLang)));
                  }}
                >
                  <Volume2 className="size-4" aria-hidden /> Say it again
                </PillButton>
              )}
            </motion.div>
          ) : (
            <motion.p
              key="transcript"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[2.4rem] leading-tight font-light tracking-tight sm:text-[3rem]"
              aria-live="polite"
            >
              {phase === "idle" && <span className="text-ink-2">{voiceError ?? recorder.error ?? "Tap the mic and ask about your medicines"}</span>}
              {phase === "thinking" && <span className="text-ink-2">{heard ? `“${heard}”` : "Let me check…"}</span>}
              {phase === "listening" && engine === "sarvam" && <span className="text-ink-2">{t("listening")} Tap ✓ when you finish.</span>}
              {phase === "listening" && engine === "browser" && (
                <>
                  {words.map((w, i) => (
                    <motion.span key={`${i}-${w}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="text-ink">
                      {w}{" "}
                    </motion.span>
                  ))}
                  <span className="text-muted">{stt.interim || (words.length === 0 ? t("listening") : "")}</span>
                  <span className="caret ml-1 inline-block h-[0.9em] w-[3px] translate-y-[0.1em] rounded bg-green-700" />
                </>
              )}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      <Waveform level={level} active={phase === "listening"} />

      <div className="mt-6 flex items-center justify-center gap-8">
        <PillButton aria-label="Cancel" className="size-16 !p-0" onClick={cancel} disabled={phase === "idle"}>
          <X className="size-6" aria-hidden />
        </PillButton>

        {phase === "listening" ? (
          <motion.button whileTap={{ scale: 0.94 }} onClick={confirm} aria-label="Stop listening" className="relative flex size-24 items-center justify-center rounded-full bg-danger text-white shadow-float">
            <span className="pulse-ring absolute inset-0 rounded-full bg-danger" aria-hidden />
            <Square className="relative size-8 fill-white" aria-hidden />
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={begin}
            disabled={phase === "thinking"}
            aria-label="Start talking"
            className={cn("flex size-24 items-center justify-center rounded-full bg-lime-500 text-ink shadow-float", phase === "thinking" && "opacity-50")}
          >
            <Mic className="size-9" aria-hidden />
          </motion.button>
        )}

        <PillButton aria-label="Send" variant="green" className="size-16 !p-0" onClick={confirm} disabled={phase !== "listening"}>
          <Check className="size-6" aria-hidden />
        </PillButton>
      </div>
      <div className="mt-3 text-center font-mono text-sm font-bold text-ink-2" aria-live="off">
        {phase === "listening" ? timer : "00:00"}
      </div>
      <p className="mt-3 text-center text-xs text-ink-2">
        {engine === "sarvam" ? "Indian-language voice (Sarvam AI)." : stt.supported ? (mic.real ? "Using your microphone" : "") : "Speech recognition not available in this browser — showing a demo."}{" "}
        {t("disclaimer")}
      </p>
    </main>
  );
}
