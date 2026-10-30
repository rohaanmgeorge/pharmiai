"use client";

import { useEffect } from "react";
import { api } from "@/lib/api-client";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { SosView } from "./sos-load";

/** Keeps an SOS up to date: Supabase Realtime on sos_acks (RLS applies to what we receive),
 *  plus polling GET /api/sos/:id every 10 s whenever Realtime isn't connected. */
export function useSosLive(id: string | null, onUpdate: (fn: (v: SosView) => SosView) => void) {
  useEffect(() => {
    if (!id) return;
    const supabase = supabaseBrowser();
    let live = false;

    const channel = supabase
      .channel(`sos-${id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sos_acks", filter: `sos_id=eq.${id}` }, (payload) => {
        const row = payload.new as { id: string; acked_at: string | null };
        onUpdate((v) => ({ ...v, contacts: v.contacts.map((c) => (c.id === row.id ? { ...c, ackedAt: row.acked_at } : c)) }));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sos_events", filter: `id=eq.${id}` }, (payload) => {
        const row = payload.new as { state: SosView["state"] };
        onUpdate((v) => ({ ...v, state: row.state }));
      })
      .subscribe((status) => {
        live = status === "SUBSCRIBED";
      });

    const timer = setInterval(async () => {
      if (live) return;
      try {
        const fresh = await api<SosView>(`/api/sos/${id}`);
        onUpdate(() => fresh);
      } catch {
        // Offline for a moment: try again on the next tick. 108/112 stay on screen.
      }
    }, 10_000);

    return () => {
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [id, onUpdate]);
}
