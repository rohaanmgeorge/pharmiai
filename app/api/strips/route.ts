import { NextResponse } from "next/server";
import { stripReadingA, stripReadingB } from "@/lib/ai/read-strip";
import { safetyLog } from "@/lib/safety/log";
import type { CatalogEntry } from "@/lib/safety/match";
import { computeStripStatus, parseExpiry, expiryBadge, formatExpiry, type StripReading } from "@/lib/safety/strip";
import { canManage, canView, fail, requireUser } from "@/lib/server/auth";
import { istDate } from "@/lib/server/time";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { catalogCandidates, cityOf, identifyMissing } from "@/lib/server/catalog";
import { describeAiError } from "@/lib/ai/errors";
import { autoVerify } from "@/lib/safety/auto-verify";

export const maxDuration = 60; // two AI readings can take a while

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

// POST /api/strips  (multipart form: image, optional patientId)
// Strip photo → two blind readings → Zero-Guess status → saved for a person to confirm.
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const form = await request.formData();
  const file = form.get("image");
  const patientId = String(form.get("patientId") || user.id);
  if (!(file instanceof File)) return fail("Please attach a photo");
  if (!ALLOWED.includes(file.type)) return fail("Please use a JPG, PNG or HEIC photo");
  if (file.size > MAX_BYTES) return fail("Photo is too large (max 5 MB)");
  if (!(await canManage(supabase, patientId))) return fail("You can't add medicines for this person", 403);

  // 1. Save the photo privately (folder = patient id, enforced by storage policies).
  const bytes = Buffer.from(await file.arrayBuffer());
  const path = `${patientId}/${crypto.randomUUID()}`;
  const upload = await supabase.storage.from("rx-images").upload(path, bytes, { contentType: file.type });
  if (upload.error) return fail("Could not save the photo", 500);

  // 2. Two blind readings in parallel. A failed reading is simply missing → stays "Needs check".
  const image = { data: bytes.toString("base64"), mimeType: file.type };
  const [resA, resB] = await Promise.allSettled([stripReadingA(image), stripReadingB(image)]);
  if (resA.status === "rejected" && resB.status === "rejected") {
    // Both failed (e.g. daily AI limit): remove the photo and say exactly why.
    const problem = describeAiError(resA.reason);
    await supabase.storage.from("rx-images").remove([path]);
    return NextResponse.json({ error: problem.message, kind: problem.kind }, { status: problem.status });
  }
  const a: StripReading | null = resA.status === "fulfilled" ? resA.value.reading : null;
  const b: StripReading | null = resB.status === "fulfilled" ? resB.value.reading : null;

  // 3. Status is decided in code, not by the AI.
  const named = [a, b].map((r) => r && { name: r.brand, strength: r.strength });
  const problem = await identifyMissing(supabase, named, await cityOf(supabase, patientId));
  const catalog = await catalogCandidates(supabase, named);
  const result = computeStripStatus({ a, b, catalog: (catalog ?? []) as CatalogEntry[] });
  // Verified automatically (team decision): the medicine named on the strip (reading 1 first) and
  // the expiry printed on it. Notes record anything that differed.
  const auto = autoVerify({ a: a && { name: a.brand, strength: a.strength, doseCode: null, durationDays: null }, b: b && { name: b.brand, strength: b.strength, doseCode: null, durationDays: null }, catalog });
  const expiry = result.expiryRead ?? parseExpiry(a?.expiry) ?? parseExpiry(b?.expiry);
  const notes = [
    ...auto.notes.filter((n) => !/timing|days/.test(n)), // a strip has no dose or days
    ...(expiry ? [] : ["The expiry date could not be read. Add it by hand."]),
    ...(auto.status === "not_recognized" && problem ? [`Couldn't identify this medicine: ${problem.message}`] : []),
  ];

  const { data: strip, error } = await supabaseAdmin()
    .from("strips")
    .insert({
      patient_id: patientId,
      created_by: user.id,
      image_path: path,
      reading_a: a,
      reading_b: b,
      catalog_id: auto.catalogId,
      candidates: auto.candidates.map((c) => ({ id: c.id, name: c.name, strength: c.strength, ingredients: c.ingredients })),
      status: auto.status,
      verified_by: "ai",
      reasons: notes,
      expiry_read: expiry,
      expiry_month: auto.status === "verified" && expiry ? `${expiry}-01` : null,
      batch: result.batchRead,
    })
    .select("id, status")
    .single();
  if (error || !strip) return fail("Could not save the medicine", 500);

  await safetyLog([
    { actor: user.id, patientId, event: "strip_reading_a", payload: { strip: strip.id, ok: resA.status === "fulfilled" } },
    { actor: user.id, patientId, event: "strip_reading_b", payload: { strip: strip.id, ok: resB.status === "fulfilled" } },
    { actor: user.id, patientId, event: "strip_status_computed", payload: { strip: strip.id, status: strip.status, expiryAgreed: Boolean(result.expiryRead) } },
  ]);

  return NextResponse.json({ stripId: strip.id, count: 1, needsCheck: 0 });
}

type ListRow = {
  id: string;
  status: string;
  state: string;
  catalog_id: string | null;
  expiry_month: string | null;
  quantity: number | null;
  reading_a: StripReading | null;
  medicine_catalog: { name: string } | null;
};

// GET /api/strips?patient=<id> — the Expiry list, soonest first. Finished strips are hidden.
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const patientId = new URL(request.url).searchParams.get("patient") || user.id;
  if (!(await canView(supabase, patientId))) return fail("Not allowed", 403);

  const { data } = await supabase
    .from("strips")
    .select("id, status, state, catalog_id, expiry_month, quantity, reading_a, medicine_catalog(name)")
    .eq("patient_id", patientId)
    .neq("state", "finished")
    .order("expiry_month", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as unknown as ListRow[];

  const today = istDate();
  const strips = rows.map((s) => {
    // An expiry counts only after a person confirmed it (expiry_month is set only when Verified).
    const confirmed = s.status === "verified" ? s.expiry_month : null;
    const { badge, daysLeft } = expiryBadge(confirmed, today);
    return {
      id: s.id,
      // Name only from the catalog once matched; otherwise what the reading saw, clearly marked unchecked.
      name: s.status === "not_recognized" ? "Unclear medicine" : (s.medicine_catalog?.name ?? s.reading_a?.brand ?? "Unclear medicine"),
      status: s.status,
      expiry: formatExpiry(confirmed),
      badge: s.state === "expired" ? "expired" : badge,
      daysLeft,
      quantity: s.quantity,
    };
  });

  return NextResponse.json({ patientId, strips, canManage: await canManage(supabase, patientId) });
}
