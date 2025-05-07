// middleware.js
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

  // Handle subdomain routing
  const hostname = request.headers.get("host") || "";
  const subdomain = hostname.split(".")[0];
  const isSubdomain = hostname.includes(".") && !hostname.includes("localhost");
  const pathname = request.nextUrl.pathname;

  // Check if it's a subdomain and not already redirected
  // IMPORTANT: Add check to prevent infinite redirects
  if (
    isSubdomain &&
    subdomain !== "www" &&
    !pathname.startsWith(`/org/${subdomain}`)
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

  if (isProtectedRoute && !user) {
    const redirectUrl = new URL("/auth/signin", request.url);
    redirectUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // IMPORTANT: You *must* return the supabaseResponse object as it is.
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
