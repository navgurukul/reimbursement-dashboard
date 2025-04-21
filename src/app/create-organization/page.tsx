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
  const { setOrganization, setUserRole } = useOrgStore();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      organizationName: "",
      subdomain: "",
    },
  });

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

      // First, create the organization
      const { data: orgData, error: orgError } = await organizations.create(
        organizationName,
        subdomain
      );

      if (orgError) {
        console.error("Error creating organization:", orgError.message);
        toast.error("Failed to create organization", {
          description: orgError.message || "Please try again later.",
        });
        return;
      }

      // Then, create the organization user relationship
      const { error: userOrgError } = await organizations.addUser(
        orgData.id,
        user.id,
        "owner"
      );

      if (userOrgError) {
        console.error(
          "Error creating organization user:",
          userOrgError.message
        );
        toast.error("Failed to set up organization", {
          description: "Please try again later.",
        });
        return;
      }

      // Dismiss loading toast and show success
      toast.dismiss(loadingToast);
      toast.success("Organization created successfully!", {
        description: "You will be redirected to your organization dashboard.",
      });

      // Check if we're in development or production
      const isLocal =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";

      // Redirect based on environment
      if (isLocal) {
        router.push(`/org/${orgData.slug}`);
      } else {
        window.location.href = `https://${orgData.slug}.yourdomain.com/`;
      }
    } catch (error: any) {
      toast.error("Failed to create organization", {
        description: error.message || "Please try again later.",
      });
    }
  }

  return (
    <div className="container max-w-2xl py-10">
      <Card>
        <CardHeader>
          <CardTitle>Create Organization</CardTitle>
          <CardDescription>
            Set up your organization profile to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
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
                      This is your organization's display name.
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
                      This will be your organization's unique URL.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit">Create Organization</Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
