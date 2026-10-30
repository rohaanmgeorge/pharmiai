"use client";

import { BellRing, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { cn, PillButton } from "@/components/ui";
import { api, enablePush, pushState, type PushState } from "@/lib/api-client";

type Status = { serverReady: boolean; myDevices: number; lastTick: string | null; clockAge?: number | null };

/** Everything about reminders on this device: turn on, test, and why it might not work. */
export function PushPanel() {
  const [state, setState] = useState<PushState | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    pushState().then(setState);
    api<Status>("/api/push/status")
      .then((s) => setStatus({ ...s, clockAge: s.lastTick ? Math.round((Date.now() - Date.parse(s.lastTick)) / 60000) : null }))
      .catch(() => {});
  };
  useEffect(refresh, []);

  async function turnOn() {
    setBusy(true);
    setMessage(null);
    try {
      const next = await enablePush();
      setState(next);
      if (next === "denied") setMessage({ ok: false, text: "Notifications are blocked. Open the site settings (lock icon in the address bar) and allow Notifications." });
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
      refresh();
    }
  }

  async function test() {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<{ devices: number; sent: number; lastError: string | null }>("/api/push/test", { method: "POST" });
      setMessage(
        r.sent > 0
          ? { ok: true, text: `Sent to ${r.sent} device${r.sent === 1 ? "" : "s"}. It should appear in a few seconds — even with the app closed.` }
          : { ok: false, text: r.lastError ?? "No device is set up yet. Tap Turn on first." },
      );
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const clockAge = status?.clockAge ?? null;
  const lines = [
    { ok: state === "on", text: state === "on" ? "This device: on" : state === "denied" ? "This device: blocked in browser settings" : state === "unsupported" ? "This browser can't get notifications (iPhone: add to Home Screen first)" : "This device: off" },
    { ok: Boolean(status?.serverReady), text: status?.serverReady ? "Server: ready" : "Server: push keys missing" },
    { ok: clockAge !== null && clockAge <= 5, text: clockAge === null ? "Reminder clock: has not run yet" : `Reminder clock: last ran ${clockAge} min ago` },
  ];

  return (
    <div className="space-y-3">
      <ul className="space-y-1 text-sm">
        {lines.map((l) => (
          <li key={l.text} className="flex items-center gap-2">
            <span className={cn("size-2.5 shrink-0 rounded-full", l.ok ? "bg-ok" : "bg-warn")} aria-hidden />
            <span className={l.ok ? "text-ink" : "text-warn"}>{l.text}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {state !== "on" && state !== "unsupported" && (
          <PillButton size="sm" variant="green" className="min-h-12" disabled={busy} onClick={turnOn}>
            <BellRing className="size-4" aria-hidden /> Turn on
          </PillButton>
        )}
        <PillButton size="sm" className="min-h-12" disabled={busy} onClick={test}>
          <Send className="size-4" aria-hidden /> Send test notification
        </PillButton>
      </div>
      {message && (
        <p role="status" className={cn("rounded-sm px-3 py-2 text-sm font-semibold", message.ok ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn")}>
          {message.text}
        </p>
      )}
    </div>
  );
}
