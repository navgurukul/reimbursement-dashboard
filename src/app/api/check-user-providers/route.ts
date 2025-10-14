import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase admin client with service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    // Check if user exists in auth system and get their providers
    // Use listUsers with pagination to find the user by email
    let authUser = null;
    let page = 1;
    const perPage = 1000; // Max per page
    
    while (!authUser) {
      const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage
      });
      
      if (authError) {
        return NextResponse.json({ error: "Error accessing auth system" }, { status: 500 });
      }
      
      // Find user by email in current page
      authUser = authUsers.users.find(user => user.email?.toLowerCase() === email.toLowerCase());
      
      // If user found or no more users, break
      if (authUser || authUsers.users.length === 0) {
        break;
      }
      
      page++;
      
      // Safety check to prevent infinite loop
      if (page > 10) {
        break;
      }
    }

    if (!authUser) {
      return NextResponse.json({ error: "User not found in auth system" }, { status: 404 });
    }

    // Get user's authentication providers
    const providers = authUser.app_metadata?.providers || [];
    const hasOAuthProvider = providers.some((provider: string) => 
      provider === 'google'
    );
    const hasEmailProvider = providers.includes('email');

    return NextResponse.json({
      hasOAuthProvider,
      hasEmailProvider,
      providers,
      userExists: true
    });

  } catch (error: any) {
    console.error("Error checking user providers:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
