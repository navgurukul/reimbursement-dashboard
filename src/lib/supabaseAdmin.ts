import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client with the service-role key. It bypasses row-level security,
 * so use it only in route handlers and server actions, after checking who is
 * calling. Importing this file from client code fails the build.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // SUPABASE_SERVICE_ROLE_KEY is the server-only name. The old NEXT_PUBLIC_ name
  // is still read so existing deployments keep working until it is renamed.
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("SUPABASE URL is required");
  if (!key) throw new Error("SUPABASE SERVICE ROLE KEY is required");

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
