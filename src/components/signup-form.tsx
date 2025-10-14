"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import { organizations, invites, InviteRow } from "@/lib/db";
import supabase from "@/lib/supabase";
import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

import Link from "next/link";
import { Spinner } from "@/components/ui/spinner";

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

type InviteType = "old" | "new" | null;

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token");
  const emailParam = searchParams?.get("email"); // For new invite links

  const { signup, error: authError, isLoading } = useAuthStore();

  const [name, setName] = useState("");
  const [email, setEmail] = useState(emailParam || "");
  // const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  // State for old invite system
  const [invite, setInvite] = useState<InviteRow | null>(null);

  // State for new invite link system
  const [inviteLink, setInviteLink] = useState<InviteLink | null>(null);

  // Track which type of invite this is
  const [inviteType, setInviteType] = useState<InviteType>(null);

  const { syncExternalAuth } = useAuthStore.getState();

  // Generate a secure random password so users don't need to input one
  const generateRandomPassword = (length: number = 20) => {
    const charset =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{};:,.<>?";
    const result: string[] = [];
    if (typeof window !== "undefined" && window.crypto) {
      const values = new Uint32Array(length);
      window.crypto.getRandomValues(values);
      for (let i = 0; i < length; i++) {
        result.push(charset[values[i] % charset.length]);
      }
      return result.join("");
    }
    // Fallback (non-crypto) – should rarely be used
    for (let i = 0; i < length; i++) {
      result.push(charset[Math.floor(Math.random() * charset.length)]);
    }
    return result.join("");
  };

  // Dialog state for replacing toast notifications
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogState, setDialogState] = useState<{
    status: "loading" | "success" | "error";
    title: string;
    description?: string;
    nextHref?: string;
  }>({ status: "loading", title: "" });

  // Load invite if present (support both old and new systems)
  useEffect(() => {
    if (!token) return;

    const loadInviteData = async () => {
      try {
        // First, try to load as new invite link
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

        if (linkData && !linkError) {
          // This is a new invite link

          // Check if link is expired
          if (
            linkData.expires_at &&
            new Date() > new Date(linkData.expires_at)
          ) {
            setError("This invite link has expired.");
            return;
          }

          // Check usage limits
          if (linkData.max_uses && linkData.current_uses >= linkData.max_uses) {
            setError("This invite link has reached its usage limit.");
            return;
          }

          setInviteLink(linkData);
          setInviteType("new");

          // For new links, email comes from URL parameter
          if (emailParam) {
            setEmail(emailParam);
          }
          return;
        }

        // If new invite link failed, try old invite system
        const { data: oldInviteData, error: oldInviteError } =
          await invites.getById(token);

        if (oldInviteError || !oldInviteData) {
          setError("Invalid or expired invite.");
          return;
        }

        if (oldInviteData.used) {
          setError("This invite has already been used.");
          return;
        }

        // This is an old invite
        setInvite(oldInviteData);
        setInviteType("old");
        setEmail(oldInviteData.email);
      } catch (err) {
        console.error("Error loading invite data:", err);
        setError("Failed to load invite information.");
      }
    };

    loadInviteData();
  }, [token, emailParam]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const isInviteSignup = inviteType === "old" || inviteType === "new";
    setIsDialogOpen(true);
    setDialogState({
      status: "loading",
      title: isInviteSignup ? "Joining organization…" : "Creating account…",
      description: "Please wait while we complete your signup.",
    });

    try {
      let userId: string;
      let signUpData;

      // Sign up the user with metadata for the trigger
      const signUpEmail = inviteType === "old" ? invite!.email : email;

      const result = await supabase.auth.signUp({
        email: signUpEmail,
        // password,
        password: generateRandomPassword(),
        options: {
          data: {
            full_name: name, // Add metadata for the trigger
          },
        },
      });

      if (result.error || !result.data.user) throw result.error;
      userId = result.data.user.id;
      signUpData = result.data;

      // Give the trigger time to run
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Handle invite logic based on type
      if (inviteType === "old" && invite && token) {
        // Old invite system logic
        const { error: linkError } = await organizations.addUser(
          invite.org_id,
          userId,
          invite.role
        );
        if (linkError) throw linkError;
        await invites.markUsed(token);

        const { data: orgData, error: orgError } = await organizations.getById(
          invite.org_id
        );
        if (orgError || !orgData) throw orgError;

        setDialogState({
          status: "success",
          title: "Account created",
          description: "Please check your email to confirm your signup.",
          nextHref: `/org/${orgData.slug}`,
        });
      } else if (inviteType === "new" && inviteLink && token) {
        // New invite link system logic

        // Call the use-link API to handle the organization joining
        const response = await fetch("/api/invite/use-link-signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            linkId: token,
            email: email,
            userId: userId,
          }),
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || "Failed to join organization");
        }

        setDialogState({
          status: "success",
          title: "Account created",
          description: "Please check your email to confirm your signup.",
          nextHref: `/org/${inviteLink.organization.slug}`,
        });

      } else {
        // Regular signup (no invite)
        setDialogState({
          status: "success",
          title: "Account created",
          description: "Check your email to verify your account.",
          nextHref: "/auth/signin",
        });
      }


      await syncExternalAuth(userId);
    } catch (err: any) {
      console.error("Signup error details:", err);
      setError(err.message || "Something went wrong.");
      setDialogState({
        status: "error",
        title: "Signup failed",
        description: err.message || "Something went wrong.",
      });
      setIsDialogOpen(true);
    }
  };

  const handleGoogleSignup = async () => {
    try {
      setGoogleLoading(true);
      setError(null);
      // Mark Google auth flow in localStorage
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem("googleLogin", "true");
          window.localStorage.setItem("forgotPassword", "false");
          // Persist invite context so we can join org after OAuth
          if (token) {
            if (inviteType === "new") {
              if (email) {
                window.localStorage.setItem("inviteEmail", email);
              }
              window.localStorage.setItem("inviteLinkToken", token);
            } else if (inviteType === "old") {
              // For old invites, we only need the invite id; post-auth will handle org join
              window.localStorage.setItem("inviteOldToken", token);
            }
          }
          // Hint middleware we're in OAuth (short-lived cookie)
          document.cookie = `oauthFlow=1; Path=/; Max-Age=300; SameSite=Lax`;
        } catch {}
      }

      const baseRedirect =
        typeof window !== "undefined" ? window.location.origin : "";
      const redirectTo = `${baseRedirect}/`;

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
    } catch (err: any) {
      setGoogleLoading(false);
      setError(err?.message || "Google signup failed");
    }
  };

  const getFormTitle = () => {
    if (inviteType === "old") return "Complete Your Invite";
    if (inviteType === "new") return `Join ${inviteLink?.organization?.name}`;
    return "Create Account";
  };

  const getButtonText = () => {
    if (inviteType === "old") return "Join Organization";
    if (inviteType === "new") return `Join as ${inviteLink?.role}`;
    return "Sign Up";
  };

  const isEmailReadOnly =
    inviteType === "old" || (inviteType === "new" && !!emailParam);

  return (
    <div className={cn("w-full max-w-md mx-auto", className)} {...props}>
      <Card className="shadow-md border">
        <CardContent className="p-6 space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold">{getFormTitle()}</h1>
            {inviteType === "new" && inviteLink && (
              <p className="text-sm text-muted-foreground mt-1">
                You're joining as a{" "}
                <span className="capitalize font-medium">
                  {inviteLink.role}
                </span>
              </p>
            )}
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                type="text"
                placeholder="Your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                readOnly={isEmailReadOnly}
                className={isEmailReadOnly ? "cursor-not-allowed bg-muted" : ""}
                required
              />
              {isEmailReadOnly && (
                <p className="text-xs text-muted-foreground">
                  Email is pre-filled from your invitation
                </p>
              )}
            </div>

            {/* <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div> */}

            {(error || authError) && (
              <p className="text-sm text-red-500">{error || authError}</p>
            )}

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full cursor-pointer"
            >
              {getButtonText()}
            </Button>
          </form>

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
            disabled={isLoading || googleLoading}
          >
            {googleLoading ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="w-4 h-4" />
                Connecting to Google…
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                  className="h-4 w-4"
                  aria-hidden
                >
                  <path
                    fill="#FFC107"
                    d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C32.9 6.1 28.7 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z"
                  />
                  <path
                    fill="#FF3D00"
                    d="M6.3 14.7l6.6 4.8C14.8 16 19.1 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C32.9 6.1 28.7 4 24 4 16.3 4 9.6 8.5 6.3 14.7z"
                  />
                  <path
                    fill="#4CAF50"
                    d="M24 44c5.3 0 9.9-1.8 13.2-4.9l-6.1-5.1C28.8 35.4 26.5 36 24 36c-5.3 0-9.8-3.4-11.4-8.2l-6.4 5C9.4 39.5 16.1 44 24 44z"
                  />
                  <path
                    fill="#1976D2"
                    d="M43.6 20.5H24v8h11.3c-1 2.9-3 5.1-5.5 6.7l6.1 5.1C39.3 36.2 44 30.9 44 24c0-1.3-.1-2.7-.4-3.5z"
                  />
                </svg>
                Continue with Google
              </span>
            )}
          </Button>

          <p className="text-center text-sm">
            Already have an account?{" "}
            <Link
              href="/auth/signin"
              className="text-slate-500 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>

      {/* Signup feedback modal */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogState.title}</DialogTitle>
            {dialogState.description && (
              <DialogDescription>{dialogState.description}</DialogDescription>
            )}
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
