// Path: src/app/api/auth/signup/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase admin client with service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(request: Request) {
  try {
    const { email, password, name, inviteToken } = await request.json();

    // Step 1: Create the auth user
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: name,
        },
      });

    if (authError) {
      console.error("Auth creation error:", authError);
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: "User creation failed" },
        { status: 500 }
      );
    }

    // Step 2: Create the profile with admin privileges (bypassing RLS)
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .upsert({
        id: authData.user.id,
        user_id: authData.user.id,
        email,
        full_name: name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

    if (profileError) {
      console.error("Profile creation error:", profileError);
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 }
      );
    }

    // Step 3: Handle invite token if provided
    let orgSlug = null;
    if (inviteToken) {
      // Get invite details
      const { data: invite, error: inviteError } = await supabaseAdmin
        .from("invites")
        .select("id, email, org_id, role, used")
        .eq("id", inviteToken)
        .single();

      if (inviteError || !invite) {
        console.error("Invite fetch error:", inviteError);
        return NextResponse.json({ error: "Invalid invite" }, { status: 400 });
      }

      if (invite.used) {
        return NextResponse.json(
          { error: "Invite already used" },
          { status: 400 }
        );
      }

      // Link user to organization
      const { error: linkError } = await supabaseAdmin
        .from("organization_users")
        .insert([
          {
            org_id: invite.org_id,
            user_id: authData.user.id,
            role: invite.role,
          },
        ]);

      if (linkError) {
        console.error("Organization link error:", linkError);
        return NextResponse.json({ error: linkError.message }, { status: 500 });
      }

      // Mark invite as used
      await supabaseAdmin
        .from("invites")
        .update({ used: true })
        .eq("id", inviteToken);

      // Get org slug for redirect
      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("slug")
        .eq("id", invite.org_id)
        .single();

      if (org) {
        orgSlug = org.slug;
      }
    }

    return NextResponse.json({
      success: true,
      userId: authData.user.id,
      orgSlug,
    });
  } catch (error: any) {
    console.error("Signup API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
