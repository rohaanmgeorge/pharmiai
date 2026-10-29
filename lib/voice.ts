"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Browser-only voice (PLAN.md decision 3–4). Web Speech API types are not in TS's DOM lib.
type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getRecognitionCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Speech-to-text. Falls back to a scripted demo transcript when the browser has no
 * speech recognition (iOS in some modes, Firefox) so the design can still be shown.
 */
export function useSpeechToText(lang: string, demoScript: string) {
  const [finalText, setFinalText] = useState("");
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(true);
  const recRef = useRef<Recognition | null>(null);
  const demoTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopDemo = () => {
    if (demoTimer.current) clearInterval(demoTimer.current);
    demoTimer.current = null;
  };

  const start = useCallback(() => {
    setFinalText("");
    setInterim("");
    const Ctor = getRecognitionCtor();
    setSupported(Boolean(Ctor));
    setListening(true);

    if (!Ctor) {
      // Demo: reveal the script word by word, last word stays "in progress".
      const words = demoScript.split(" ");
      let i = 0;
      demoTimer.current = setInterval(() => {
        i++;
        setFinalText(words.slice(0, Math.max(0, i - 1)).join(" "));
        setInterim(words[i - 1] ?? "");
        if (i > words.length) {
          setFinalText(demoScript);
          setInterim("");
          stopDemo();
        }
      }, 320);
      return;
    }

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let fin = "";
      let mid = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript;
        else mid += r[0].transcript;
      }
      setFinalText(fin.trim());
      setInterim(mid.trim());
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }, [lang, demoScript]);

  const stop = useCallback(() => {
    stopDemo();
    recRef.current?.stop();
    setListening(false);
  }, []);

  const cancel = useCallback(() => {
    stopDemo();
    recRef.current?.abort();
    setListening(false);
    setFinalText("");
    setInterim("");
  }, []);

  useEffect(() => () => {
    stopDemo();
    recRef.current?.abort();
  }, []);

  return { finalText, interim, listening, supported, start, stop, cancel };
}

/**
 * Microphone loudness (0..1) from a Web Audio AnalyserNode, written into a ref so the
 * waveform can animate at 60fps without React re-renders. Falls back to a gentle
 * simulated level if mic access is denied or conflicts with speech recognition.
 */
export function useMicLevel(active: boolean) {
  const level = useRef(0);
  const [real, setReal] = useState(false);

  useEffect(() => {
    if (!active) {
      level.current = 0;
      return;
    }
    let raf = 0;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let cancelled = false;

    const simulate = () => {
      const t = performance.now() / 1000;
      level.current = 0.25 + 0.2 * Math.sin(t * 6) + 0.15 * Math.sin(t * 13.7) + Math.random() * 0.1;
      raf = requestAnimationFrame(simulate);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) return;
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        setReal(true);
        const loop = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += ((v - 128) / 128) ** 2;
          const rms = Math.sqrt(sum / data.length);
          level.current = level.current * 0.6 + Math.min(1, rms * 4) * 0.4; // smooth
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        simulate();
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close();
    };
  }, [active]);

  return { level, real };
}

/** Speak text with the browser voice. Returns false if no voice exists for this language. */
export function speak(text: string, speechLang: string): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((v) => v.lang.replace("_", "-").toLowerCase().startsWith(speechLang.slice(0, 2).toLowerCase()));
  if (!voice && voices.length > 0) return false;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = speechLang;
  if (voice) u.voice = voice;
  u.rate = 0.92; // slightly slower for elders
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
  return true;
}
