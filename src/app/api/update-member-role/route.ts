import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import supabaseClient from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      orgId,
      memberId, // organization_users.id of the target member
      newRole,
    }: { orgId?: string; memberId?: string; newRole?: "member" | "manager" | "admin" | "owner" } = await req.json();

    if (!orgId || !memberId || !newRole) {
      return NextResponse.json({ error: "orgId, memberId and newRole are required" }, { status: 400 });
    }

    // Get current user
    const { data: auth } = await supabase.auth.getUser();
    const currentUserId = auth?.user?.id;

    if (!currentUserId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ensure current user has admin/owner role in this org
    const { data: currentRoleRow, error: roleErr } = await supabaseClient
      .from("organization_users")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", currentUserId)
      .single();

    if (roleErr || !currentRoleRow) {
      return NextResponse.json({ error: "Membership not found" }, { status: 403 });
    }

    const currentRole = currentRoleRow.role as string;
    if (!(currentRole === "owner" || currentRole === "admin")) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
    }

    // Fetch target member row to ensure it belongs to same org and to apply role-change rules
    const { data: targetRow, error: fetchErr } = await supabaseClient
      .from("organization_users")
      .select("id, org_id, role, user_id")
      .eq("id", memberId)
      .single();

    if (fetchErr || !targetRow || targetRow.org_id !== orgId) {
      return NextResponse.json({ error: "Member not found in organization" }, { status: 404 });
    }

    // Prevent users (including owners) from changing their own role
    if (targetRow.user_id === currentUserId) {
      return NextResponse.json({ error: "Cannot change your own role" }, { status: 403 });
    }

    // Only an owner can change another owner's role. Admins/managers/members cannot.
    if (targetRow.role === "owner" && currentRole !== "owner") {
      return NextResponse.json({ error: "Only owner can change another owner's role" }, { status: 403 });
    }

    // If current user is admin (not owner), restrict promoting to admin only; cannot set owner here
    if (currentRole === "admin" && newRole === "owner") {
      return NextResponse.json({ error: "Only owner can assign owner role" }, { status: 403 });
    }

    // Update role
    const { error: updateErr } = await supabaseClient
      .from("organization_users")
      .update({ role: newRole })
      .eq("id", memberId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Unexpected error" }, { status: 500 });
  }
}


