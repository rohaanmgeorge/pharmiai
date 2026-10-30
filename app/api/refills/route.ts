import { NextResponse } from "next/server";
import { getPharmacy, getRefill, listRefills } from "@/lib/agent/refill-tools";
import { canManage, canView, fail, requireUser } from "@/lib/server/auth";

// GET /api/refills?patient=<id>   → open / later / approved suggestions for that person
// GET /api/refills?id=<refill id> → just that one (any state); the patient comes from the row,
//                                   so a caregiver's link works without ?patient=
export async function GET(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { supabase, user } = auth;
  const params = new URL(request.url).searchParams;
  const id = params.get("id");

  let patientId = params.get("patient") || user.id;
  let refills;
  if (id) {
    const one = await getRefill(supabase, id);
    if (!one) return fail("Refill not found", 404);
    patientId = one.patientId;
    refills = [one];
  } else {
    if (!(await canView(supabase, patientId))) return fail("Not allowed", 403);
    refills = await listRefills(supabase, patientId);
  }

  const pharmacy = await getPharmacy(supabase, patientId);
  return NextResponse.json({
    patientId,
    canManage: await canManage(supabase, patientId),
    pharmacy: { name: pharmacy?.name ?? null, phone: pharmacy?.phone ?? null, email: pharmacy?.email ?? null },
    refills,
  });
}
