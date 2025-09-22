// middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  // If Supabase auth magic link lands anywhere with ?code=..., route to reset-password
  const incomingUrl = new URL(request.url);
  const hasSupabaseCode = incomingUrl.searchParams.has("code");
  const currentPath = incomingUrl.pathname;
  if (hasSupabaseCode && currentPath !== "/auth/reset-password") {
    const redirectUrl = new URL("/auth/reset-password", request.url);
    // Preserve all query params (code, type, etc.)
    incomingUrl.searchParams.forEach((value, key) => {
      redirectUrl.searchParams.set(key, value);
    });
    return NextResponse.redirect(redirectUrl);
  }

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
