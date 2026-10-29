import "server-only";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

// Every API route starts here. Accepts the login cookie (the app) or an
// "Authorization: Bearer <access token>" header (scripts, other phones).
// Either way Supabase verifies the token; the returned client acts AS that user, so RLS applies.
export async function requireUser(request: Request): Promise<{ supabase: SupabaseClient; user: User } | NextResponse> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  const supabase = bearer
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : await supabaseServer();
  const {
    data: { user },
  } = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please log in" }, { status: 401 });
  return { supabase, user };
}

/** true if this user may change things for this patient (self, or caregiver with consent). */
export async function canManage(supabase: SupabaseClient, patientId: string) {
  const { data } = await supabase.rpc("can_manage", { p: patientId });
  return data === true;
}

export async function canView(supabase: SupabaseClient, patientId: string) {
  const { data } = await supabase.rpc("can_view", { p: patientId });
  return data === true;
}

export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Signed link to a private photo, valid for 60 seconds. */
export async function signedPhoto(supabase: SupabaseClient, path: string | null | undefined) {
  if (!path) return null;
  const { data } = await supabase.storage.from("rx-images").createSignedUrl(path, 60);
  return data?.signedUrl ?? null;
}
