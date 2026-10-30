import { HeartPulse, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { mapLink } from "@/components/emergency/sos-links";
import { AckButton } from "./ack-button";

// Public page a contact opens from the SOS message (no login).
// Shows ONLY the first name, the time and the map link — never medicines or other health data.
export const metadata: Metadata = { title: "SOS — PharmiAI", robots: { index: false, follow: false } };

type Row = {
  acked_at: string | null;
  sos_events: { state: string; is_test: boolean; started_at: string; lat: number | null; lng: number | null; profiles: { name: string } };
};

export default async function AckPage(props: PageProps<"/ack/[token]">) {
  const { token } = await props.params;
  const { data } = /^[a-f0-9]{32}$/.test(token)
    ? await supabaseAdmin()
        .from("sos_acks")
        .select("acked_at, sos_events!inner(state, is_test, started_at, lat, lng, profiles!inner(name))")
        .eq("token", token)
        .maybeSingle()
    : { data: null };
  const row = data as unknown as Row | null;

  if (!row) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-5 text-center">
        <h1 className="text-2xl font-bold">This link is not available</h1>
        <p className="mt-2 text-ink-2">If someone needs help, call 112.</p>
        <a href="tel:112" className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-danger text-lg font-extrabold text-white">
          <Phone className="size-5" aria-hidden /> Call 112
        </a>
      </main>
    );
  }

  const ev = row.sos_events;
  const firstName = ev.profiles.name.trim().split(/\s+/)[0] || "Your family member";
  const time = new Date(ev.started_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
  const map = mapLink(ev.lat, ev.lng);
  const ended = ev.state !== "active";

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      {ev.is_test && <p className="rounded-full bg-warn-soft px-4 py-2 text-center text-sm font-bold text-warn">Test — no one is in danger</p>}
      <span className="inline-flex w-fit items-center gap-2 rounded-full bg-danger px-4 py-2 text-sm font-extrabold text-white">
        <HeartPulse className="size-4" aria-hidden /> SOS
      </span>
      <h1 className="text-[2rem] leading-tight font-light">
        {ended ? `${firstName}'s alert has ended.` : `${firstName} needs help.`}
      </h1>
      <p className="text-ink-2">Alert sent at {time}</p>

      {map ? (
        <a href={map} target="_blank" rel="noopener noreferrer" className="flex min-h-14 items-center gap-3 rounded-card bg-surface p-4 font-bold shadow-card">
          <MapPin className="size-5 text-danger" aria-hidden /> Open location in Maps
        </a>
      ) : (
        <p className="rounded-card bg-surface p-4 text-ink-2 shadow-card">Location was not shared.</p>
      )}

      {!ended && <AckButton token={token} ackedAt={row.acked_at} />}

      <div className="mt-auto grid grid-cols-2 gap-3">
        <a href="tel:108" className="flex min-h-14 items-center justify-center gap-2 rounded-full bg-danger text-lg font-extrabold text-white">
          <Phone className="size-5" aria-hidden /> 108
        </a>
        <a href="tel:112" className="flex min-h-14 items-center justify-center gap-2 rounded-full border-2 border-danger text-lg font-extrabold text-danger">
          <Phone className="size-5" aria-hidden /> 112
        </a>
      </div>
    </main>
  );
}
