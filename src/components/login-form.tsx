"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { useAuthStore } from "@/store/useAuthStore";
import { Role, useOrgStore } from "@/store/useOrgStore";

import supabase from "@/lib/supabase";
import { organizations } from "@/lib/db";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { login, error: authError, isLoading } = useAuthStore();
  const { setOrganization, setUserRole, resetOrg } = useOrgStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    resetOrg();
    // Clear auth flow flags for normal email/password login
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("googleLogin", "false");
        window.localStorage.setItem("forgotPassword", "false");
      } catch { }
    }

    try {
      const loadingToast = toast.loading("Signing you in…");
      // 1️⃣ Authenticate
      await login(email, password);

      // 2️⃣ Get user id
      const {
        data: { user },
        error: sessionError,
      } = await supabase.auth.getUser();
      if (sessionError || !user) throw sessionError ?? new Error("No session");

      const userId = user.id;

      // 3️⃣ Fetch membership + full org row
      const { data: membership, error: membershipError } =
        await organizations.getUserOrganizations(userId);

      toast.dismiss(loadingToast);
      if (membershipError) throw membershipError;

      // 4️⃣ Store in Zustand
      if (membership && membership.organizations) {
        setOrganization(membership.organizations);
        setUserRole(membership.role as Role);
      }

      // 5️⃣ Redirect logic
      const redirectTo = searchParams.get("redirectTo");
      if (redirectTo) {
        toast.success("Login successful! Redirecting…");
        router.push(redirectTo);
        return;
      }

      if (membership?.organizations?.slug) {
        toast.success("Welcome back!");
        router.push(`/org/${membership.organizations.slug}`);
      } else {
        toast.success("Login successful!");
        router.push("/create-organization");
      }
    } catch (err: any) {
      toast.dismiss();
      
      // Handle specific error scenarios
      let errorMessage = "Login failed";
      let toastMessage = "Login failed";
      let toastDescription = "Please try again.";

      if (err.message) {
        const errorMsg = err.message.toLowerCase();
        
        // Check for specific Supabase error messages
        if (errorMsg.includes("invalid login credentials") || 
            errorMsg.includes("invalid email or password")) {
          // For invalid credentials, we need to determine the specific issue
          try {
            // First check if user exists in profiles table by email
            const { data: profileData, error: profileError } = await supabase
              .from("profiles")
              .select("email")
              .eq("email", email.toLowerCase())
              .single();
            
            if (profileData && !profileError) {
              // User exists in profiles table, now check if they signed up with OAuth only
              try {
                // Check user's authentication providers via API
                const response = await fetch("/api/check-user-providers", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email: email.toLowerCase() }),
                });

                if (response.ok) {
                  const { hasOAuthProvider, hasEmailProvider } = await response.json();
                  
                  if (hasOAuthProvider && !hasEmailProvider) {
                    // User signed up with OAuth only, trying to login with email/password
                    errorMessage = "Account created with Google";
                    toastMessage = "Use Google to sign in";
                    toastDescription = "This account was created using Google. Please use the 'Continue with Google' button to sign in.";
                  } else {
                    // User has email provider, so wrong password
                    errorMessage = "Password is incorrect";
                    toastMessage = "Incorrect password";
                    toastDescription = "The password you entered is wrong. Please try again.";
                  }
                } else {
                  // If API call fails, assume wrong password
                  errorMessage = "Password is incorrect";
                  toastMessage = "Incorrect password";
                  toastDescription = "The password you entered is wrong. Please try again.";
                }
              } catch (authCheckErr) {
                // If we can't check auth providers, assume wrong password
                errorMessage = "Password is incorrect";
                toastMessage = "Incorrect password";
                toastDescription = "The password you entered is wrong. Please try again.";
              }
            } else {
              // User doesn't exist in database
              errorMessage = "User data not found";
              toastMessage = "User data not found";
              toastDescription = "No account found with this email address.";
            }
          } catch (profileErr) {
            // If we can't check profile, assume user doesn't exist
            errorMessage = "User data not found";
            toastMessage = "User data not found";
            toastDescription = "No account found with this email address.";
          }
        } else if (errorMsg.includes("email not confirmed")) {
          errorMessage = "Email not confirmed";
          toastMessage = "Email not confirmed";
          toastDescription = "Please check your email and confirm your account.";
        } else if (errorMsg.includes("too many requests")) {
          errorMessage = "Too many login attempts";
          toastMessage = "Too many attempts";
          toastDescription = "Please wait a moment before trying again.";
        } else {
          // Generic error for other cases
          errorMessage = err.message;
          toastMessage = "Login failed";
          toastDescription = err.message;
        }
      }

      setError(errorMessage);
      toast.error(toastMessage, {
        description: toastDescription,
      });
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setGoogleLoading(true);
      setError(null);
      // Mark Google auth flow in localStorage
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem("googleLogin", "true");
          window.localStorage.setItem("forgotPassword", "false");
          // Hint middleware we're in OAuth (short-lived cookie)
          document.cookie = `oauthFlow=1; Path=/; Max-Age=300; SameSite=Lax`;
        } catch { }
      }
      const redirectToParam = searchParams.get("redirectTo");
      const baseRedirect = typeof window !== "undefined" ? window.location.origin : "";
      // Send OAuth back to site root; middleware will no longer force create-password for OAuth
      const redirectTo = `${baseRedirect}/${redirectToParam ? `?redirectTo=${encodeURIComponent(redirectToParam)}` : ""}`;

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            prompt: "select_account",
          },
        },
      });
      if (oauthError) throw oauthError;
      toast.loading("Redirecting to Google…");
    } catch (err: any) {
      setGoogleLoading(false);
      toast.error("Google sign-in failed", {
        description: err?.message || "Please try again.",
      });
    }
  };

  return (
    <div className={cn("w-full max-w-md mx-auto relative", className)} {...props}>
      {isLoading && (
        <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-[1px] flex items-center justify-center rounded-lg">
          <div className="flex items-center gap-2 text-gray-700">
            <Spinner className="w-5 h-5" />
            <span className="text-sm">Signing you in…</span>
          </div>
        </div>
      )}
      <Card className="shadow-md border">
        <CardContent className="p-6 space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold">Welcome back</h1>
            <p className="text-muted-foreground text-sm">
              Sign in to your account
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/auth/forgot-password"
                  className="text-sm text-muted-foreground hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            {(error || authError) && (
              <p className="text-sm text-red-500">{error || authError}</p>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full cursor-pointer mb-0"
            >
              {isLoading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="w-4 h-4" />
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </Button>

            <div className="my-4 flex items-center gap-2">
              <div className="h-px bg-black flex-1" />
              <span className="text-xs text-muted-foreground">OR</span>
              <div className="h-px bg-black flex-1" />
            </div>

            <Button
              type="button"
              variant="outline"
              className="w-full cursor-pointer"
              onClick={handleGoogleLogin}
              disabled={isLoading || googleLoading}
            >
              {googleLoading ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="w-4 h-4" />
                  Connecting to Google…
                </span>
              ) : (
                <span className="inline-flex items-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-4 w-4" aria-hidden>
                    <path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C32.9 6.1 28.7 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z" />
                    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.8 16 19.1 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C32.9 6.1 28.7 4 24 4 16.3 4 9.6 8.5 6.3 14.7z" />
                    <path fill="#4CAF50" d="M24 44c5.3 0 9.9-1.8 13.2-4.9l-6.1-5.1C28.8 35.4 26.5 36 24 36c-5.3 0-9.8-3.4-11.4-8.2l-6.4 5C9.4 39.5 16.1 44 24 44z" />
                    <path fill="#1976D2" d="M43.6 20.5H24v8h11.3c-1 2.9-3 5.1-5.5 6.7l6.1 5.1C39.3 36.2 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z" />
                  </svg>
                  Continue with Google
                </span>
              )}
            </Button>
          </form>
          <p className="text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link
              href="/auth/signup"
              className="text-slate-500 hover:underline"
            >
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        By signing in, you agree to our{" "}
        <a href="#" className="underline underline-offset-2">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="#" className="underline underline-offset-2">
          Privacy Policy
        </a>
        .
      </p>
    </div>
  );
}
