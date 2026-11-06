import "server-only";

import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export type OrgRole = "owner" | "admin" | "manager" | "member";

/** Roles that can manage an organisation's members and invites. */
export const ORG_MANAGER_ROLES: OrgRole[] = ["owner", "admin"];

/** Roles an owner or admin may hand out through an invite. */
export const INVITABLE_ROLES: OrgRole[] = ["member", "manager", "admin"];

/**
 * The user signed in for this request, read from the Supabase session cookie.
 * Returns null when there is no valid session.
 */
export async function getSignedInUser(): Promise<User | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

const ROLE_RANK: OrgRole[] = ["owner", "admin", "manager", "member"];

/**
 * The user's role in the organisation, or null when they are not a member.
 * If there are duplicate membership rows, the highest role wins.
 */
export async function getOrgRole(
  userId: string,
  orgId: string
): Promise<OrgRole | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("organization_users")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", orgId);
  if (error || !data?.length) return null;
  const roles = data.map((row) => row.role as OrgRole);
  return ROLE_RANK.find((role) => roles.includes(role)) ?? roles[0];
}

export function unauthorized() {
  return NextResponse.json({ error: "Sign in required" }, { status: 401 });
}

export function forbidden(message = "You don't have permission to do this") {
  return NextResponse.json({ error: message }, { status: 403 });
}
