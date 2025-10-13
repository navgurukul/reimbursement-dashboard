"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import supabase from "@/lib/supabase";
import { Spinner } from "@/components/ui/spinner";
import { useRouter } from "next/navigation";
import { organizations } from "@/lib/db";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { refreshUser, setUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const hasRedirectedRef = useRef(false);

  const maybeRedirectFromFlags = async (userId?: string | null) => {
    if (hasRedirectedRef.current) return;
    if (typeof window === "undefined") return;
    try {
      const ls = window.localStorage;
      const googleLogin = ls.getItem("googleLogin") === "true";
      const forgotPassword = ls.getItem("forgotPassword") === "true";

      if (forgotPassword) {
        hasRedirectedRef.current = true;
        // Clear flag to avoid loops
        ls.setItem("forgotPassword", "false");
        router.push("/auth/create-password");
        return;
      }

      if (googleLogin && userId) {
        // Clear flag early to avoid repeated redirects
        ls.setItem("googleLogin", "false");
        // Handle post-OAuth invite join if context exists, but DO NOT redirect.
        const inviteToken = ls.getItem("inviteLinkToken");
        const inviteEmail = ls.getItem("inviteEmail");
        const oldInviteToken = ls.getItem("inviteOldToken");
        if (inviteToken && inviteEmail) {
          try {
            const resp = await fetch("/api/invite/use-link-signup", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ linkId: inviteToken, email: inviteEmail, userId }),
            });
            // Clear invite context regardless of outcome to avoid loops
            ls.removeItem("inviteLinkToken");
            ls.removeItem("inviteEmail");
          } catch {
            // Ignore network errors; user stays on welcome page
          }
        } else if (inviteToken) {
          // If no inviteEmail saved, derive from the authenticated user
          try {
            const { data: userData } = await supabase.auth.getUser();
            const derivedEmail = userData?.user?.email;
            if (derivedEmail) {
              await fetch("/api/invite/use-link-signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ linkId: inviteToken, email: derivedEmail, userId }),
              });
            }
          } catch {
            // Ignore; user stays on welcome page
          } finally {
            ls.removeItem("inviteLinkToken");
            ls.removeItem("inviteEmail");
          }
        } else if (oldInviteToken) {
          // Handle old invite: add user to org and mark invite used
          try {
            const { data: inviteData, error: inviteErr } = await supabase
              .from("invites")
              .select("org_id, role, used")
              .eq("id", oldInviteToken)
              .single();
            if (!inviteErr && inviteData && !inviteData.used) {
              const { error: memberErr } = await supabase
                .from("organization_users")
                .insert({ org_id: inviteData.org_id, user_id: userId, role: inviteData.role });
              if (!memberErr) {
                await supabase.from("invites").update({ used: true }).eq("id", oldInviteToken);
              }
            }
          } catch {
            // Ignore failures
          } finally {
            ls.removeItem("inviteOldToken");
          }
        }
        // Do not navigate; keep user on welcome page
        hasRedirectedRef.current = true;
      }
    } catch {
      // Ignore storage access errors
    }
  };

  useEffect(() => {
    // Check for existing session on mount
    const initializeAuth = async () => {
      try {
        // Get the current session
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session) {
          // If we have a session, update the auth store
          setUser(session.user);
          await maybeRedirectFromFlags(session.user?.id);
        } else {
          // Ensure we clear any stale persisted user when there is no session
          setUser(null);
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();

    // Set up auth state listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
        void maybeRedirectFromFlags(session.user?.id);
      } else {
        setUser(null);
      }
    });

    // Clean up subscription
    return () => {
      subscription.unsubscribe();
    };
  }, [setUser]);

  if (isLoading) {
    return <Spinner />;
  }

  return children;
}
