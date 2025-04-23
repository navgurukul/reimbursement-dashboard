// app/page.tsx (or wherever your landing page lives)

"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/useAuthStore";
import { useOrgStore } from "@/store/useOrgStore";
import { useState, useEffect } from "react";
import { profiles, Profile } from "@/lib/db";

export default function Hero() {
  const { user, logout } = useAuthStore();
  const { organization } = useOrgStore();
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      if (!user) return;
      const { data, error } = await profiles.getByUserId(user.id);
      if (error || !data) return;
      setProfile(data as Profile);
    };
    loadProfile();
  }, [user]);

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-background to-muted flex items-center">
      {/* Top‑right dynamic nav */}
      <header className="absolute top-0 inset-x-0 flex justify-end p-6">
        {user && (
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              className="cursor-pointer"
              size="sm"
              onClick={() => logout()}
            >
              Sign Out
            </Button>
          </div>
        )}
      </header>

      {/* Hero content */}
      <div className="container mx-auto px-6 py-16 text-center space-y-6">
        <h1 className="text-4xl lg:text-5xl font-extrabold">
          {user
            ? `Welcome back, ${profile?.full_name || user.email}`
            : "Simplify Your Expense Reimbursements"}
        </h1>
        <p className="text-lg text-muted-foreground mx-auto">
          {user
            ? "Manage your expenses and reimbursements with ease."
            : "Upload bills, generate vouchers, and get manager approvals — all in one sleek dashboard."}
        </p>
        {!user ? (
          <div className="flex justify-center gap-4">
            <Button asChild size="lg">
              <Link href="/auth/signup">Get Started</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/auth/signin">Sign In</Link>
            </Button>
          </div>
        ) : (
          <div className="flex justify-center gap-4">
            <Button asChild size="lg">
              <Link
                href={
                  organization
                    ? `/org/${organization.slug}`
                    : "/create-organization"
                }
              >
                {organization ? "Go to Dashboard" : "Create Organization"}
              </Link>
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
