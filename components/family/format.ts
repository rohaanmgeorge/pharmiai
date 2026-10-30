import { uiLocale } from "@/lib/client";
// Small display helpers for the family screens.

/** "09:42" in the viewer's local time. */
export function clock(at: string | Date): string {
  return new Date(at).toLocaleTimeString(uiLocale(), { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function ago(at: string, now = Date.now()): string {
  const min = Math.max(0, Math.round((now - Date.parse(at)) / 60000));
  if (min < 2) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

const COLORS = ["#D4F28A", "#FDE68A", "#BFDBFE", "#FBCFE8", "#C7D2FE", "#A7F3D0"];

/** A stable soft colour per person, so avatars don't change between visits. */
export function colorFor(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

export const PRESENCE_LABEL: Record<string, string> = { home: "At home", away: "Away", hospital: "In hospital" };
