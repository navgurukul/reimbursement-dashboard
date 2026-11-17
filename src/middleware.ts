// middleware.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Every response that passes through here may carry a Set-Cookie with the
 * visitor's session tokens. A shared cache (CloudFront) must never store it,
 * or the next visitor to the same URL receives someone else's session.
 */
function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
  return response;
}

export async function updateSession(request: NextRequest) {
  // If Supabase auth magic link lands with ?code=..., normally we'd route to create-password.
  // But for Google OAuth flows, we should NOT redirect; the client handles redirecting.
  const incomingUrl = new URL(request.url);
  const hasSupabaseCode = incomingUrl.searchParams.has("code");
  const currentPath = incomingUrl.pathname;
  const isOAuthFlow = request.cookies.get("oauthFlow")?.value === "1";
  if (hasSupabaseCode && currentPath !== "/auth/create-password" && !isOAuthFlow) {
    const redirectUrl = new URL("/auth/create-password", request.url);
    // Preserve all query params (code, type, etc.)
    incomingUrl.searchParams.forEach((value, key) => {
      redirectUrl.searchParams.set(key, value);
    });
    return noStore(NextResponse.redirect(redirectUrl));
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
    return noStore(NextResponse.redirect(url));
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
    return noStore(NextResponse.redirect(redirectUrl));
  }

  return noStore(supabaseResponse);
}

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
