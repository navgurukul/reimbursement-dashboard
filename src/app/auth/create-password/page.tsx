"use client";

import { useEffect, useMemo, useState } from "react";
import supabase from "@/lib/supabase";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setLinkError(null);
      const code = searchParams.get("code");
      try {
        // 1) Handle hash tokens: #access_token & #refresh_token
        if (typeof window !== "undefined" && window.location.hash) {
          const hash = new URLSearchParams(
            window.location.hash.replace(/^#/, "")
          );
          const access_token = hash.get("access_token");
          const refresh_token = hash.get("refresh_token");
          if (access_token && refresh_token) {
            await supabase.auth.setSession({ access_token, refresh_token });
          }
        }

        // 2) If code param present, prefer verifyOtp for recovery links
        if (code) {
          try {
            const { error: otpErr } = await supabase.auth.verifyOtp({
              type: "recovery",
              token_hash: code,
            });
            if (otpErr) throw otpErr;
          } catch (_) {
            // We'll decide later whether to attempt PKCE based on session state
          }
        }

        // 3) Check if we already have a session; if not and code exists, attempt PKCE exchange
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session && code) {
          try {
            const { error: exchErr } =
              await supabase.auth.exchangeCodeForSession(code);
            if (exchErr) throw exchErr;
          } catch (ex) {
            // Still no session; show non-blocking error
            setLinkError(
              "The reset link could not be validated, but you may still try updating your password below."
            );
          }
        }
      } catch (err: any) {
        // Non-blocking error; keep user on page
        setLinkError(err?.message || "Invalid or expired reset link");
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [searchParams]);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    try {
      setUpdating(true);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password created successfully");
      router.push("/auth/signin");
    } catch (err: any) {
      toast.error("Failed to create password", { description: err.message });
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-700">
          <Spinner className="w-5 h-5" />
          <span className="text-sm">Preparing reset…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 space-y-6">
          <div className="text-center space-y-1">
            <h1 className="section-heading">Create password</h1>
            <p className="descriptive-text text-sm">
              Enter a new password for your account
            </p>
          </div>
          {linkError && (
            <div className="text-sm p-3 rounded border border-red-200 bg-red-50 text-red-700">
              {linkError}
            </div>
          )}
          <form onSubmit={handleUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={updating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                disabled={updating}
              />
            </div>
            <Button
              type="submit"
              className="w-full cursor-pointer"
              disabled={updating}
            >
              {updating ? (
                <div className="flex items-center gap-2">
                  <Spinner className="w-4 h-4" />
                  <span>Updating…</span>
                </div>
              ) : (
                "Create password"
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full cursor-pointer"
              onClick={() => router.push("/auth/forgot-password")}
              disabled={updating}
            >
              Request a new reset link
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
