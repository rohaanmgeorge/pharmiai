// PharmiAI service worker: shows reminders and lets "Taken" / "I'm okay" work from the notification.
// Same-origin fetches from here carry the login cookie, so the server still checks who you are.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let m = {};
  try {
    m = event.data ? event.data.json() : {};
  } catch {
    m = { title: "PharmiAI", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(m.title || "PharmiAI", {
      body: m.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      image: m.image || undefined,
      tag: m.tag,
      renotify: Boolean(m.tag),
      requireInteraction: Boolean(m.actions && m.actions.length),
      actions: m.actions || [],
      data: { url: m.url || "/chat", ...(m.data || {}) },
    }),
  );
});

async function openApp(url) {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of all) {
    if ("focus" in c) {
      await c.navigate(url).catch(() => {});
      return c.focus();
    }
  }
  return self.clients.openWindow(url);
}

self.addEventListener("notificationclick", (event) => {
  const n = event.notification;
  const data = n.data || {};
  n.close();
  event.waitUntil(
    (async () => {
      if ((event.action === "taken" || event.action === "snoozed") && data.doseId) {
        const res = await fetch(`/api/doses/${data.doseId}/act`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: event.action, opId: crypto.randomUUID() }),
        }).catch(() => null);
        if (res && res.ok) return; // done without opening the app
      }
      if (event.action === "okay" && data.checkId) {
        const res = await fetch(`/api/checks/${data.checkId}/ok`, { method: "POST" }).catch(() => null);
        if (res && res.ok) return;
      }
      return openApp(data.url || "/chat");
    })(),
  );
});
