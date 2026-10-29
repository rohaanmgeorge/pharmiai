import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

// Web Push with our VAPID keys. Message text is short and generic on the lock screen;
// details (medicine name) appear only after the phone is unlocked and the app opens.
let ready = false;
function setup() {
  if (ready) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:team@pharmiai.app", pub, priv);
  ready = true;
  return true;
}

export type PushMessage = {
  title: string;
  body: string;
  url: string; // where tapping the notification opens
  tag?: string;
  image?: string | null; // signed pill-strip photo
  actions?: { action: string; title: string }[];
  data?: Record<string, unknown>;
};

/** Sends to every phone/laptop this user enabled. Returns how many devices got it. */
export async function sendPush(admin: SupabaseClient, userId: string, message: PushMessage): Promise<number> {
  if (!setup()) return 0;
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, keys").eq("user_id", userId);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(message), { TTL: 60 * 60 });
      sent++;
    } catch (e) {
      // 404/410 = the browser dropped this subscription: remove it.
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
    }
  }
  return sent;
}

/** Records a message key once. Returns false if it was already sent (so we don't send twice). */
export async function claimOnce(admin: SupabaseClient, key: string): Promise<boolean> {
  const { error } = await admin.from("sent_notifications").insert({ key });
  return !error;
}
