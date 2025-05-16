import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

// Initialize Supabase with admin privileges (service role key)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Use service role key here, NOT public anon key
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(request: Request) {
  try {
    const { email, role, orgId, orgName } = await request.json();

    if (!email || !orgId) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Step 1: Create the invite record directly in the database
    const { data: inviteRecord, error: inviteError } = await supabaseAdmin
      .from("invites")
      .insert({
        org_id: orgId,
        email: email,
        role: role,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (inviteError || !inviteRecord) {
      throw inviteError || new Error("Failed to create invite record");
    }

    // Step 2: Send invite email using admin privileges
    const { error: emailError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${new URL(request.url).origin}/auth/signup?token=${
          inviteRecord.id
        }`,
        data: {
          organization_id: orgId,
          organization_name: orgName || "Our Organization",
          role: role,
          invite_id: inviteRecord.id,
        },
      });

    if (emailError) {
      throw emailError;
    }

    return NextResponse.json({ success: true, inviteId: inviteRecord.id });
  } catch (error: any) {
    console.error("Invite API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to send invite" },
      { status: 500 }
    );
  }
}
