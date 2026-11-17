import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client with the service-role key. It bypasses row-level security,
 * so use it only in route handlers and server actions, after checking who is
 * calling. Importing this file from client code fails the build.
 */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Server-only: never give this a NEXT_PUBLIC_ name, or Next.js can inline it
  // into browser bundles.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("SUPABASE URL is required");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
