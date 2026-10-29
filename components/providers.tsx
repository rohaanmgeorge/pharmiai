"use client";

import { MotionConfig } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import { translate, type Lang, type StringKey } from "@/lib/i18n";

type PrefValues = { lang: Lang; elder: boolean };

type Prefs = PrefValues & {
  setLang: (lang: Lang) => void;
  setElder: (elder: boolean) => void;
  t: (key: StringKey) => string;
};

const PrefsContext = createContext<Prefs | null>(null);

// Per-device preferences only (language, Elder mode). Never store health data here.
// A tiny external store so every page reads the same saved value from the first render.
const DEFAULTS: PrefValues = { lang: "en", elder: false };
const STORAGE_KEY = "pharmi.prefs";
const listeners = new Set<() => void>();
let current: PrefValues | null = null;

function load(): PrefValues {
  if (current) return current;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    current = raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<PrefValues>) } : DEFAULTS;
  } catch {
    current = DEFAULTS; // private mode / blocked storage: still works, just won't remember
  }
  return current;
}

function save(patch: Partial<PrefValues>) {
  current = { ...load(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const { lang, elder } = useSyncExternalStore(subscribe, load, () => DEFAULTS);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dataset.elder = String(elder);
  }, [lang, elder]);

  const setLang = useCallback((next: Lang) => save({ lang: next }), []);
  const setElder = useCallback((next: boolean) => save({ elder: next }), []);
  const t = useCallback((key: StringKey) => translate(key, lang), [lang]);

  return (
    <PrefsContext.Provider value={{ lang, elder, setLang, setElder, t }}>
      {/* Elder mode: slower, spring-free motion. reducedMotion="user" respects the OS setting. */}
      <MotionConfig reducedMotion="user" transition={elder ? { duration: 0.33, ease: [0.2, 0.8, 0.2, 1] } : undefined}>
        {children}
      </MotionConfig>
    </PrefsContext.Provider>
  );
}

export function usePrefs() {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used inside <Providers>");
  return ctx;
}
