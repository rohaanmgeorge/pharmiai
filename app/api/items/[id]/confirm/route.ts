import { NextResponse } from "next/server";
import { canManage, fail, requireUser } from "@/lib/server/auth";
import { safetyLog } from "@/lib/safety/log";
import type { CatalogEntry } from "@/lib/safety/match";
import { normalizeCode } from "@/lib/safety/shorthand";
import { computeStatus, type Reading } from "@/lib/safety/status";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { catalogCandidates } from "@/lib/server/catalog";

// POST /api/items/:id/confirm  { catalogId, doseCode, durationDays }
// A person says "I checked the paper". We re-run the SAME Zero-Guess rules with their
// confirmation; the item becomes Verified only if every rule passes. Otherwise it stays as is.
export async function POST(request: Request, ctx: RouteContext<"/api/items/[id]/confirm">) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const { id } = await ctx.params;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const catalogId = typeof body.catalogId === "string" ? body.catalogId : "";
  const doseCode = typeof body.doseCode === "string" ? normalizeCode(body.doseCode) : "";
  const durationDays = Number(body.durationDays);
  if (!catalogId || !doseCode || !Number.isInteger(durationDays)) return fail("Please choose the medicine and fill dose and days");

  const { data: item } = await supabase
    .from("prescription_items")
    .select("id, patient_id, prescription_id, reading_a, reading_b, status")
    .eq("id", id)
    .maybeSingle();
  if (!item) return fail("Medicine not found", 404);
  if (!(await canManage(supabase, item.patient_id))) return fail("Not allowed", 403);
  if (item.status === "verified") return NextResponse.json({ status: "verified", reasons: [] });

  const catalog = await catalogCandidates(supabase, [item.reading_a as Reading | null, item.reading_b as Reading | null]);
  const result = computeStatus({
    a: item.reading_a as Reading | null,
    b: item.reading_b as Reading | null,
    catalog: (catalog ?? []) as CatalogEntry[],
    confirmation: { catalogId, doseCode, durationDays },
  });

  const admin = supabaseAdmin();
  if (result.status === "verified") {
    const entry = catalog?.find((c) => c.id === catalogId);
    const { error } = await admin
      .from("prescription_items")
      .update({
        status: "verified",
        catalog_id: catalogId,
        strength: entry?.strength,
        dose_code: doseCode,
        duration_days: durationDays,
        reasons: [],
        confirmed_by: user.id,
        confirmed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return fail("Could not save", 500);
  } else {
    await admin.from("prescription_items").update({ reasons: result.reasons }).eq("id", id);
  }

  await safetyLog([
    { actor: user.id, patientId: item.patient_id, itemId: id, event: "human_confirm", payload: { result: result.status, catalogId, doseCode, durationDays } },
  ]);
  return NextResponse.json({ status: result.status, reasons: result.reasons });
}
