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

// ---------------------------------------------------------------------------------------------
// Server voice (Gemini): Malayalam / Hindi / English on any phone.
// One microphone stream feeds both the recorder and the waveform, so they never fight.
// ---------------------------------------------------------------------------------------------

/** Records one spoken question. `level` (0..1) drives the waveform while recording. */
export function useRecorder() {
  const level = useRef(0);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parts = useRef<{ rec: MediaRecorder; stream: MediaStream; ctx: AudioContext; raf: number; chunks: Blob[] } | null>(null);

  const cleanup = () => {
    const p = parts.current;
    if (!p) return;
    cancelAnimationFrame(p.raf);
    p.stream.getTracks().forEach((t) => t.stop());
    p.ctx.close().catch(() => {});
    parts.current = null;
    level.current = 0;
  };

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      // Phones differ: Chrome records webm/opus, iPhone records mp4. Both are accepted by the server.
      const type = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        level.current = level.current * 0.6 + Math.min(1, Math.sqrt(sum / data.length) * 4) * 0.4;
        if (parts.current) parts.current.raf = requestAnimationFrame(loop);
      };
      parts.current = { rec, stream, ctx, raf: 0, chunks };
      rec.start(250);
      loop();
      setRecording(true);
      return true;
    } catch {
      cleanup();
      setError("Microphone not available. Allow microphone access for this site, then try again.");
      return false;
    }
  }, []);

  /** Stops and returns the recording (null if nothing was recorded). */
  const stop = useCallback(async (): Promise<Blob | null> => {
    const p = parts.current;
    if (!p) return null;
    const done = new Promise<void>((resolve) => (p.rec.onstop = () => resolve()));
    if (p.rec.state !== "inactive") p.rec.stop();
    await done;
    const blob = p.chunks.length ? new Blob(p.chunks, { type: p.rec.mimeType || "audio/webm" }) : null;
    cleanup();
    setRecording(false);
    return blob;
  }, []);

  const cancel = useCallback(() => {
    const p = parts.current;
    if (p && p.rec.state !== "inactive") p.rec.stop();
    cleanup();
    setRecording(false);
  }, []);

  useEffect(() => () => cleanup(), []);

  return { level, recording, error, start, stop, cancel };
}

/** Sends a recording to our server (Gemini) and returns what was said. */
export async function transcribe(audio: Blob, lang: string): Promise<string> {
  const form = new FormData();
  form.append("audio", audio, "speech");
  form.append("lang", lang);
  const res = await fetch("/api/voice/stt", { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Couldn't understand the recording.");
  return String(body.transcript ?? "");
}

// One audio element, unlocked by the user's tap, so replies can play after a network wait
// (phones block sound that doesn't start from a tap).
let player: HTMLAudioElement | null = null;
/** A valid 0.05 s silent WAV, built in code (used only to "unlock" sound on the first tap). */
function silentWav(): string {
  const samples = 400;
  const buf = new DataView(new ArrayBuffer(44 + samples * 2));
  const text = (o: number, t: string) => [...t].forEach((c, i) => buf.setUint8(o + i, c.charCodeAt(0)));
  text(0, "RIFF");
  buf.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVEfmt ");
  buf.setUint32(16, 16, true);
  buf.setUint16(20, 1, true); // PCM
  buf.setUint16(22, 1, true); // mono
  buf.setUint32(24, 8000, true);
  buf.setUint32(28, 16000, true);
  buf.setUint16(32, 2, true);
  buf.setUint16(34, 16, true);
  text(36, "data");
  buf.setUint32(40, samples * 2, true);
  let bin = "";
  new Uint8Array(buf.buffer).forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

/** Call at the start of a tap (before any await). */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  player ??= new Audio();
  player.src = silentWav();
  player.play().catch(() => {});
}

/**
 * Reads text aloud: Gemini voice first (works in Malayalam/Hindi on every phone),
 * then the phone's own voice. Returns false if neither could speak.
 */
export async function sayAloud(text: string, lang: string, speechLang: string): Promise<boolean> {
  try {
    const res = await fetch("/api/voice/tts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, lang }) });
    if (!res.ok) throw new Error("tts");
    const url = URL.createObjectURL(await res.blob());
    player ??= new Audio();
    player.src = url;
    player.onended = () => URL.revokeObjectURL(url);
    await player.play();
    return true;
  } catch {
    return speak(text, speechLang);
  }
}

export function stopSpeaking() {
  player?.pause();
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}
