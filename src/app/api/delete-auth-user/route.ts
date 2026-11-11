import { NextRequest, NextResponse } from "next/server";

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import {
  ORG_MANAGER_ROLES,
  forbidden,
  getSignedInUser,
  unauthorized,
} from "@/lib/server/auth";

export async function POST(req: NextRequest) {
  const caller = await getSignedInUser();
  if (!caller) return unauthorized();

  try {
    const { userId, email } = await req.json();

    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "Valid userId required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // The caller must be an owner or admin of an organisation the user belongs
    // to, and the user must not be an owner there (same rule as the Team page).
    const [{ data: callerOrgs, error: callerOrgsError }, { data: targetOrgs, error: targetOrgsError }] =
      await Promise.all([
        supabase
          .from("organization_users")
          .select("org_id")
          .eq("user_id", caller.id)
          .in("role", ORG_MANAGER_ROLES),
        supabase
          .from("organization_users")
          .select("org_id, role")
          .eq("user_id", userId),
      ]);

    if (callerOrgsError || targetOrgsError) {
      console.error("Error checking permissions:", callerOrgsError || targetOrgsError);
      return NextResponse.json({ error: "Could not check permissions" }, { status: 500 });
    }

    const managedOrgIds = new Set((callerOrgs ?? []).map((row) => row.org_id));
    const canDelete = (targetOrgs ?? []).some(
      (row) => managedOrgIds.has(row.org_id) && row.role !== "owner"
    );
    if (!canDelete) return forbidden();

    // All your deletion logic (organization_users, invites, vouchers, profiles, auth user)
    const { error: orgUserError } = await supabase
      .from("organization_users")
      .delete()
      .eq("user_id", userId);

    if (orgUserError) {
      console.error("Error deleting from organization_users:", orgUserError.message);
      return NextResponse.json({ error: orgUserError.message }, { status: 500 });
    }

    const { error: inviteError } = await supabase
      .from("invite_link_usage")
      .delete()
      .eq("user_id", userId);

    if (inviteError) {
      console.error("Error deleting from invite_link_usage:", inviteError.message);
      return NextResponse.json({ error: inviteError.message }, { status: 500 });
    }

    if (email) {
      const { error: invitesError } = await supabase
        .from("invites")
        .delete()
        .eq("email", email.toLowerCase());

      if (invitesError) {
        console.error("Error deleting from invites:", invitesError);
        return NextResponse.json(
          { error: "Failed to delete user invites" },
          { status: 500 }
        );
      }
    }

    const { error: voucherError } = await supabase
      .from("vouchers")
      .delete()
      .eq("created_by", userId);

    if (voucherError) {
      console.error("Error deleting from vouchers:", voucherError);
      return NextResponse.json(
        { error: "Failed to delete user vouchers" },
        { status: 500 }
      );
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .delete()
      .eq("user_id", userId);

    if (profileError) {
      console.error("Error deleting from profiles:", profileError.message);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    const { error: authError } = await supabase.auth.admin.deleteUser(userId);

    if (authError) {
      console.error("Supabase auth error:", authError.message);
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    console.error("Unexpected error in /api/delete-auth-user:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
