import { NextRequest, NextResponse } from "next/server";
import supabase from "@/lib/supabase";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(request: NextRequest) {
  try {
    const { linkId, email } = await request.json();

    if (!linkId || !email) {
      return NextResponse.json(
        { error: "Link ID and email are required" },
        { status: 400 }
      );
    }

    // Get the current user
    const cookieStore = cookies();
    const supabaseServer = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          async get(name: string) {
            return (await cookieStore).get(name)?.value;
          },
        },
      }
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseServer.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized - User not found" },
        { status: 401 }
      );
    }

    // Check if link is valid
    const { data: inviteLink, error: linkError } = await supabase
      .from("invite_links")
      .select("*")
      .eq("id", linkId)
      .eq("is_active", true)
      .single();

    if (linkError || !inviteLink) {
      return NextResponse.json(
        { error: "Invalid or expired link" },
        { status: 400 }
      );
    }

    // Check expiry
    if (inviteLink.expires_at && new Date() > new Date(inviteLink.expires_at)) {
      return NextResponse.json({ error: "Link has expired" }, { status: 400 });
    }

    // Check usage limits
    if (inviteLink.max_uses && inviteLink.current_uses >= inviteLink.max_uses) {
      return NextResponse.json(
        { error: "Link usage limit reached" },
        { status: 400 }
      );
    }

    // Check if user is already a member of this organization
    const { data: existingMembership } = await supabase
      .from("organization_users")
      .select("id")
      .eq("org_id", inviteLink.org_id)
      .eq("user_id", user.id)
      .single();

    if (existingMembership) {
      return NextResponse.json(
        { error: "You are already a member of this organization" },
        { status: 400 }
      );
    }

    // Check if email already used this link
    const { data: existingUsage } = await supabase
      .from("invite_link_usage")
      .select("id")
      .eq("invite_link_id", linkId)
      .eq("email", email)
      .single();

    if (existingUsage) {
      return NextResponse.json(
        { error: "This email has already used this invite link" },
        { status: 400 }
      );
    }

    // Start a transaction-like operation
    try {
      // 1. Record the usage
      const { error: usageError } = await supabase
        .from("invite_link_usage")
        .insert({
          invite_link_id: linkId,
          email: email,
          user_id: user.id,
          status: "completed",
        });

      if (usageError) throw usageError;

      // 2. Add user to organization
      const { error: membershipError } = await supabase
        .from("organization_users")
        .insert({
          org_id: inviteLink.org_id,
          user_id: user.id,
          role: inviteLink.role,
        });

      if (membershipError) throw membershipError;

      // 3. Increment usage count
      const { error: updateError } = await supabase
        .from("invite_links")
        .update({
          current_uses: inviteLink.current_uses + 1,
        })
        .eq("id", linkId);

      if (updateError) throw updateError;

      return NextResponse.json({
        success: true,
        message: "Successfully joined organization",
      });
    } catch (dbError: any) {
      console.error("Database error during organization join:", dbError);
      return NextResponse.json(
        { error: "Failed to join organization: " + dbError.message },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Error in use-link API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
