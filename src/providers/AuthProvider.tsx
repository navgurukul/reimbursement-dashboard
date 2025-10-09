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
        try {
          const { data: membership } = await organizations.getUserOrganizations(
            userId
          );
          hasRedirectedRef.current = true;
          if (membership?.organizations?.slug) {
            router.push(`/org/${membership.organizations.slug}`);
          } else {
            router.push("/create-organization");
          }
        } catch {
          // If anything fails, do not block the app
        }
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
