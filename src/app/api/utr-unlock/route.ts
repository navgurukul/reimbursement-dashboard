import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ORG_MANAGER_ROLES,
  forbidden,
  getOrgRole,
  getSignedInUser,
  unauthorized,
} from "@/lib/server/auth";

const digest = (value: string) => createHash("sha256").update(value).digest();

/**
 * Checks the password that unlocks UTR editing. Only owners and admins of the
 * organisation can unlock, and the password lives in UTR_UNLOCK_PASSWORD on the
 * server, never in client code.
 */
export async function POST(req: NextRequest) {
  const caller = await getSignedInUser();
  if (!caller) return unauthorized();

  const expected = process.env.UTR_UNLOCK_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: "UTR unlock isn't configured. Ask an admin to set it up." },
      { status: 500 }
    );
  }

  const { slug, password } = await req.json().catch(() => ({}));
  if (!slug || typeof password !== "string") {
    return NextResponse.json(
      { error: "slug and password are required" },
      { status: 400 }
    );
  }

  const { data: org } = await getSupabaseAdmin()
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  const role = org ? await getOrgRole(caller.id, org.id) : null;
  if (!role || !ORG_MANAGER_ROLES.includes(role)) {
    return forbidden("Only owners and admins can unlock UTR editing");
  }

  // Compare fixed-length digests so the check doesn't leak the password length.
  if (!timingSafeEqual(digest(password), digest(expected))) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 403 });
  }

  return NextResponse.json({ ok: true });
}
