"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import { organizations, invites, profiles, InviteRow } from "@/lib/db";
import supabase from "@/lib/supabase";
import { toast } from "sonner";
import Link from "next/link";

export function SignupForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const { signup, error: authError, isLoading } = useAuthStore();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteRow | null>(null);
  const { syncExternalAuth } = useAuthStore.getState();
  
  // Load invite if present
  useEffect(() => {
    if (!token) return;
    invites.getById(token).then(({ data, error }) => {
      if (error || !data) {
        setError("Invalid or expired invite.");
      } else if (data.used) {
        setError("This invite has already been used.");
      } else {
        setInvite(data);
        setEmail(data.email);
      }
    });
  }, [token]);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const toastId = toast.loading(
      invite ? "Joining organization…" : "Creating account…"
    );

    try {
      // 1) Sign up the user
      let userId: string;
      if (invite && token) {
        const { data: signUpData, error: signUpError } =
          await supabase.auth.signUp({
            email: invite.email,
            password,
          });
        if (signUpError || !signUpData.user) throw signUpError;
        userId = signUpData.user.id;
      } else {
        const { data: signUpData, error: signUpError } =
          await supabase.auth.signUp({
            email,
            password,
          });
        if (signUpError || !signUpData.user) throw signUpError;
        userId = signUpData.user.id;
      }

      // 2) Upsert their profile row
      const { error: profileError } = await profiles.upsert({
        user_id: userId,
        email: invite ? invite.email : email,
        full_name: name || undefined,
      });
      if (profileError) throw profileError;

      // 3) If this was an invite, link to org & mark used
      if (invite && token) {
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
        toast.success("Joined successfully! Redirecting…");
        router.push(`/org/${orgData.slug}`);
      } else {
        toast.dismiss(toastId);
        toast.success("Account created! Check your email.");
        router.push("/auth/signin");
      }
      await syncExternalAuth(userId);
    } catch (err: any) {
      toast.dismiss(toastId);
      setError(err.message || "Something went wrong.");
      toast.error("Signup failed", { description: err.message });
    }
  };

  return (
    <div className={cn("w-full max-w-md mx-auto", className)} {...props}>
      <Card className="shadow-md border">
        <CardContent className="p-6 space-y-6">
          <h1 className="text-2xl font-bold text-center">
            {invite ? "Complete Your Invite" : "Create Account"}
          </h1>

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
                readOnly={!!invite}
                className={invite ? "cursor-not-allowed" : ""}
                required
              />
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
              {invite ? "Join Organization" : "Sign Up"}
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
