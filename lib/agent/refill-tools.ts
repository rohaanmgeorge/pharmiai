import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { draftRefillMessage } from "@/lib/ai/refill-draft";
import type { Lang } from "@/lib/i18n";
import { safetyLog } from "@/lib/safety/log";
import { normalizeStrength } from "@/lib/safety/match";
import { predictRunout } from "@/lib/safety/medication-math";
import { refillQuantity, shareUrl } from "@/lib/safety/refill-guard";
import { canManage } from "@/lib/server/auth";
import { istDate } from "@/lib/server/time";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AgentTool } from "./types";

// Refill agent. Part 1: the actions, shared by the API routes and the chat assistant.
// Part 2: `refillTools` for Gemini function calling (another agent plugs them into chat).
// Reads use the user's client (RLS). Writes use the admin client ONLY after canManage().

type Who = { supabase: SupabaseClient; user: User };
export type Fail = { ok: false; error: string; status: number };
const no = (error: string, status = 400): Fail => ({ ok: false, error, status });

type Catalog = { name: string; strength: string; form: string; ingredients: string[]; mrp: number | null; pack_size: number | null };
type Row = {
  id: string;
  patient_id: string;
  schedule_id: string;
  days_left: number;
  runout_date: string;
  draft_text: string | null;
  lang: Lang;
  state: "open" | "later" | "approved" | "refilled" | "dismissed";
  later_until: string | null;
  approved_by: string | null;
  approved_at: string | null;
  refilled_qty: number | null;
  refilled_by: string | null;
  refilled_at: string | null;
  schedules: { id: string; stock: number; slot_times: string[]; prescription_items: { status: string; catalog_id: string; medicine_catalog: Catalog } };
};

const SELECT =
  "id, patient_id, schedule_id, days_left, runout_date, draft_text, lang, state, later_until, approved_by, approved_at, refilled_qty, refilled_by, refilled_at, " +
  "schedules!inner(id, stock, slot_times, prescription_items!inner(status, catalog_id, medicine_catalog!inner(name, strength, form, ingredients, mrp, pack_size)))";

export type GenericOption = { name: string; strength: string; pricePerUnit: number; brandPricePerUnit: number | null; packSize: number };

export type RefillView = {
  id: string;
  patientId: string;
  scheduleId: string;
  state: Row["state"];
  medicine: { name: string; strength: string; form: string };
  stock: number;
  dosesPerDay: number;
  daysLeft: number;
  runoutDate: string;
  quantity: number; // suggested order: 30 days' worth
  lang: Lang;
  draftText: string | null;
  laterUntil: string | null;
  approvedBy: { name: string; at: string } | null;
  refilled: { name: string; qty: number; at: string } | null;
  generic: GenericOption | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Jan Aushadhi alternative: same ingredients AND same strength, from DB rows only. Verified medicines only. */
async function genericFor(supabase: SupabaseClient, row: Row): Promise<GenericOption | null> {
  const item = row.schedules.prescription_items;
  if (item.status !== "verified") return null;
  const med = item.medicine_catalog;
  const wanted = [...med.ingredients].map((i) => i.toLowerCase()).sort().join("+");
  const { data } = await supabase.from("generic_products").select("name, ingredients, strength, mrp, pack_size").contains("ingredients", med.ingredients);
  const matches = (data ?? []).filter(
    (g) =>
      [...(g.ingredients as string[])].map((i) => i.toLowerCase()).sort().join("+") === wanted &&
      normalizeStrength(g.strength as string) === normalizeStrength(med.strength),
  );
  if (matches.length === 0) return null;
  const best = matches.sort((a, b) => a.mrp / a.pack_size - b.mrp / b.pack_size)[0];
  return {
    name: best.name,
    strength: best.strength,
    packSize: best.pack_size,
    pricePerUnit: round2(best.mrp / best.pack_size),
    brandPricePerUnit: med.mrp && med.pack_size ? round2(med.mrp / med.pack_size) : null,
  };
}

/** Names of the people who approved/refilled. Admin read: a patient may not see a caregiver's profile row. */
async function namesOf(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  if (unique.length === 0) return new Map();
  const { data } = await supabaseAdmin().from("profiles").select("id, name").in("id", unique);
  return new Map((data ?? []).map((p) => [p.id as string, (p.name as string) || "Family member"]));
}

async function toViews(supabase: SupabaseClient, rows: Row[]): Promise<RefillView[]> {
  const names = await namesOf(rows.flatMap((r) => [r.approved_by, r.refilled_by]));
  const today = istDate();
  return Promise.all(
    rows.map(async (r) => {
      const s = r.schedules;
      const med = s.prescription_items.medicine_catalog;
      const perDay = s.slot_times.length;
      const live = predictRunout(s.stock, perDay, today); // recomputed from current stock
      return {
        id: r.id,
        patientId: r.patient_id,
        scheduleId: r.schedule_id,
        state: r.state,
        medicine: { name: med.name, strength: med.strength, form: med.form },
        stock: s.stock,
        dosesPerDay: perDay,
        daysLeft: live?.daysLeft ?? r.days_left,
        runoutDate: live?.runoutDate ?? r.runout_date,
        quantity: refillQuantity(perDay),
        lang: r.lang,
        draftText: r.draft_text,
        laterUntil: r.later_until,
        approvedBy: r.approved_by && r.approved_at ? { name: names.get(r.approved_by) ?? "Family member", at: r.approved_at } : null,
        refilled: r.refilled_by && r.refilled_at && r.refilled_qty ? { name: names.get(r.refilled_by) ?? "Family member", qty: r.refilled_qty, at: r.refilled_at } : null,
        generic: await genericFor(supabase, r),
      };
    }),
  );
}

/** Open / later / approved suggestions for one patient, soonest run-out first. */
export async function listRefills(supabase: SupabaseClient, patientId: string): Promise<RefillView[]> {
  const { data } = await supabase
    .from("refill_suggestions")
    .select(SELECT)
    .eq("patient_id", patientId)
    .in("state", ["open", "later", "approved"])
    .order("runout_date");
  return toViews(supabase, (data ?? []) as unknown as Row[]);
}

/** One suggestion in any state (RLS: only if you can view the patient). */
export async function getRefill(supabase: SupabaseClient, id: string): Promise<RefillView | null> {
  const { data } = await supabase.from("refill_suggestions").select(SELECT).eq("id", id).maybeSingle();
  if (!data) return null;
  return (await toViews(supabase, [data as unknown as Row]))[0];
}

export type Pharmacy = { name: string | null; phone: string | null; email: string | null };

export async function getPharmacy(supabase: SupabaseClient, patientId: string): Promise<(Pharmacy & { patientName: string }) | null> {
  const { data } = await supabase.from("profiles").select("name, pharmacy_name, pharmacy_phone, pharmacy_email").eq("id", patientId).maybeSingle();
  if (!data) return null;
  return { patientName: data.name ?? "", name: data.pharmacy_name, phone: data.pharmacy_phone, email: data.pharmacy_email };
}

/** Loads a suggestion and checks the user may change it. */
async function forManager({ supabase }: Who, id: string): Promise<{ ok: true; refill: RefillView } | Fail> {
  const refill = await getRefill(supabase, id);
  if (!refill) return no("Refill not found", 404);
  if (!(await canManage(supabase, refill.patientId))) return no("Only the patient or a caregiver can do this", 403);
  return { ok: true, refill };
}

const OPEN_STATES = ["open", "later", "approved"];

/** AI writes the words; code supplies name, strength, quantity; guard checks; draft is stored. */
export async function draftRefill(who: Who, id: string, lang: Lang) {
  const found = await forManager(who, id);
  if (!found.ok) return found;
  const { refill } = found;
  const pharmacy = await getPharmacy(who.supabase, refill.patientId);
  const { data: catalog } = await who.supabase.from("medicine_catalog").select("name");
  const result = await draftRefillMessage(
    lang,
    { medicine: refill.medicine.name, strength: refill.medicine.strength, quantity: refill.quantity, pharmacy: pharmacy?.name ?? "", patient: pharmacy?.patientName ?? "" },
    (catalog ?? []).map((c) => c.name as string),
  );
  await supabaseAdmin().from("refill_suggestions").update({ draft_text: result.text, lang }).eq("id", id);
  return { ok: true as const, text: result.text, source: result.source, quantity: refill.quantity };
}

/** The user approved their (possibly edited) text. Records who and when; returns the link they open. */
export async function approveRefill(who: Who, id: string, text: string, channel: "whatsapp" | "sms" | "email") {
  const found = await forManager(who, id);
  if (!found.ok) return found;
  if (!OPEN_STATES.includes(found.refill.state)) return no("This refill is already closed");
  const pharmacy = await getPharmacy(who.supabase, found.refill.patientId);
  const url = shareUrl(channel, text, { phone: pharmacy?.phone, email: pharmacy?.email });
  if (!url) return no(channel === "email" ? "Add the pharmacy's email first" : "Add the pharmacy's phone number first");
  const at = new Date().toISOString();
  const { error } = await supabaseAdmin()
    .from("refill_suggestions")
    .update({ state: "approved", draft_text: text, approved_by: who.user.id, approved_at: at })
    .eq("id", id);
  if (error) return no("Could not save", 500);
  await safetyLog([{ actor: who.user.id, patientId: found.refill.patientId, event: "refill_approved", payload: { refill: id, channel } }]);
  return { ok: true as const, url, approvedAt: at };
}

/** "Later": hide it for one day (the scheduler re-opens it). */
export async function snoozeRefill(who: Who, id: string) {
  const found = await forManager(who, id);
  if (!found.ok) return found;
  if (!OPEN_STATES.includes(found.refill.state)) return no("This refill is already closed");
  const laterUntil = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabaseAdmin().from("refill_suggestions").update({ state: "later", later_until: laterUntil }).eq("id", id);
  if (error) return no("Could not save", 500);
  return { ok: true as const, laterUntil };
}

/** "Refilled": the person types the real quantity bought; it is added to stock. */
export async function recordRefill(who: Who, id: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return no("Enter how many tablets you bought (1–1000)");
  const found = await forManager(who, id);
  if (!found.ok) return found;
  if (!OPEN_STATES.includes(found.refill.state)) return no("This refill is already recorded");
  const admin = supabaseAdmin();
  // Mark it refilled first (only if still open) so a double tap can't add stock twice.
  const { data: claimed } = await admin
    .from("refill_suggestions")
    .update({ state: "refilled", refilled_qty: quantity, refilled_by: who.user.id, refilled_at: new Date().toISOString() })
    .eq("id", id)
    .in("state", OPEN_STATES)
    .select("id");
  if (!claimed?.length) return no("This refill is already recorded");
  const { data: s } = await admin.from("schedules").select("stock").eq("id", found.refill.scheduleId).single();
  const stock = (s?.stock ?? 0) + quantity;
  const { error } = await admin.from("schedules").update({ stock }).eq("id", found.refill.scheduleId);
  if (error) return no("Could not update stock", 500);
  await safetyLog([{ actor: who.user.id, patientId: found.refill.patientId, event: "refill_recorded", payload: { refill: id, quantity } }]);
  return { ok: true as const, stock };
}

// ---------------------------------------------------------------------------
// Part 2: tools for the chat assistant. Every number and date comes from code/DB.
// ---------------------------------------------------------------------------

async function scheduleRow(supabase: SupabaseClient, scheduleId: unknown) {
  if (typeof scheduleId !== "string") return null;
  const { data } = await supabase
    .from("schedules")
    .select("id, stock, slot_times, prescription_items!inner(medicine_catalog!inner(name, strength))")
    .eq("id", scheduleId)
    .maybeSingle();
  if (!data) return null;
  const med = (data.prescription_items as unknown as { medicine_catalog: { name: string; strength: string } }).medicine_catalog;
  return { stock: data.stock as number, dosesPerDay: (data.slot_times as string[]).length, name: med.name, strength: med.strength };
}

const LANG_CODES = ["en", "ml", "hi"];

export const refillTools: AgentTool[] = [
  {
    name: "get_stock",
    description: "How many tablets are left for one scheduled medicine.",
    parameters: { type: "object", properties: { schedule_id: { type: "string" } }, required: ["schedule_id"] },
    async run(ctx, args) {
      const s = await scheduleRow(ctx.supabase, args.schedule_id);
      if (!s) return { data: { error: "Medicine not found" } };
      return { data: { medicine: s.name, strength: s.strength, stock: s.stock } };
    },
  },
  {
    name: "predict_runout",
    description: "Days left and the run-out date for one scheduled medicine (computed by code: stock ÷ doses per day).",
    parameters: { type: "object", properties: { schedule_id: { type: "string" } }, required: ["schedule_id"] },
    async run(ctx, args) {
      const s = await scheduleRow(ctx.supabase, args.schedule_id);
      if (!s) return { data: { error: "Medicine not found" } };
      const r = predictRunout(s.stock, s.dosesPerDay, istDate());
      return { data: r ? { medicine: s.name, ...r } : { medicine: s.name, error: "Cannot predict for 'when needed' medicines" } };
    },
  },
  {
    name: "draft_refill_message",
    description: "Draft a reorder message to the pharmacy for a refill suggestion. The person reviews and sends it themselves.",
    parameters: {
      type: "object",
      properties: { suggestion_id: { type: "string" }, lang: { type: "string", enum: LANG_CODES } },
      required: ["suggestion_id"],
    },
    async run(ctx, args) {
      const lang = (LANG_CODES.includes(args.lang as string) ? args.lang : ctx.lang) as Lang;
      const r = await draftRefill(ctx, String(args.suggestion_id ?? ""), lang);
      if (!r.ok) return { data: { error: r.error } };
      return {
        data: { drafted: true, note: "Shown to the person to edit and send. Never sent automatically." },
        cards: [{ kind: "refill_draft", suggestionId: args.suggestion_id, text: r.text, lang }],
      };
    },
  },
  {
    name: "record_refill",
    description: "Record that medicine was bought and add the real quantity to stock. Only call after the person explicitly confirmed the quantity.",
    parameters: {
      type: "object",
      properties: {
        suggestion_id: { type: "string" },
        quantity: { type: "integer" },
        approvedByUser: { type: "boolean", description: "true only if the person explicitly said yes to this exact quantity" },
      },
      required: ["suggestion_id", "quantity", "approvedByUser"],
    },
    async run(ctx, args) {
      // The model can't record a refill on its own: the person must have said yes.
      if (args.approvedByUser !== true) return { data: { error: "Ask the person to confirm the quantity first" } };
      const r = await recordRefill(ctx, String(args.suggestion_id ?? ""), Number(args.quantity));
      if (!r.ok) return { data: { error: r.error } };
      return { data: { recorded: true, stock: r.stock, recordedBy: ctx.user.id } };
    },
  },
];
