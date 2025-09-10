"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";

import { useAuthStore } from "@/store/useAuthStore";
import { Role, useOrgStore } from "@/store/useOrgStore";

import supabase from "@/lib/supabase";
import { organizations } from "@/lib/db";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { login, error: authError, isLoading } = useAuthStore();
  const { setOrganization, setUserRole, resetOrg } = useOrgStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Dialog state to replace toast notifications
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogState, setDialogState] = useState<{
    status: "loading" | "success" | "error";
    title: string;
    description?: string;
    nextHref?: string;
  }>({ status: "loading", title: "" });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    resetOrg();

    try {
      setIsDialogOpen(true);
      setDialogState({
        status: "loading",
        title: "Signing you in…",
        description: "Please wait while we authenticate your account.",
      });
      // 1️⃣ Authenticate
      await login(email, password);

      // 2️⃣ Get user id
      const {
        data: { user },
        error: sessionError,
      } = await supabase.auth.getUser();
      if (sessionError || !user) throw sessionError ?? new Error("No session");

      const userId = user.id;

      // 3️⃣ Fetch membership + full org row
      const { data: membership, error: membershipError } =
        await organizations.getUserOrganizations(userId);

      if (membershipError) throw membershipError;

      // 4️⃣ Store in Zustand
      if (membership && membership.organizations) {
        setOrganization(membership.organizations);
        setUserRole(membership.role as Role);
      }

      // 5️⃣ Redirect logic
      const redirectTo = searchParams.get("redirectTo");
      if (redirectTo) {
        setDialogState({
          status: "success",
          title: "Login successful",
          description: "Redirecting to your destination…",
          nextHref: redirectTo,
        });
        router.push(redirectTo);
        return;
      }

      if (membership?.organizations?.slug) {
        const next = `/org/${membership.organizations.slug}`;
        setDialogState({
          status: "success",
          title: "Welcome back",
          description: "Taking you to your organization dashboard…",
          nextHref: next,
        });
        router.push(next);
      } else {
        const next = "/create-organization";
        setDialogState({
          status: "success",
          title: "Login successful",
          description: "Let’s set up your organization.",
          nextHref: next,
        });
        router.push(next);
      }
    } catch (err: any) {
      setError(err.message || "Login failed");
      setDialogState({
        status: "error",
        title: "Login failed",
        description: err.message || "Please try again.",
      });
      setIsDialogOpen(true);
    }
  };

  return (
    <div className={cn("w-full max-w-md mx-auto", className)} {...props}>
      <Card className="shadow-md border">
        <CardContent className="p-6 space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold">Welcome back</h1>
            <p className="text-muted-foreground text-sm">
              Sign in to your account
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link
                  href="/auth/forgot-password"
                  className="text-sm text-muted-foreground hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
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
              {isLoading ? "Signing in..." : "Sign In"}
            </Button>
          </form>
          <p className="text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link
              href="/auth/signup"
              className="text-slate-500 hover:underline"
            >
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        By signing in, you agree to our{" "}
        <a href="#" className="underline underline-offset-2">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="#" className="underline underline-offset-2">
          Privacy Policy
        </a>
        .
      </p>

      {/* Login feedback modal (no action button; redirects automatically) */}
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
