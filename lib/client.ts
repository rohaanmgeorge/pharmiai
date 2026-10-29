"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** Read a browser-only value (e.g. window.location) without a hydration mismatch. */
export function useClientValue<T>(getClient: () => T, server: T): T {
  return useSyncExternalStore(noopSubscribe, getClient, () => server);
}
