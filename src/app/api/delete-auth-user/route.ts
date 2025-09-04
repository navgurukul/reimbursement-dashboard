import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    console.log("🔹 Incoming request to /api/delete-auth-user");

    const { userId, email } = await req.json();
    console.log("➡️ Parsed request body:", { userId, email });

    if (!userId || typeof userId !== "string") {
      console.warn("⚠️ Invalid userId provided:", userId);
      return NextResponse.json({ error: "Valid userId required" }, { status: 400 });
    }

    // 1. Delete from organization_users
    console.log("🗑️ Deleting from organization_users for userId:", userId);
    const { error: orgUserError } = await getSupabaseAdmin()
      .from("organization_users")
      .delete()
      .eq("user_id", userId);
    if (orgUserError) {
      console.error("❌ Error deleting from organization_users:", orgUserError.message);
      return NextResponse.json({ error: orgUserError.message }, { status: 500 });
    }
    console.log("✅ Deleted organization_users records");

    // 2. Delete from invite_link_usage
    console.log("🗑️ Deleting from invite_link_usage for userId:", userId);
    const { error: inviteUsageError } = await getSupabaseAdmin()
      .from("invite_link_usage")
      .delete()
      .eq("user_id", userId);
    if (inviteUsageError) {
      console.error("❌ Error deleting from invite_link_usage:", inviteUsageError.message);
      return NextResponse.json({ error: inviteUsageError.message }, { status: 500 });
    }
    console.log("✅ Deleted invite_link_usage records");

    // 3. Delete from invites (if email exists)
    if (email) {
      console.log("🗑️ Deleting from invites for email:", email.toLowerCase());
      const { error: inviteError } = await getSupabaseAdmin()
        .from("invites")
        .delete()
        .eq("email", email.toLowerCase());

      if (inviteError) {
        console.error("❌ Error deleting from invites:", inviteError.message);
        return NextResponse.json(
          { error: "Failed to delete user invites" },
          { status: 500 }
        );
      }
      console.log("✅ Deleted invites records");
    }

    // 4. Delete from vouchers
    console.log("🗑️ Deleting from vouchers created by userId:", userId);
    const { error: voucherError } = await getSupabaseAdmin()
      .from("vouchers")
      .delete()
      .eq("created_by", userId);
    if (voucherError) {
      console.error("❌ Error deleting from vouchers:", voucherError.message);
      return NextResponse.json(
        { error: "Failed to delete user vouchers" },
        { status: 500 }
      );
    }
    console.log("✅ Deleted vouchers records");

    // 5. Delete from profiles
    console.log("🗑️ Deleting from profiles for userId:", userId);
    const { error: profileError } = await getSupabaseAdmin()
      .from("profiles")
      .delete()
      .eq("user_id", userId);
    if (profileError) {
      console.error("❌ Error deleting from profiles:", profileError.message);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
    console.log("✅ Deleted profile record");

    // 6. Delete Supabase auth user
    console.log("🗑️ Deleting Supabase auth user:", userId);
    const { error: authError } = await getSupabaseAdmin().auth.admin.deleteUser(userId);
    if (authError) {
      console.error("❌ Supabase auth error:", authError.message);
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }
    console.log("✅ Deleted Supabase auth user");

    console.log("🎉 User deletion completed successfully for userId:", userId);
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (err: any) {
    console.error("💥 Unexpected error in /api/delete-auth-user:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
