import "server-only";
import { createClient } from "@supabase/supabase-js";

// Admin client: BYPASSES Row Level Security. Server-only, and only for writes users must
// never do themselves (medicine status, safety log, readings). Always check access first.
export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
