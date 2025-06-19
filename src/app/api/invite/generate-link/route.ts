import { NextRequest, NextResponse } from "next/server";
import supabase from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const { role, orgId, orgName, userId, maxUses, expiresInDays } =
      await request.json();

    if (!role || !orgId || !userId) {
      return NextResponse.json(
        { error: "Role, organization ID, and user ID are required" },
        { status: 400 }
      );
    }

    // Create invite link record
    const { data: inviteLink, error } = await supabase
      .from("invite_links")
      .insert({
        org_id: orgId,
        role: role,
        created_by: userId, // Use the user ID sent from frontend
        expires_at: expiresInDays
          ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
          : null,
        max_uses: maxUses || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating invite link:", error);
      return NextResponse.json(
        { error: "Failed to create invite link: " + error.message },
        { status: 500 }
      );
    }

    // Generate the invite URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const inviteUrl = `${baseUrl}/invite/${inviteLink.id}`;

    return NextResponse.json({
      success: true,
      inviteUrl,
      inviteId: inviteLink.id,
    });
  } catch (error) {
    console.error("Error in generate-link API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
