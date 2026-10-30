import { NextResponse } from "next/server";
import { canView, fail, requireUser, signedPhoto } from "@/lib/server/auth";

type Item = {
  status: string;
  medicine_catalog: { name: string; ingredients: string[] } | null;
  // schedules.item_id is unique, so Supabase returns one object (or null); arrays handled just in case.
  schedules: { active: boolean } | { active: boolean }[] | null;
};
type Rx = { id: string; created_at: string; doctor_name: string | null; image_path: string; prescription_items: Item[] };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isActive = (i: Item) => (Array.isArray(i.schedules) ? i.schedules.some((s) => s.active) : Boolean(i.schedules?.active));

// GET /api/locker?patient=&q=&from=YYYY-MM-DD&to=YYYY-MM-DD
// Approved prescriptions, newest first. Search covers CONFIRMED data only: verified medicines'
// catalog names and ingredients, and the person-confirmed doctor name. Never the raw AI readings.
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const params = new URL(request.url).searchParams;
  const patientId = params.get("patient") || user.id;
  if (!(await canView(supabase, patientId))) return fail("Not allowed", 403);

  let query = supabase
    .from("prescriptions")
    .select("id, created_at, doctor_name, image_path, prescription_items(status, medicine_catalog(name, ingredients), schedules(active))")
    .eq("patient_id", patientId)
    .eq("state", "approved")
    .order("created_at", { ascending: false });
  // Dates are India dates (UTC+05:30); "to" includes the whole day.
  const from = params.get("from");
  const to = params.get("to");
  if (from && DATE.test(from)) query = query.gte("created_at", `${from}T00:00:00+05:30`);
  if (to && DATE.test(to)) query = query.lte("created_at", `${to}T23:59:59.999+05:30`);

  const { data, error } = await query;
  if (error) return fail("Could not load prescriptions", 500);

  const q = (params.get("q") ?? "").trim().toLowerCase().slice(0, 60);
  const rows = ((data ?? []) as unknown as Rx[])
    .map((rx) => ({ rx, verified: rx.prescription_items.filter((i) => i.status === "verified" && i.medicine_catalog) }))
    .filter(({ rx, verified }) => {
      if (!q) return true;
      // Simple text match over confirmed fields only.
      const words = [rx.doctor_name ?? "", ...verified.flatMap((i) => [i.medicine_catalog!.name, ...i.medicine_catalog!.ingredients])];
      return words.some((w) => w.toLowerCase().includes(q));
    });

  const prescriptions = await Promise.all(
    rows.map(async ({ rx, verified }) => ({
      id: rx.id,
      date: rx.created_at,
      doctorName: rx.doctor_name,
      medicineCount: verified.length,
      medicines: verified.slice(0, 3).map((i) => i.medicine_catalog!.name),
      active: rx.prescription_items.some(isActive),
      thumbnailUrl: await signedPhoto(supabase, rx.image_path),
    })),
  );
  return NextResponse.json({ patientId, prescriptions });
}
