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

/** An expense's organisation and creator, or null if it doesn't exist. */
export async function getExpenseOrg(expenseId: string) {
  const supabase = getSupabaseAdmin();
  const { data: expense } = await supabase
    .from("expense_new")
    .select("id, org_id, user_id")
    .eq("id", expenseId)
    .maybeSingle();
  if (!expense) return null;
  const { data: org } = await supabase
    .from("organizations")
    .select("slug, name")
    .eq("id", expense.org_id)
    .maybeSingle();
  return {
    id: expense.id as string,
    orgId: expense.org_id as string,
    creatorId: expense.user_id as string,
    orgSlug: (org?.slug as string | undefined) || (expense.org_id as string),
    orgName: (org?.name as string | undefined) || null,
  };
}

/** Whether the email address belongs to a member of the organisation. */
export async function isOrgMemberEmail(orgId: string, email: string) {
  const supabase = getSupabaseAdmin();
  const { data: members } = await supabase
    .from("organization_users")
    .select("user_id")
    .eq("org_id", orgId);
  const userIds = (members ?? []).map((row) => row.user_id);
  if (!userIds.length) return false;
  const { data: memberProfiles } = await supabase
    .from("profiles")
    .select("email")
    .in("user_id", userIds);
  const target = email.trim().toLowerCase();
  return (memberProfiles ?? []).some(
    (row) => String(row.email || "").trim().toLowerCase() === target
  );
}

export function unauthorized() {
  return NextResponse.json({ error: "Sign in required" }, { status: 401 });
}

export function forbidden(message = "You don't have permission to do this") {
  return NextResponse.json({ error: message }, { status: 403 });
}
