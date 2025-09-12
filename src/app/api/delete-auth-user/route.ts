import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({
      error: "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY or URL missing",
      debug: {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || null,
        serviceRoleKeyAvailable: !!process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY,
      }
    }, { status: 500 });
  }

  // Initialize Supabase Admin Client at runtime
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    const { userId, email } = await req.json();

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        {
          error: "Valid userId required",
          debug: {
            supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
            serviceRoleKeyAvailable: !!process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY,
          }
        },
        { status: 400 }
      );
    }

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

    return NextResponse.json({
      success: true,
      debug: {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        serviceRoleKeyAvailable: !!process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY,
      }
    }, { status: 200 });

  } catch (err: any) {
    console.error("Unexpected error in /api/delete-auth-user:", err);
    return NextResponse.json({
      error: "Internal server error",
      debug: {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        serviceRoleKeyAvailable: !!process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY,
      }
    }, { status: 500 });
  }
};
