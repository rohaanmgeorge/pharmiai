import { NextResponse } from "next/server";
import { safetyLog } from "@/lib/safety/log";
import type { CatalogEntry } from "@/lib/safety/match";
import { computeStripStatus, parseExpiry, type StripReading } from "@/lib/safety/strip";
import { canManage, fail, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { catalogCandidates } from "@/lib/server/catalog";

// POST /api/strips/:id/confirm
//   { catalogId, expiry: "YYYY-MM", batch?, quantity?, scheduleId?, addToStock? }
// A person says "I checked the strip". We re-run the SAME Zero-Guess rules with their
// confirmation; only a Verified strip gets an expiry month, a reminder link or stock.
export async function POST(request: Request, ctx: RouteContext<"/api/strips/[id]/confirm">) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const { id } = await ctx.params;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const catalogId = typeof body.catalogId === "string" ? body.catalogId : "";
  const expiry = typeof body.expiry === "string" ? parseExpiry(body.expiry) : null;
  const batch = typeof body.batch === "string" && body.batch.trim() ? body.batch.trim().slice(0, 30) : null;
  const quantity = body.quantity === undefined || body.quantity === null || body.quantity === "" ? null : Number(body.quantity);
  const scheduleId = typeof body.scheduleId === "string" && body.scheduleId ? body.scheduleId : null;
  const addToStock = body.addToStock === true;
  if (!catalogId || !expiry) return fail("Please choose the medicine and fill the expiry month");
  if (quantity !== null && (!Number.isInteger(quantity) || quantity < 0 || quantity > 1000)) return fail("Quantity must be a whole number from 0 to 1000");
  if (addToStock && (!scheduleId || !quantity)) return fail("To add to stock, link a reminder and type the quantity");

  const { data: strip } = await supabase
    .from("strips")
    .select("id, patient_id, image_path, reading_a, reading_b, catalog_id, status, batch")
    .eq("id", id)
    .maybeSingle();
  if (!strip) return fail("Medicine not found", 404);
  if (!(await canManage(supabase, strip.patient_id))) return fail("Not allowed", 403);
  if (strip.status === "verified") return NextResponse.json({ status: "verified", reasons: [], linked: false });

  const readA = strip.reading_a as StripReading | null;
  const readB = strip.reading_b as StripReading | null;
  const catalog = await catalogCandidates(supabase, [readA, readB].map((r) => r && { name: r.brand, strength: r.strength }));
  const result = computeStripStatus({
    a: strip.reading_a as StripReading | null,
    b: strip.reading_b as StripReading | null,
    catalog: (catalog ?? []) as CatalogEntry[],
    confirmation: { catalogId, expiry },
  });

  // Linking is never automatic and only to a reminder for the exact same catalog entry.
  let schedule: { id: string; stock: number } | null = null;
  if (scheduleId) {
    const { data: s } = await supabase
      .from("schedules")
      .select("id, patient_id, stock, prescription_items!inner(catalog_id)")
      .eq("id", scheduleId)
      .maybeSingle();
    const sameMedicine = s && s.patient_id === strip.patient_id && (s.prescription_items as unknown as { catalog_id: string }).catalog_id === catalogId;
    if (!sameMedicine) return fail("This reminder is for a different medicine, so we can't link it");
    schedule = { id: s.id, stock: s.stock };
  }

  const admin = supabaseAdmin();
  if (result.status !== "verified") {
    await admin.from("strips").update({ reasons: result.reasons }).eq("id", id);
    await safetyLog([{ actor: user.id, patientId: strip.patient_id, event: "strip_human_confirm", payload: { strip: id, result: result.status } }]);
    return NextResponse.json({ status: result.status, reasons: result.reasons, linked: false });
  }

  const { error } = await admin
    .from("strips")
    .update({
      status: "verified",
      catalog_id: catalogId,
      expiry_month: `${expiry}-01`, // first day of the confirmed month
      batch: batch ?? strip.batch,
      quantity,
      schedule_id: schedule?.id ?? null,
      reasons: [],
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return fail("Could not save", 500);

  if (schedule) {
    // The strip photo doubles as the reminder's pill photo. Stock only grows when the person asked.
    const update: { pill_photo_path: string; stock?: number } = { pill_photo_path: strip.image_path };
    if (addToStock && quantity) update.stock = schedule.stock + quantity;
    const { error: linkError } = await admin.from("schedules").update(update).eq("id", schedule.id);
    if (linkError) return fail("Saved, but could not link the reminder", 500);
  }

  await safetyLog([
    {
      actor: user.id,
      patientId: strip.patient_id,
      event: "strip_human_confirm",
      payload: { strip: id, result: "verified", catalogId, expiry, linked: Boolean(schedule), addedToStock: addToStock ? quantity : 0 },
    },
  ]);
  return NextResponse.json({ status: "verified", reasons: [], linked: Boolean(schedule) });
}
