"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api-client";

/** Loads JSON from our API. `reload()` fetches again (e.g. after a tap or a live update). */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api<T>(path)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, loading: loading && !data && !error, reload, setData };
}

/** Which person's medicines we're looking at: "?patient=<id>" (caregiver) or yourself. */
export function patientQuery(): string {
  if (typeof window === "undefined") return "";
  const id = new URLSearchParams(window.location.search).get("patient");
  return id ? `?patient=${encodeURIComponent(id)}` : "";
}
