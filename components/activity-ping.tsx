"use client";

import { useEffect } from "react";

// Tells the server "this person opened the app" — it counts as activity for the
// "Are you okay?" check. At most once per 10 minutes per tab (the server checks too).
const EVERY_MS = 10 * 60 * 1000;
let lastPing = 0;

export function ActivityPing() {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastPing < EVERY_MS) return;
      lastPing = Date.now();
      fetch("/api/activity", { method: "POST" }).catch(() => {});
    };
    ping();
    document.addEventListener("visibilitychange", ping);
    return () => document.removeEventListener("visibilitychange", ping);
  }, []);
  return null;
}
