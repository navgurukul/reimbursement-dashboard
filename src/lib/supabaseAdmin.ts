import { createClient } from "@supabase/supabase-js";

// Factory: create the server-side Supabase admin client on demand (server only)
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("SUPABASE URL is required");
  if (!key) throw new Error("SUPABASE SERVICE ROLE KEY is required");

  return createClient(url, key);
}
