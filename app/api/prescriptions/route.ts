import { NextResponse } from "next/server";
import { readingA, readingB, type ReadItem } from "@/lib/ai/read-prescription";
import { alignReadings } from "@/lib/safety/align";
import { safetyLog } from "@/lib/safety/log";
import type { CatalogEntry } from "@/lib/safety/match";
import { normalizeCode } from "@/lib/safety/shorthand";
import { computeStatus } from "@/lib/safety/status";
import { requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 60; // two AI readings can take a while

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

// POST /api/prescriptions  (multipart form: image, optional patientId)
// Scan → two independent readings → Zero-Guess status per medicine → saved for review.
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;

  const form = await request.formData();
  const file = form.get("image");
  const patientId = String(form.get("patientId") || user.id);
  if (!(file instanceof File)) return NextResponse.json({ error: "Please attach a photo" }, { status: 400 });
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "Please use a JPG, PNG or HEIC photo" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Photo is too large (max 5 MB)" }, { status: 400 });

  const { data: allowed } = await supabase.rpc("can_manage", { p: patientId });
  if (!allowed) return NextResponse.json({ error: "You can't add prescriptions for this person" }, { status: 403 });

  // 1. Save the photo privately (folder = patient id, enforced by storage policies).
  const bytes = Buffer.from(await file.arrayBuffer());
  const path = `${patientId}/${crypto.randomUUID()}`;
  const upload = await supabase.storage.from("rx-images").upload(path, bytes, { contentType: file.type });
  if (upload.error) return NextResponse.json({ error: "Could not save the photo" }, { status: 500 });

  const { data: rx, error: rxError } = await supabase
    .from("prescriptions")
    .insert({ patient_id: patientId, uploaded_by: user.id, image_path: path })
    .select("id")
    .single();
  if (rxError || !rx) return NextResponse.json({ error: "Could not save the prescription" }, { status: 500 });

  // 2. Two independent readings, in parallel. A failed reading is simply missing → items stay "Needs check".
  const image = { data: bytes.toString("base64"), mimeType: file.type };
  const [resA, resB] = await Promise.allSettled([readingA(image), readingB(image)]);
  const itemsA: ReadItem[] = resA.status === "fulfilled" ? resA.value.items : [];
  const itemsB: ReadItem[] = resB.status === "fulfilled" ? resB.value.items : [];

  const admin = supabaseAdmin();
  // Doctor name is only a suggestion until a person confirms it on the review screen.
  const doctorRead = resA.status === "fulfilled" ? resA.value.doctor : null;
  if (doctorRead) await admin.from("prescriptions").update({ doctor_read: doctorRead }).eq("id", rx.id);
  await admin.from("readings").insert([
    { prescription_id: rx.id, engine: "gemini_a", raw: resA.status === "fulfilled" ? { model: resA.value.model, items: itemsA } : { error: "failed" } },
    { prescription_id: rx.id, engine: "gemini_b", raw: resB.status === "fulfilled" ? { model: resB.value.model, items: itemsB } : { error: "failed" } },
  ]);

  // 3. Zero-Guess status for every medicine line (code decides, not the AI).
  const { data: catalog } = await supabase.from("medicine_catalog").select("id, name, ingredients, strength");
  const pairs = alignReadings(itemsA, itemsB);
  const rows = pairs.map(({ a, b }) => {
    const result = computeStatus({ a, b, catalog: (catalog ?? []) as CatalogEntry[] });
    const code = a?.doseCode ?? b?.doseCode ?? null;
    return {
      prescription_id: rx.id,
      patient_id: patientId,
      text_a: a?.name ?? null,
      text_b: b?.name ?? null,
      catalog_id: result.catalogId,
      candidates: result.candidates.map((c) => ({ id: c.id, name: c.name, strength: c.strength, ingredients: c.ingredients })),
      strength: a?.strength ?? b?.strength ?? null,
      dose_code: code ? normalizeCode(code) : null,
      duration_days: a?.durationDays ?? b?.durationDays ?? null,
      food: a?.food ?? b?.food ?? null,
      status: result.status, // never "verified" here: a person has not confirmed yet
      reasons: result.reasons,
      reading_a: a, // kept so the confirm step can re-check against both readings
      reading_b: b,
    };
  });

  const { data: saved, error: itemsError } = rows.length ? await admin.from("prescription_items").insert(rows).select("id, status") : { data: [], error: null };
  if (itemsError) return NextResponse.json({ error: "Could not save the medicines" }, { status: 500 });

  await safetyLog([
    { actor: user.id, patientId, event: "reading_a", payload: { prescription: rx.id, ok: resA.status === "fulfilled", count: itemsA.length } },
    { actor: user.id, patientId, event: "reading_b", payload: { prescription: rx.id, ok: resB.status === "fulfilled", count: itemsB.length } },
    ...(saved ?? []).map((s) => ({ actor: user.id, patientId, itemId: s.id, event: "status_computed", payload: { status: s.status } })),
  ]);

  return NextResponse.json({ prescriptionId: rx.id, count: rows.length, needsCheck: rows.filter((r) => r.status !== "not_recognized").length });
}
