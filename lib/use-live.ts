"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { api } from "./api-client";
import { supabaseBrowser } from "./supabase/client";

// Live family dashboard: a snapshot from our API, refreshed whenever Supabase Realtime says
// something changed for these people. Realtime applies RLS, so we only hear about people we may see.
// Health data lives in React state only: never localStorage / IndexedDB.

export type LiveStatus = "connecting" | "live" | "reconnecting" | "offline";

const TABLES = ["dose_events", "wellness_checks", "check_alerts", "sos_events", "strips", "refill_suggestions"];
const DEBOUNCE_MS = 500;
const POLL_MS = 30_000;

/** Calls onChange (debounced) when any row for these patients changes. Polls every 30 s if not live. */
export function useLive(patientIds: string[], onChange: () => void): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const instance = useId(); // unique channel name per screen, so two screens don't share one channel
  const callback = useRef(onChange);
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);

  // Sort so the same people in a different order doesn't resubscribe.
  const key = [...patientIds].sort().join(",");

  useEffect(() => {
    if (!key) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => callback.current(), DEBOUNCE_MS);
    };

    const supabase = supabaseBrowser();
    const filter = `patient_id=in.(${key})`;
    let channel = supabase.channel(`family-${instance}-${key}`);
    for (const table of TABLES) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, changed);
    }
    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        setStatus("live");
        changed(); // catch anything we missed while reconnecting
      } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus(navigator.onLine ? "reconnecting" : "offline");
      else if (s === "CLOSED") setStatus("offline");
    });

    const goOffline = () => setStatus("offline");
    const goOnline = () => setStatus("reconnecting");
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
      supabase.removeChannel(channel);
    };
  }, [key, instance]);

  // Fallback: if Realtime isn't connected, ask the server every 30 seconds.
  useEffect(() => {
    if (!key || status === "live") return;
    const id = setInterval(() => navigator.onLine && callback.current(), POLL_MS);
    return () => clearInterval(id);
  }, [key, status]);

  return key ? status : "live";
}

/** Fetches JSON and remembers when it last succeeded (for "Offline, last updated hh:mm"). */
export function useSnapshot<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const busy = useRef(false);
  const again = useRef(false);

  const load = useCallback(async () => {
    if (!path) return;
    // A change arrived while we were fetching: fetch once more afterwards, so nothing is missed.
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    do {
      again.current = false;
      try {
        const d = await api<T>(path, { cache: "no-store" });
        setData(d);
        setError(null);
        setUpdatedAt(new Date());
      } catch (e) {
        setError((e as Error).message);
      }
    } while (again.current);
    busy.current = false;
  }, [path]);

  useEffect(() => {
    // Initial load; setState happens after the await, not synchronously in the effect.
    const t = setTimeout(load, 0);
    return () => clearTimeout(t);
  }, [load]);

  return { data, error, loading: !data && !error, updatedAt, reload: load };
}
