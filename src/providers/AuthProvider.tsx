"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import supabase from "@/lib/supabase";
import { Spinner } from "@/components/ui/spinner";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { refreshUser, setUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);

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
