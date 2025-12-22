"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/store/useAuthStore";
import { useOrgStore } from "@/store/useOrgStore";
import { useState, useEffect } from "react";
import { profiles, organizations, Profile } from "@/lib/db";

export default function Hero() {
  const { user, logout } = useAuthStore();
  const { organization, setOrganization, setUserRole } = useOrgStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInvited, setIsInvited] = useState(false);

  useEffect(() => {
    const loadUserData = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        // Load profile
        const { data: profileData, error: profileError } =
          await profiles.getByUserId(user.id);
        if (profileError || !profileData) {
          console.error("Error loading profile:", profileError);
          setIsLoading(false);
          return;
        }

        const userProfile = profileData as Profile;
        setProfile(userProfile);

        // Check if user has organization membership (is invited)
        const { data: membershipData, error: membershipError } =
          await organizations.checkMembership(user.id);

        if (!membershipError && membershipData && membershipData.org_id) {
          setIsInvited(true);

          // Load organization if not already in store
          if (!organization) {
            try {
              const { data: orgData, error: orgError } =
                await organizations.getById(membershipData.org_id);

              if (!orgError && orgData) {
                setOrganization(orgData);

                // Get user role in the organization
                const { data: roleData, error: roleError } =
                  await organizations.getUserRole(
                    membershipData.org_id,
                    user.id
                  );
                if (!roleError && roleData) {
                  setUserRole(roleData.role);
                }
              }
            } catch (orgLoadError) {
              console.error("Error loading organization:", orgLoadError);
            }
          }
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadUserData();
  }, [user, organization, setOrganization, setUserRole]);

  // Show loading state while data is being fetched
  if (isLoading && user) {
    return (
      <main className="relative min-h-screen bg-gradient-to-b from-background to-muted flex items-center">
        <header className="absolute top-0 inset-x-0 flex justify-end p-6">
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
        </header>
        <div className="container mx-auto px-6 py-16 text-center">
          <div className="animate-pulse space-y-4">
            <div className="h-12 bg-muted rounded w-64 mx-auto"></div>
            <div className="h-4 bg-muted rounded w-96 mx-auto"></div>
            <div className="h-10 bg-muted rounded w-40 mx-auto"></div>
          </div>
        </div>
      </main>
    );
  }

  // Determine button text and link
  const shouldShowCreateOrg = !isInvited && !organization;
  const shouldShowDashboard = isInvited || organization;
  const hasValidOrgSlug = organization?.slug;

  const getDashboardLink = () => {
    if (hasValidOrgSlug) {
      return `/org/${organization.slug}/expenses`;
    }
    return "/create-organization";
  };

  const getButtonText = () => {
    if (shouldShowDashboard) {
      return "Go to Expenses";
    }
    return "Create Organization";
  };

  // Disable button if invited but organization slug not available
  const shouldDisableButton = isInvited && !hasValidOrgSlug;

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
            {shouldDisableButton ? (
              <Button size="lg" disabled>
                Loading...
              </Button>
            ) : (
              <Button asChild size="lg">
                <Link href={getDashboardLink()}>{getButtonText()}</Link>
              </Button>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
