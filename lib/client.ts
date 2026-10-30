"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** Read a browser-only value (e.g. window.location) without a hydration mismatch. */
export function useClientValue<T>(getClient: () => T, server: T): T {
  return useSyncExternalStore(noopSubscribe, getClient, () => server);
}

/** Date/time locale for the chosen app language (the <html lang> set by Providers). */
export function uiLocale(): string {
  if (typeof document === "undefined") return "en-IN";
  const l = document.documentElement.lang;
  return l === "ml" ? "ml-IN" : l === "hi" ? "hi-IN" : "en-IN";
}
