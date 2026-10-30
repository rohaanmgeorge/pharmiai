// Small helpers for screens talking to our API. Errors come back as plain sentences.

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(path, {
    ...rest,
    headers: json !== undefined ? { "content-type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? "Something went wrong. Please try again.");
  return body as T;
}

/** A new id for each tap, so retries never count twice. */
export const newOpId = () => crypto.randomUUID();

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export type PushState = "unsupported" | "denied" | "off" | "on";

export async function pushState(): Promise<PushState> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/**
 * Asks permission (must be called from a tap), subscribes this device, and saves it on the server.
 * Throws an Error with a plain sentence when something fails, so the screen can show why.
 */
export async function enablePush(): Promise<PushState> {
  if ((await pushState()) === "unsupported") return "unsupported";
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("Reminders are not set up on the server yet (missing public push key). Ask the team to add it in Vercel and redeploy.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
  } catch {
    throw new Error("Could not start the reminder helper in this browser. Try Chrome, or reload the page.");
  }
  let sub: PushSubscription;
  try {
    sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
  } catch {
    throw new Error("This browser refused to set up notifications. On Android use Chrome; on iPhone add PharmiAI to the Home Screen first.");
  }
  await api("/api/push/subscribe", { method: "POST", json: sub.toJSON() });
  return "on";
}
