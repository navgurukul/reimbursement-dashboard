"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PageLoader } from "@/components/ui/page-loader";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { organizations } from "@/lib/db";
import { useAuthStore } from "@/store/useAuthStore";
import { useOrgStore } from "@/store/useOrgStore";
import { useEffect, useState } from "react";

const formSchema = z.object({
  organizationName: z.string().min(2, {
    message: "Organization name must be at least 2 characters.",
  }),
  subdomain: z
    .string()
    .min(3, {
      message: "URL must be at least 3 characters.",
    })
    .regex(/^[a-z0-9-]+$/, {
      message:
        "URL can only contain lowercase letters, numbers, and hyphens.",
    }),
});

export default function CreateOrganizationPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { organization, setOrganization, setUserRole } = useOrgStore();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      organizationName: "",
      subdomain: "",
    },
  });

  useEffect(() => {
    // Check if user has an organization
    const checkUserOrganization = async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        // If organization is already in the store, we're good
        if (organization) {
          setIsLoading(false);
          return;
        }

        // Otherwise, try to fetch the user's organization
        const { data: membership, error } =
          await organizations.getUserOrganizations(user.id);

        if (error) {
          console.error("Error fetching user organizations:", error);
        } else if (membership && membership.organizations) {
          // User has an organization, set it as active
          setOrganization(membership.organizations);
          setUserRole(membership.role as "owner" | "admin" | "member");

          // If the user already has an organization, redirect to their dashboard
          router.push(`/org/${membership.organizations.slug}`);
        }
      } catch (err) {
        console.error("Error checking user organization:", err);
      } finally {
        setIsLoading(false);
      }
    };

    checkUserOrganization();
  }, [user, organization, setOrganization, setUserRole, router]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user) {
      toast.error("Authentication required", {
        description: "Please sign in to create an organization.",
      });
      router.push("/auth/signin");
      return;
    }

    // Prevent double submission
    if (isSubmitting) return;

    setIsSubmitting(true);
    const loadingToast = toast.loading("Creating your organization...");

    try {
      const { organizationName, subdomain } = values;

      // 1) Create organization
      const { data: orgData, error: orgError } = await organizations.create(
        organizationName,
        subdomain
      );

      if (orgError || !orgData) {
        toast.dismiss(loadingToast);
        toast.error("Failed to create organization", {
          description:
            typeof orgError === "object" &&
            orgError !== null &&
            "message" in orgError
              ? String(orgError.message)
              : "Please try again.",
        });
        setIsSubmitting(false);
        return;
      }

      // 2) Link user as owner
      const { error: linkError } = await organizations.addUser(
        orgData.id,
        user.id,
        "owner"
      );

      if (linkError) {
        toast.dismiss(loadingToast);
        toast.error("Failed to set up organization", {
          description: linkError.message,
        });
        setIsSubmitting(false);
        return;
      }

      // 3) Update local state with new organization
      setOrganization(orgData);
      setUserRole("owner");

      // 4) Success message
      toast.dismiss(loadingToast);
      toast.success("Organization created successfully!", {
        description: "Redirecting to your dashboard…",
      });

      // 5) Delay redirect to ensure state updates and API calls complete
      setTimeout(() => {
        router.push(`/org/${orgData.slug}`);
      }, 1000); // 1 second delay for state to settle and toast to be visible
    } catch (err: any) {
      toast.dismiss(loadingToast);
      toast.error("Something went wrong", {
        description: err.message || "Please try again later.",
      });
      setIsSubmitting(false);
    }
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted p-4 sm:p-6">
        <PageLoader message="Please wait while we check your organization status." />
      </div>
    );
  }

  // Show Create Organization form
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardContent className="p-6 space-y-6">
          <div className="text-center space-y-1">
            <h1 className="section-heading">Create Organization</h1>
            <p className="descriptive-text text-sm">
              Set up your organization's profile to get started.
            </p>
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="organizationName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Acme Inc."
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormDescription>
                      Your organization's display name.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="subdomain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization URL</FormLabel>
                    <div className="flex items-center gap-2">
                      <span className="shrink-0 text-sm text-muted-foreground">
                        /org/
                      </span>
                      <FormControl>
                        <Input
                          placeholder="acme"
                          {...field}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                    </div>
                    <FormDescription>
                      Your organization's unique address in the app.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full cursor-pointer"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Creating..." : "Create Organization"}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
