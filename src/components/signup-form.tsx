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
import { toast } from "sonner";
import Link from "next/link";

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
  const token = searchParams.get("token");
  const emailParam = searchParams.get("email"); // For new invite links

  const { signup, error: authError, isLoading } = useAuthStore();

  const [name, setName] = useState("");
  const [email, setEmail] = useState(emailParam || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // State for old invite system
  const [invite, setInvite] = useState<InviteRow | null>(null);

  // State for new invite link system
  const [inviteLink, setInviteLink] = useState<InviteLink | null>(null);

  // Track which type of invite this is
  const [inviteType, setInviteType] = useState<InviteType>(null);

  const { syncExternalAuth } = useAuthStore.getState();

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
    const toastId = toast.loading(
      isInviteSignup ? "Joining organization…" : "Creating account…"
    );

    try {
      let userId: string;
      let signUpData;

      // Sign up the user with metadata for the trigger
      const signUpEmail = inviteType === "old" ? invite!.email : email;

      const result = await supabase.auth.signUp({
        email: signUpEmail,
        password,
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

        toast.dismiss(toastId);
        toast.success("Please check your email to confirm your signup.");
        router.push(`/org/${orgData.slug}`);
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

        toast.dismiss(toastId);
        toast.success("Please check your email to confirm your signup.");
        router.push(`/org/${inviteLink.organization.slug}`);
      } else {
        // Regular signup (no invite)
        toast.dismiss(toastId);
        toast.success("Account created! Check your email.");
        router.push("/auth/signin");
      }

      await syncExternalAuth(userId);
    } catch (err: any) {
      toast.dismiss(toastId);
      console.error("Signup error details:", err);
      setError(err.message || "Something went wrong.");
      toast.error("Signup failed", { description: err.message });
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

            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

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
    </div>
  );
}
