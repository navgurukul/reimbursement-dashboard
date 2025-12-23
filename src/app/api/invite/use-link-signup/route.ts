import { NextRequest, NextResponse } from "next/server";
import supabase from "@/lib/supabase";

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { linkId, email, userId } = await request.json();

    if (!linkId || !email || !userId) {
      return NextResponse.json(
        { error: "Link ID, email, and user ID are required" },
        { status: 400 }
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
      .eq("user_id", userId)
      .single();

    if (existingMembership) {
      return NextResponse.json(
        { error: "User is already a member of this organization" },
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

    // Wait for profile to be created and verify it exists
    let profileExists = false;
    let retries = 0;
    const maxRetries = 10; // Wait up to 5 seconds

    while (!profileExists && retries < maxRetries) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id")
        .eq("user_id", userId)
        .single();

      if (profile) {
        profileExists = true;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 500));
        retries++;
      }
    }

    if (!profileExists) {
      return NextResponse.json(
        { error: "Profile creation failed. Please try again." },
        { status: 500 }
      );
    }

    // Start transaction-like operations
    try {
      // 1. Record the usage
      const { error: usageError } = await supabase
        .from("invite_link_usage")
        .insert({
          invite_link_id: linkId,
          email: email,
          user_id: userId,
          status: "completed",
        });

      if (usageError) {
        console.error("Usage insert error:", usageError);
        throw usageError;
      }

      // 2. Add user to organization
      const { error: membershipError } = await supabase
        .from("organization_users")
        .insert({
          org_id: inviteLink.org_id,
          user_id: userId,
          role: inviteLink.role,
        });

      if (membershipError) {
        console.error("Membership insert error:", membershipError);
        throw membershipError;
      }

      // 3. Increment usage count
      const { error: updateError } = await supabase
        .from("invite_links")
        .update({
          current_uses: inviteLink.current_uses + 1,
        })
        .eq("id", linkId);

      if (updateError) {
        console.error("Usage count update error:", updateError);
        throw updateError;
      }

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
    console.error("Error in use-link-signup API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
