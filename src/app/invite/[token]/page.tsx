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
  const token = params?.token as string;

  const [inviteLink, setInviteLink] = useState<InviteLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

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
              <p className="text-xs text-center text-muted-foreground">
                You'll need to create an account to join this organization
              </p>
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
