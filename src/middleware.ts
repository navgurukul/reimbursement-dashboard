// middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: DO NOT REMOVE auth.getUser()
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Get request details
  const hostname = request.headers.get("host") || "";
  const pathname = request.nextUrl.pathname;

  // Important fix: Don't automatically treat "reimbursement" as an org subdomain
  // If "reimbursement" is your app name, add it to the excluded subdomains
  const subdomain = hostname.split(".")[0];
  const isSubdomain = hostname.includes(".") && !hostname.includes("localhost");
  const excludedSubdomains = ["www", "reimbursement", "app"]; // Add your app name here

  
  // Check if this is a proper org subdomain that should be redirected
  // Only redirect if it's not an excluded subdomain
  if (
    isSubdomain &&
    !excludedSubdomains.includes(subdomain) &&
    !pathname.startsWith(`/org/${subdomain}`) &&
    !pathname.startsWith("/auth/")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = `/org/${subdomain}${pathname}`;
    return NextResponse.redirect(url);
  }

  // Protected routes that require authentication
  const protectedRoutes = ["/org", "/settings", "/profile"];
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Only redirect to signin if not already in auth flow
  if (isProtectedRoute && !user && !pathname.startsWith("/auth/")) {
    const redirectUrl = new URL("/auth/signin", request.url);
    // Clean the redirect path to prevent loops
    const cleanPathname = pathname.replace(/\/auth\/signin.*$/, "");
    redirectUrl.searchParams.set("redirectTo", cleanPathname);
    return NextResponse.redirect(redirectUrl);
  }

  // Additional security: Check if user is trying to access org routes
  if (pathname.startsWith("/org/") && user) {
    // Extract org slug from pathname
    const orgMatch = pathname.match(/^\/org\/([^\/]+)/);
    if (orgMatch) {
      const orgSlug = orgMatch[1];
      
      // Check if user has access to this organization
      try {
        const { data: orgData } = await supabase
          .from("organizations")
          .select("id")
          .eq("slug", orgSlug)
          .single();

        if (orgData?.id) {
          const { data: membershipData } = await supabase
            .from("organization_users")
            .select("role")
            .eq("org_id", orgData.id)
            .eq("user_id", user.id)
            .single();

          // If user is not a member of this organization, redirect to unauthorized
          if (!membershipData) {
            const unauthorizedUrl = new URL("/unauthorized", request.url);
            return NextResponse.redirect(unauthorizedUrl);
          }
        }
      } catch (error) {
        // If there's an error checking membership, redirect to unauthorized
        console.error("Error checking organization membership:", error);
        const unauthorizedUrl = new URL("/unauthorized", request.url);
        return NextResponse.redirect(unauthorizedUrl);
      }
    }
  }

  return supabaseResponse;
}

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
