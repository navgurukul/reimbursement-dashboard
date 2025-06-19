import supabase from "@/lib/supabase";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { linkId, email } = await request.json();

  // Check if link is valid
  const { data: inviteLink } = await supabase
    .from("invite_links")
    .select("*")
    .eq("id", linkId)
    .eq("is_active", true)
    .single();

  if (!inviteLink) {
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

  // Check if email already used this link
  const { data: existingUsage } = await supabase
    .from("invite_link_usage")
    .select("id")
    .eq("invite_link_id", linkId)
    .eq("email", email)
    .single();

  if (existingUsage) {
    return NextResponse.json(
      { error: "Email already used this link" },
      { status: 400 }
    );
  }

  // Record the usage
  await supabase.from("invite_link_usage").insert({
    invite_link_id: linkId,
    email: email,
    ip_address: getClientIP(request),
  });

  // Increment usage count
  await supabase
    .from("invite_links")
    .update({ current_uses: inviteLink.current_uses + 1 })
    .eq("id", linkId);

  // Proceed with sending verification email or signup flow
  return NextResponse.json({ success: true });
}
function getClientIP(request: NextRequest): any {
    throw new Error("Function not implemented.");
}

