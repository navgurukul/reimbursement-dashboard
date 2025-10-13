"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import supabase from "@/lib/supabase";

interface InviteLink {
  id: string;
  org_id: string;
  role: string;
  expires_at: string | null;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  organization: {
    name: string;
    slug: string;
  };
}

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [inviteLink, setInviteLink] = useState<InviteLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Check if user is already authenticated
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    checkAuthAndLoadInvite();
  }, [token]);

  const checkAuthAndLoadInvite = async () => {
    try {
      // Check if user is already logged in
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUser(user);

      // Load invite link details
      const { data: linkData, error: linkError } = await supabase
        .from("invite_links")
        .select(
          `
          *,
          organization:organizations!org_id (
            name,
            slug
          )
        `
        )
        .eq("id", token)
        .eq("is_active", true)
        .single();

      if (linkError || !linkData) {
        setError("Invalid or expired invite link");
        return;
      }

      // Check if link is expired
      if (linkData.expires_at && new Date() > new Date(linkData.expires_at)) {
        setError("This invite link has expired");
        return;
      }

      // Check usage limits
      if (linkData.max_uses && linkData.current_uses >= linkData.max_uses) {
        setError("This invite link has reached its usage limit");
        return;
        }
        
        localStorage.setItem("isInvited", "true"); 

      setInviteLink(linkData);

      // If user is logged in, pre-fill their email
      if (user) {
        setEmail(user.email || "");
      }
    } catch (error) {
      console.error("Error loading invite:", error);
      setError("Failed to load invite details");
    } finally {
      setLoading(false);
    }
  };

  const handleJoinOrganization = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !inviteLink) return;

    setSubmitting(true);

    try {
      // If user is not authenticated, they need to sign up first
      if (!currentUser) {
        // Redirect to signup with invite token and email
        const signupUrl = `/auth/signup?token=${token}&email=${encodeURIComponent(
          email
        )}`;
        router.push(signupUrl);
        return;
      }

      // User is authenticated, directly join the organization
      const response = await fetch("/api/invite/use-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkId: token,
          email: email,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to join organization");
      }

      toast.success("Successfully joined the organization!", {
        description: `You are now a ${inviteLink.role} in ${inviteLink.organization.name}`,
      });

      // Redirect to the organization dashboard
      router.push(`/org/${inviteLink.organization.slug}`);
    } catch (error: any) {
      console.error("Error joining organization:", error);
      toast.error("Failed to join organization", {
        description: error.message || "Please try again",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignup = async () => {
    try {
      setGoogleLoading(true);
      setError(null);
      // Persist flags and invite context for post-OAuth processing
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem("googleLogin", "true");
          window.localStorage.setItem("forgotPassword", "false");
          // Always persist token so post-auth can process invite
          if (token) {
            window.localStorage.setItem("inviteLinkToken", token);
          }
          // Only persist email if user provided it
          if (email) {
            window.localStorage.setItem("inviteEmail", email);
          }
          // Hint middleware we're in OAuth (short-lived cookie)
          document.cookie = `oauthFlow=1; Path=/; Max-Age=300; SameSite=Lax`;
        } catch {}
      }

      const baseRedirect = typeof window !== "undefined" ? window.location.origin : "";
      // Redirect to site root; AuthProvider will handle membership + redirect
      const redirectTo = `${baseRedirect}/`;

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (oauthError) throw oauthError;
      toast.loading("Redirecting to Google…");
    } catch (err: any) {
      setGoogleLoading(false);
      toast.error("Google sign-up failed", {
        description: err?.message || "Please try again.",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-red-600">Invalid Invite</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => router.push("/")}
              className="w-full"
              variant="outline"
            >
              Return Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!inviteLink) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Invite Not Found</CardTitle>
            <CardDescription>
              This invite link is no longer valid.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>You're Invited!</CardTitle>
          <CardDescription>
            Join <strong>{inviteLink.organization.name}</strong> as a{" "}
            <span className="capitalize font-medium">{inviteLink.role}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleJoinOrganization} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your.email@example.com"
                required
                disabled={!!currentUser} // Disable if user is already logged in
              />
              {currentUser && (
                <p className="text-xs text-muted-foreground mt-1">
                  Using your current account email
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={submitting || !email}
            >
              {submitting ? (
                <>
                  <Spinner className="w-4 h-4 mr-2" />
                  {currentUser ? "Joining..." : "Proceeding..."}
                </>
              ) : currentUser ? (
                "Join Organization"
              ) : (
                "Continue to Sign Up"
              )}
            </Button>

            {!currentUser && (
              <>
                <div className="my-4 flex items-center gap-2">
                  <div className="h-px bg-black flex-1" />
                  <span className="text-xs text-muted-foreground">OR</span>
                  <div className="h-px bg-black flex-1" />
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full cursor-pointer"
                  onClick={handleGoogleSignup}
                  disabled={submitting || googleLoading}
                >
                  {googleLoading ? (
                    <>
                      <Spinner className="w-4 h-4 mr-2" />
                      Connecting to Google…
                    </>
                  ) : (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-4 w-4 mr-2" aria-hidden>
                        <path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C32.9 6.1 28.7 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z" />
                        <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.8 16 19.1 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C32.9 6.1 28.7 4 24 4 16.3 4 9.6 8.5 6.3 14.7z" />
                        <path fill="#4CAF50" d="M24 44c5.3 0 9.9-1.8 13.2-4.9l-6.1-5.1C28.8 35.4 26.5 36 24 36c-5.3 0-9.8-3.4-11.4-8.2l-6.4 5C9.4 39.5 16.1 44 24 44z" />
                        <path fill="#1976D2" d="M43.6 20.5H24v8h11.3c-1 2.9-3 5.1-5.5 6.7l6.1 5.1C39.3 36.2 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z" />
                      </svg>
                      Continue with Google
                    </>
                  )}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  You'll need to create an account to join this organization
                </p>
              </>
            )}

            <div className="text-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => router.push("/")}
              >
                Return Home
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
