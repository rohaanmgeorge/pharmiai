import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Append-only safety log. Store IDs, codes and statuses only — never names, images or free text.
export async function safetyLog(
  entries: { actor: string | null; patientId: string; itemId?: string | null; event: string; payload?: Record<string, unknown> }[],
) {
  if (entries.length === 0) return;
  const { error } = await supabaseAdmin()
    .from("safety_log")
    .insert(entries.map((e) => ({ actor: e.actor, patient_id: e.patientId, item_id: e.itemId ?? null, event: e.event, payload: e.payload ?? {} })));
  // A missing safety record is serious: fail loudly instead of continuing silently.
  if (error) throw new Error(`safety_log insert failed: ${error.message}`);
}
