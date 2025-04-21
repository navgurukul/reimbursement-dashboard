"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { organizations } from "@/lib/db";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";

export default function Home() {
  const { user, logout, refreshUser, isLoading } = useAuthStore();
  const [checkedAuth, setCheckedAuth] = useState(false);

  useEffect(() => {
    const initializeAuth = async () => {
      await refreshUser();
      setCheckedAuth(true);
    };

    initializeAuth();
  }, [refreshUser]);

  // useEffect(() => {
  //   const runChecks = async () => {
  //     if (!checkedAuth || isLoading) return;

  //     if (!user) {
  //       router.push("/auth/signin");
  //       return;
  //     }

  //     // If user exists, check organization membership
  //     const { data, error } = await organizations.checkMembership(user.id);

  //     if (error) {
  //       console.error("Error checking org membership:", error.message);
  //       toast.error("Error checking organization membership", {
  //         description: "Please try refreshing the page.",
  //       });
  //       return;
  //     }

  //     if (!data) {
  //       router.push("/create-organization");
  //     }
  //   };

  //   runChecks();
  // }, [user, isLoading, checkedAuth, router]);

  // const handleSignOut = async () => {
  //   try {
  //     const loadingToast = toast.loading("Signing you out...");
  //     await logout();
  //     toast.dismiss(loadingToast);
  //     toast.success("Signed out successfully", {
  //       description: "You have been signed out of your account.",
  //     });
  //     router.push("/auth/signin");
  //   } catch (error: any) {
  //     console.error("Error signing out:", error.message);
  //     toast.error("Error signing out", {
  //       description: "Please try again.",
  //     });
  //   }
  // };

  if (isLoading || !checkedAuth) {
    return <Spinner />;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to Your Dashboard</CardTitle>
          <CardDescription>You are signed in as {user?.email}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Avatar>
                <AvatarFallback>
                  {user?.email?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-sm font-medium">{user?.email}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <Link href="/auth/signin">Sign In</Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
