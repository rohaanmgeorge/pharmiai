import "server-only";
import type { Lang } from "@/lib/i18n";
import { REFUSAL } from "@/lib/safety/voice-guard";
import { normalizeStrength } from "@/lib/safety/match";
import { slotOf } from "@/lib/safety/slots";
import { signedPhoto } from "@/lib/server/auth";
import { addDays, istClock, istDate, istMoment } from "@/lib/server/time";
import type { AgentCard, AgentContext, AgentTool, ToolResult } from "./types";
import { factSource } from "@/lib/safety/medication-math";

// The assistant's tools. Every tool reads the database AS the signed-in user (RLS applies)
// for ctx.patientId. Facts the person sees go into cards built from rows; the model only
// gets short summaries, and never the uses/side-effect/price text itself (so it can't reword it).
// `say` is a fixed sentence built from database values, used when the AI is not available.

/** The person said "yes" to this exact action in this turn (set by the API route, never by the AI). */
export type ToolContext = AgentContext & { confirmed?: { doseId: string; action: DoseAction } };

export type DoseAction = "taken" | "skipped" | "snoozed";
const ACTIONS: DoseAction[] = ["taken", "skipped", "snoozed"];

// ---------- fixed sentences (drafts for ml/hi: Person B reviews them with lib/i18n.ts) ----------

const PHRASES = {
  confirm_taken: {
    en: "You took {name}, the {time} dose. Shall I mark it taken?",
    ml: "{name}, {time}-ന്റെ ഡോസ് കഴിച്ചോ? കഴിച്ചു എന്ന് രേഖപ്പെടുത്തട്ടെ?",
    hi: "आपने {name}, {time} वाली खुराक ले ली। क्या मैं इसे \"ले ली\" दर्ज करूँ?",
  },
  confirm_skipped: {
    en: "{name}, the {time} dose. Shall I mark it skipped?",
    ml: "{name}, {time}-ന്റെ ഡോസ് ഒഴിവാക്കിയതായി രേഖപ്പെടുത്തട്ടെ?",
    hi: "{name}, {time} वाली खुराक। क्या मैं इसे \"छोड़ी\" दर्ज करूँ?",
  },
  confirm_snoozed: {
    en: "{name}, the {time} dose. Shall I remind you again in 10 minutes?",
    ml: "{name}, {time}-ന്റെ ഡോസ്. 10 മിനിറ്റ് കഴിഞ്ഞ് വീണ്ടും ഓർമ്മിപ്പിക്കട്ടെ?",
    hi: "{name}, {time} वाली खुराक। क्या 10 मिनट बाद फिर याद दिलाऊँ?",
  },
  done_taken: { en: "Done. {name} ({time}) is marked taken.", ml: "ശരി. {name} ({time}) കഴിച്ചു എന്ന് രേഖപ്പെടുത്തി.", hi: "हो गया। {name} ({time}) \"ले ली\" दर्ज हुई।" },
  done_skipped: { en: "Done. {name} ({time}) is marked skipped.", ml: "ശരി. {name} ({time}) ഒഴിവാക്കിയതായി രേഖപ്പെടുത്തി.", hi: "हो गया। {name} ({time}) \"छोड़ी\" दर्ज हुई।" },
  done_snoozed: { en: "Okay. I'll remind you about {name} in 10 minutes.", ml: "ശരി. 10 മിനിറ്റ് കഴിഞ്ഞ് {name} ഓർമ്മിപ്പിക്കാം.", hi: "ठीक है। 10 मिनट बाद {name} की याद दिलाऊँगा।" },
  already: { en: "{name} ({time}) is already recorded.", ml: "{name} ({time}) നേരത്തേ രേഖപ്പെടുത്തിയിട്ടുണ്ട്.", hi: "{name} ({time}) पहले से दर्ज है।" },
  not_allowed: { en: "Sorry, you can't change doses for this person.", ml: "ക്ഷമിക്കണം, ഈ വ്യക്തിയുടെ ഡോസ് മാറ്റാൻ നിങ്ങൾക്ക് അനുമതിയില്ല.", hi: "माफ़ कीजिए, आप इस व्यक्ति की खुराक नहीं बदल सकते।" },
  dose_not_found: { en: "I couldn't find that dose for today.", ml: "ഇന്നത്തെ ആ ഡോസ് കണ്ടെത്താനായില്ല.", hi: "आज की वह खुराक नहीं मिली।" },
  next_dose: { en: "Your next medicine is {name} at {time}.", ml: "അടുത്ത മരുന്ന് {name}, {time}-ന്.", hi: "आपकी अगली दवा {name} है, {time} बजे।" },
  today_list: { en: "Here are today's medicines.", ml: "ഇന്നത്തെ മരുന്നുകൾ ഇതാ.", hi: "ये रहीं आज की दवाएँ।" },
  none_pending: { en: "All done for now. No more doses due today.", ml: "ഇപ്പോഴത്തേത് കഴിഞ്ഞു. ഇന്ന് ഇനി ഡോസ് ഇല്ല.", hi: "अभी के लिए सब हो गया। आज और कोई खुराक नहीं है।" },
  no_doses: { en: "No medicines are scheduled for today.", ml: "ഇന്ന് മരുന്നുകൾ ഷെഡ്യൂൾ ചെയ്തിട്ടില്ല.", hi: "आज कोई दवा तय नहीं है।" },
  medicine_card: { en: "Here is the checked information for {name}.", ml: "{name} എന്നതിന്റെ പരിശോധിച്ച വിവരം ഇതാ.", hi: "{name} की जाँची हुई जानकारी यह है।" },
  medicine_not_verified: {
    en: "I can only explain medicines that are verified on your prescription.",
    ml: "നിങ്ങളുടെ കുറിപ്പടിയിൽ സ്ഥിരീകരിച്ച മരുന്നുകളെക്കുറിച്ച് മാത്രമേ എനിക്ക് പറയാനാകൂ.",
    hi: "मैं केवल उन्हीं दवाओं के बारे में बता सकता हूँ जो आपके पर्चे पर सत्यापित हैं।",
  },
  savings: { en: "Here's what you could save with Jan Aushadhi generics.", ml: "ജൻ ഔഷധി ജനറിക് മരുന്നുകളിലൂടെ ലാഭിക്കാവുന്നത് ഇതാ.", hi: "जन औषधि जेनेरिक से आप इतनी बचत कर सकते हैं।" },
  no_savings: {
    en: "I couldn't find a matching generic for your verified medicines.",
    ml: "സ്ഥിരീകരിച്ച മരുന്നുകൾക്ക് പൊരുത്തമുള്ള ജനറിക് കണ്ടെത്താനായില്ല.",
    hi: "आपकी सत्यापित दवाओं के लिए मिलती-जुलती जेनेरिक दवा नहीं मिली।",
  },
  expiry: { en: "Here are your medicine expiry dates.", ml: "നിങ്ങളുടെ മരുന്നുകളുടെ കാലാവധി തീയതികൾ ഇതാ.", hi: "ये रहीं आपकी दवाओं की एक्सपायरी तारीखें।" },
  no_expiry: {
    en: "No confirmed expiry dates yet. Scan a medicine strip to add one.",
    ml: "സ്ഥിരീകരിച്ച കാലാവധി തീയതികൾ ഇല്ല. ചേർക്കാൻ ഒരു സ്ട്രിപ്പ് സ്കാൻ ചെയ്യൂ.",
    hi: "अभी कोई पक्की एक्सपायरी तारीख नहीं है। जोड़ने के लिए दवा की पट्टी स्कैन करें।",
  },
  locker: { en: "I found {count} prescription(s).", ml: "{count} കുറിപ്പടി(കൾ) കണ്ടെത്തി.", hi: "{count} पर्चे मिले।" },
  no_locker: { en: "I couldn't find a matching prescription.", ml: "പൊരുത്തമുള്ള കുറിപ്പടി കണ്ടെത്താനായില്ല.", hi: "मिलता-जुलता पर्चा नहीं मिला।" },
  sos: {
    en: "If you need help, tap Open SOS. It counts down before alerting anyone, so you can cancel.",
    ml: "സഹായം വേണമെങ്കിൽ SOS തുറക്കൂ അമർത്തൂ. ആരെയും അറിയിക്കുന്നതിന് മുമ്പ് കൗണ്ട്ഡൗൺ ഉണ്ട്, റദ്ദാക്കാം.",
    hi: "मदद चाहिए तो \"SOS खोलें\" दबाएँ। किसी को बताने से पहले उलटी गिनती होती है, आप रद्द कर सकते हैं।",
  },
} satisfies Record<string, Record<Lang, string>>;

export type PhraseKey = keyof typeof PHRASES;

export function phrase(key: PhraseKey, lang: Lang, vars: Record<string, string | number> = {}): string {
  return PHRASES[key][lang].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// ---------- today's doses (same query as /api/today) ----------

type DoseRow = {
  id: string;
  due_at: string;
  state: string;
  schedule_id: string;
  patient_id: string;
  schedules: { pill_photo_path: string | null; prescription_items: { food: string | null; medicine_catalog: { name: string; form: string } } };
};

const DOSE_SELECT =
  "id, due_at, state, schedule_id, patient_id, schedules!inner(pill_photo_path, prescription_items!inner(food, medicine_catalog!inner(name, form)))";

export type DoseCardItem = { id: string; name: string; form: string; food: "before" | "after" | null; time: string; slot: string; state: string; photoUrl: string | null };

async function toDoseItems(ctx: AgentContext, rows: DoseRow[]): Promise<DoseCardItem[]> {
  const photos = new Map<string, string | null>();
  for (const r of rows) {
    if (!photos.has(r.schedule_id)) photos.set(r.schedule_id, await signedPhoto(ctx.supabase, r.schedules.pill_photo_path));
  }
  return rows.map((r) => {
    const item = r.schedules.prescription_items;
    const time = istClock(r.due_at);
    return {
      id: r.id,
      name: item.medicine_catalog.name,
      form: item.medicine_catalog.form,
      food: item.food === "before" || item.food === "after" ? item.food : null,
      time,
      slot: slotOf(time),
      state: r.state,
      photoUrl: photos.get(r.schedule_id) ?? null,
    };
  });
}

export async function todayDoses(ctx: AgentContext): Promise<DoseCardItem[]> {
  const today = istDate();
  const { data } = await ctx.supabase
    .from("dose_events")
    .select(DOSE_SELECT)
    .eq("patient_id", ctx.patientId)
    .gte("due_at", istMoment(today, "00:00").toISOString())
    .lt("due_at", istMoment(addDays(today, 1), "00:00").toISOString())
    .order("due_at");
  return toDoseItems(ctx, (data ?? []) as unknown as DoseRow[]);
}

const isOpen = (state: string) => state === "pending" || state === "snoozed";

const getTodaySchedule: AgentTool = {
  name: "get_today_schedule",
  description: "Today's medicine doses for this person (verified medicines only), with dose_id, name, time and state. Use for 'what's next', 'today', or to find a dose_id before mark_dose.",
  parameters: { type: "object", properties: { only_next: { type: "boolean", description: "true = only the next dose still due" } } },
  async run(ctx, args) {
    const doses = await todayDoses(ctx);
    const next = doses.find((d) => isOpen(d.state));
    const shown = args.only_next === true ? (next ? [next] : []) : doses;
    const say = !doses.length
      ? phrase("no_doses", ctx.lang)
      : args.only_next === true
        ? next
          ? phrase("next_dose", ctx.lang, { name: next.name, time: next.time })
          : phrase("none_pending", ctx.lang)
        : phrase("today_list", ctx.lang);
    return {
      data: { now: istClock(new Date()), doses: shown.map((d) => ({ dose_id: d.id, name: d.name, time: d.time, slot: d.slot, state: d.state })), say },
      cards: shown.length ? [{ kind: "doses", doses: shown }] : [],
    };
  },
};

// ---------- mark a dose (always confirm-back first) ----------

/** Records a dose action. Exported so the API route can run it directly after a "yes". */
export async function markDose(ctx: ToolContext, doseId: string, action: DoseAction, confirmed: boolean): Promise<ToolResult> {
  const { data } = await ctx.supabase.from("dose_events").select(DOSE_SELECT).eq("id", doseId).maybeSingle();
  const row = data as unknown as DoseRow | null;
  if (!row || row.patient_id !== ctx.patientId) return { data: { status: "not_found", say: phrase("dose_not_found", ctx.lang) } };
  const [dose] = await toDoseItems(ctx, [row]);
  const vars = { name: dose.name, time: dose.time };
  if (!isOpen(dose.state)) return { data: { status: "already", state: dose.state, say: phrase("already", ctx.lang, vars) }, cards: [{ kind: "doses", doses: [dose] }] };

  // Only act when the person said "yes" to THIS dose and action in this turn. The AI can't skip this.
  const yes = confirmed && ctx.confirmed?.doseId === doseId && ctx.confirmed.action === action;
  if (!yes) {
    const say = phrase(`confirm_${action}`, ctx.lang, vars);
    return {
      data: { status: "needs_confirmation", say },
      cards: [{ kind: "confirm", text: say, doseId, action }],
    };
  }

  const { data: ev, error } = await ctx.supabase.rpc("act_on_dose", { p_event: doseId, p_action: action, p_op: crypto.randomUUID() });
  if (error) return { data: { status: "not_allowed", say: phrase("not_allowed", ctx.lang) } };
  const state = (ev as { state: string }).state;
  return { data: { status: "done", state, say: phrase(`done_${action}`, ctx.lang, vars) }, cards: [{ kind: "doses", doses: [{ ...dose, state }] }] };
}

const markDoseTool: AgentTool = {
  name: "mark_dose",
  description:
    "Mark one of today's doses taken, skipped or snoozed. The first call always returns needs_confirmation with a sentence to ask the person; the app handles their yes/no. Get dose_id from get_today_schedule first.",
  parameters: {
    type: "object",
    properties: {
      dose_id: { type: "string" },
      action: { type: "string", enum: ACTIONS },
      confirmed: { type: "boolean", description: "Leave false. The app confirms with the person." },
    },
    required: ["dose_id", "action"],
  },
  async run(ctx, args) {
    const action = ACTIONS.find((a) => a === args.action);
    const doseId = str(args.dose_id);
    if (!action || !/^[0-9a-f-]{36}$/i.test(doseId)) return { data: { status: "not_found", say: phrase("dose_not_found", ctx.lang) } };
    return markDose(ctx as ToolContext, doseId, action, args.confirmed === true);
  },
};

// ---------- verified medicines (schedules exist only for verified items) ----------

type MedRow = {
  id: string;
  slot_times: string[];
  prescription_items: {
    status: string;
    strength: string | null;
    medicine_catalog: {
      id: string;
      name: string;
      form: string;
      strength: string;
      ingredients: string[];
      mrp: number | null;
      pack_size: number | null;
      uses_en: string | null;
      uses_ml: string | null;
      uses_hi: string | null;
      side_effects_en: string | null;
      side_effects_ml: string | null;
      side_effects_hi: string | null;
      source: string;
      reviewed: boolean | null;
    };
  };
};

async function verifiedMedicines(ctx: AgentContext): Promise<MedRow[]> {
  const { data } = await ctx.supabase
    .from("schedules")
    .select(
      "id, slot_times, prescription_items!inner(status, strength, medicine_catalog!inner(id, name, form, strength, ingredients, mrp, pack_size, uses_en, uses_ml, uses_hi, side_effects_en, side_effects_ml, side_effects_hi, source, reviewed))",
    )
    .eq("patient_id", ctx.patientId)
    .eq("active", true)
    .eq("prescription_items.status", "verified");
  // Belt and braces: the DB trigger already allows schedules only for verified items.
  return ((data ?? []) as unknown as MedRow[]).filter((m) => m.prescription_items.status === "verified");
}

const lower = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const getMedicineCard: AgentTool = {
  name: "get_medicine_card",
  description:
    "Shows the checked uses and side effects card for one of this person's VERIFIED medicines. Use for any question about what a medicine is for or its side effects. You must not repeat the card's facts.",
  parameters: { type: "object", properties: { name_or_schedule_id: { type: "string" } }, required: ["name_or_schedule_id"] },
  async run(ctx, args) {
    const q = lower(str(args.name_or_schedule_id));
    const meds = q ? await verifiedMedicines(ctx) : [];
    // Exact id or exact name first; then a name that contains the words asked ("glyconil" → "Glyconil 500").
    const med =
      meds.find((m) => m.id === q || lower(m.prescription_items.medicine_catalog.name) === q) ??
      meds.find((m) => q.length >= 4 && lower(m.prescription_items.medicine_catalog.name).includes(q));
    if (!med) return { data: { status: "not_verified", say: phrase("medicine_not_verified", ctx.lang) } };

    const c = med.prescription_items.medicine_catalog;
    // Facts in the person's language; fall back to English (marked) when not translated yet.
    const uses = c[`uses_${ctx.lang}`] ?? c.uses_en;
    const sideEffects = c[`side_effects_${ctx.lang}`] ?? c.side_effects_en;
    const card: AgentCard = {
      kind: "medicine",
      scheduleId: med.id,
      name: c.name,
      strength: c.strength,
      form: c.form,
      uses,
      sideEffects,
      source: factSource(c),
      inEnglish: ctx.lang !== "en" && !c[`uses_${ctx.lang}`],
    };
    // The model sees only that a card was shown — not the facts, so it can't reword them.
    return { data: { status: "card_shown", name: c.name, say: phrase("medicine_card", ctx.lang, { name: c.name }) }, cards: [card] };
  },
};

// ---------- savings (prices from DB rows only) ----------

type Generic = { ja_code: string; name: string; ingredients: string[]; strength: string; mrp: number; pack_size: number };

const sameIngredients = (a: string[], b: string[]) => {
  const x = a.map(lower).sort().join("|");
  return x !== "" && x === b.map(lower).sort().join("|");
};

const getSavingsSummary: AgentTool = {
  name: "get_savings_summary",
  description: "Shows a card comparing this person's verified medicines with Jan Aushadhi generic prices. Do not state any prices yourself.",
  parameters: { type: "object", properties: {} },
  async run(ctx) {
    const meds = await verifiedMedicines(ctx);
    // Only generics sharing an ingredient (the full list is over the 1,000-row API limit).
    const ingredients = [...new Set(meds.flatMap((m) => m.prescription_items.medicine_catalog.ingredients))];
    const { data } = ingredients.length
      ? await ctx.supabase.from("generic_products").select("ja_code, name, ingredients, strength, mrp, pack_size").overlaps("ingredients", ingredients)
      : { data: [] };
    const generics = (data ?? []) as Generic[];
    const rows = [];
    for (const m of meds) {
      const c = m.prescription_items.medicine_catalog;
      if (!c.mrp || !c.pack_size) continue;
      // Same active ingredients AND same strength, or it's not a fair swap.
      const g = generics.find((x) => sameIngredients(x.ingredients, c.ingredients) && normalizeStrength(x.strength) === normalizeStrength(c.strength));
      if (!g || !g.pack_size) continue;
      const perDay = m.slot_times.length;
      const yearly = Math.round((Number(c.mrp) / c.pack_size - Number(g.mrp) / g.pack_size) * perDay * 365);
      rows.push({ name: c.name, brandMrp: Number(c.mrp), brandPack: c.pack_size, genericName: g.name, genericMrp: Number(g.mrp), genericPack: g.pack_size, yearly: Math.max(0, yearly) });
    }
    const total = rows.reduce((a, r) => a + r.yearly, 0);
    if (!rows.length) return { data: { status: "none", say: phrase("no_savings", ctx.lang) } };
    return { data: { status: "card_shown", medicines: rows.length, say: phrase("savings", ctx.lang) }, cards: [{ kind: "savings", rows, total }] };
  },
};

// ---------- expiry (confirmed expiry months only) ----------

const getExpiryList: AgentTool = {
  name: "get_expiry_list",
  description: "Shows a card with the confirmed expiry dates of this person's scanned medicine strips, soonest first.",
  parameters: { type: "object", properties: {} },
  async run(ctx) {
    const { data } = await ctx.supabase
      .from("strips")
      .select("id, expiry_month, state, medicine_catalog(name)")
      .eq("patient_id", ctx.patientId)
      .eq("status", "verified")
      .not("expiry_month", "is", null)
      .neq("state", "finished")
      .order("expiry_month");
    const today = istDate();
    const items = ((data ?? []) as unknown as { id: string; expiry_month: string; medicine_catalog: { name: string } | null }[]).map((s) => {
      // A strip is good until the END of its expiry month.
      const lastDay = addDays(addDays(s.expiry_month.slice(0, 7) + "-01", 32).slice(0, 7) + "-01", -1);
      const daysLeft = Math.round((Date.parse(lastDay) - Date.parse(today)) / 86_400_000);
      return { id: s.id, name: s.medicine_catalog?.name ?? "", month: s.expiry_month.slice(0, 7), daysLeft, badge: daysLeft < 0 ? "expired" : daysLeft <= 30 ? "soon" : "ok" };
    });
    if (!items.length) return { data: { status: "none", say: phrase("no_expiry", ctx.lang) } };
    return {
      data: { status: "card_shown", expired: items.filter((i) => i.badge === "expired").length, soon: items.filter((i) => i.badge === "soon").length, say: phrase("expiry", ctx.lang) },
      cards: [{ kind: "expiry", items }],
    };
  },
};

// ---------- prescription locker (approved, confirmed fields only) ----------

const searchLocker: AgentTool = {
  name: "search_locker",
  description: "Finds this person's approved prescriptions by verified medicine name or doctor name. Empty query lists them all, newest first.",
  parameters: { type: "object", properties: { query: { type: "string" } } },
  async run(ctx, args) {
    const q = lower(str(args.query));
    const { data } = await ctx.supabase
      .from("prescriptions")
      .select("id, created_at, doctor_name, prescription_items(status, medicine_catalog(name))")
      .eq("patient_id", ctx.patientId)
      .eq("state", "approved")
      .order("created_at", { ascending: false })
      .limit(50);
    type Rx = { id: string; created_at: string; doctor_name: string | null; prescription_items: { status: string; medicine_catalog: { name: string } | null }[] };
    const all = ((data ?? []) as unknown as Rx[]).map((p) => ({
      id: p.id,
      date: istDate(new Date(p.created_at)),
      doctor: p.doctor_name,
      medicines: p.prescription_items.filter((i) => i.status === "verified" && i.medicine_catalog).map((i) => i.medicine_catalog!.name),
    }));
    const items = q ? all.filter((p) => lower(p.doctor ?? "").includes(q) || p.medicines.some((m) => lower(m).includes(q))) : all;
    if (!items.length) return { data: { status: "none", say: phrase("no_locker", ctx.lang) } };
    const shown = items.slice(0, 5);
    return {
      data: { status: "card_shown", count: items.length, say: phrase("locker", ctx.lang, { count: items.length }) },
      cards: [{ kind: "locker", items: shown }],
    };
  },
};

// ---------- SOS and refusal ----------

const startSos: AgentTool = {
  name: "start_sos",
  description: "The person needs emergency help. Shows an 'Open SOS' button; it does NOT alert anyone by itself. (SOS written on a prescription means 'when needed' — that is not this.)",
  parameters: { type: "object", properties: {} },
  async run(ctx) {
    return { data: { status: "button_shown", say: phrase("sos", ctx.lang) }, cards: [{ kind: "sos" }] };
  },
};

const refuse: AgentTool = {
  name: "refuse",
  description: "Use when asked for dose advice, a diagnosis, identifying a tablet by its look, or anything you can't answer from the tools.",
  parameters: { type: "object", properties: { reason: { type: "string", enum: ["dose_advice", "diagnosis", "identify_tablet", "other"] } } },
  async run(ctx) {
    return { data: { status: "refused", say: REFUSAL[ctx.lang] } };
  },
};

/** All assistant tools. Concatenate other lists (e.g. refill tools) onto this array. */
export const agentTools: AgentTool[] = [getTodaySchedule, markDoseTool, getMedicineCard, getSavingsSummary, getExpiryList, searchLocker, startSos, refuse];
