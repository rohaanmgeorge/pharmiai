import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fail, requireUser } from "@/lib/server/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";

const BUCKET = "rx-images";

/** Every file path under a folder, including sub-folders. Pages of 100. */
async function listAll(admin: SupabaseClient, folder: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await admin.storage.from(BUCKET).list(folder, { limit: 100, offset });
    if (error) throw error;
    for (const entry of data ?? []) {
      const path = `${folder}/${entry.name}`;
      // Folders come back without an id.
      if (entry.id === null) paths.push(...(await listAll(admin, path)));
      else paths.push(path);
    }
    if (!data || data.length < 100) return paths;
  }
}

// POST /api/account/delete — "Delete my data". Removes my photos, then my login.
// Deleting the auth user deletes my profile, and every table that belongs to me cascades
// from profiles (prescriptions, schedules, doses, contacts, SOS, card, circle links…).
// Note: safety_log rows have no foreign key and are append-only on purpose. They contain only
// IDs and codes (no names, photos or medicine text), so keeping them is acceptable.
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { user } = auth;
  const admin = supabaseAdmin();

  try {
    const paths = await listAll(admin, user.id);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + 100));
      if (error) throw error;
    }
  } catch {
    return fail("Could not delete your photos. Nothing else was deleted. Please try again.", 500);
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return fail("Your photos were deleted, but your account could not be. Please try again.", 500);
  return NextResponse.json({ ok: true });
}
