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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
      message: "Subdomain must be at least 3 characters.",
    })
    .regex(/^[a-z0-9-]+$/, {
      message:
        "Subdomain can only contain lowercase letters, numbers, and hyphens.",
    }),
});

export default function CreateOrganizationPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { organization, setOrganization, setUserRole } = useOrgStore();
  const [isLoading, setIsLoading] = useState(true);

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
        }
      } catch (err) {
        console.error("Error checking user organization:", err);
      } finally {
        setIsLoading(false);
      }
    };

    checkUserOrganization();
  }, [user, organization, setOrganization, setUserRole]);

  ///////////////////////////////

  async function onSubmit(values: z.infer<typeof formSchema>) {
    if (!user) {
      toast.error("Authentication required", {
        description: "Please sign in to create an organization.",
      });
      router.push("/auth/signin");
      return;
    }

    try {
      const loadingToast = toast.loading("Creating your organization...");

      const { organizationName, subdomain } = values;

      // 1) Create organization
      const { data: orgData, error: orgError } = await organizations.create(
        organizationName,
        subdomain
      );
      if (orgError || !orgData) {
        toast.error("Failed to create organization", {
          description: orgError?.message || "Please try again.",
        });
        toast.dismiss(loadingToast);
        return;
      }

      // 2) Link user as owner
      const { error: linkError } = await organizations.addUser(
        orgData.id,
        user.id,
        "owner"
      );
      if (linkError) {
        toast.error("Failed to set up organization", {
          description: linkError.message,
        });
        toast.dismiss(loadingToast);
        return;
      }

      // 3) Success + redirect
      toast.dismiss(loadingToast);
      toast.success("Organization created successfully!", {
        description: "Redirecting to your dashboard…",
      });

      const isLocal =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";

      if (isLocal) {
        router.push(`/org/${orgData.slug}`);
      } else {
        window.location.href = `https://${orgData.slug}.yourdomain.com/`;
      }
    } catch (err: any) {
      toast.error("Something went wrong", {
        description: err.message,
      });
    }
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center space-y-1">
            <CardTitle>Loading...</CardTitle>
            <CardDescription>
              Please wait while we check your organization status.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Show Create Organization form
  return (
    <div className="flex min-h-screen items-center justify-center px-4 ">
      <Card className="w-full max-w-2xl">
        <CardHeader className="text-center space-y-1">
          <CardTitle>Create Organization</CardTitle>
          <CardDescription>
            Set up your organization's profile to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="organizationName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Acme Inc." {...field} />
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
                    <FormLabel>Subdomain</FormLabel>
                    <FormControl>
                      <div className="flex items-center">
                        <Input placeholder="acme" {...field} />
                        <span className="ml-2 text-muted-foreground">
                          .yourdomain.com
                        </span>
                      </div>
                    </FormControl>
                    <FormDescription>
                      Your organization's unique URL.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full cursor-pointer">
                Create Organization
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
