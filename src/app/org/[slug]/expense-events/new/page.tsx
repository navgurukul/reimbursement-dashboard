"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { useAuthStore } from "@/store/useAuthStore";
import { expenseEvents } from "@/lib/db";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Save } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/page-header";

export default function CreateExpenseEventPage() {
  const router = useRouter();
  const params = useParams();
  const { organization, userRole } = useOrgStore();
  const { user } = useAuthStore();
  const orgId = organization?.id;
  const slug = params.slug as string;

  const [errors, setErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0], // Default to a week from now
  });

  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (
      user &&
      organization &&
      userRole &&
      userRole !== "admin" &&
      userRole !== "owner"
    ) {
      toast.error("You don't have permission to create expense events");
      router.push(`/org/${slug}/expense-events`);
    }
  }, [user, organization, userRole, router, slug]);

  if (!orgId || !user) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (errors[field] && value.trim() !== "") {
      setErrors((prev) => {
        const updated = { ...prev };
        delete updated[field];
        return updated;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const newErrors: Record<string, string> = {};
    if (!formData.title) newErrors["title"] = "Event title is required.";
    if (!formData.start_date)
      newErrors["start_date"] = "Start date is required.";
    if (!formData.end_date) newErrors["end_date"] = "End date is required.";
    if (!formData.description)
      newErrors["description"] = "Description is required.";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setSaving(false);
      return;
    }

    setErrors({}); // ✅ Clear errors if no validation issues

    try {
      const { data, error } = await expenseEvents.create({
        org_id: orgId,
        title: formData.title,
        description: formData.description,
        start_date: formData.start_date,
        end_date: formData.end_date,
        status: "submitted",
        custom_fields: {},
      });
      if (error) {
        throw error;
      }

      if (data) {
        toast.success("Expense event created successfully");
        router.push(`/org/${slug}/expense-events/${data.id}`);
      }
    } catch (error: any) {
      console.error("Error creating expense event:", error);
      toast.error(error?.message || "Please try again later");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-[800px] mx-auto space-y-6">
      <PageHeader
        leading={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/org/${slug}/expense-events`)}
            className="-ml-2 w-fit text-muted-foreground"
          >
            <ArrowLeft />
            Back to Events
          </Button>
        }
        title="Create New Expense Event"
      />

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Event Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange("title", e.target.value)}
                aria-invalid={!!errors["title"]}
                className={errors["title"] ? "border-destructive" : ""}
              />
              {errors["title"] && (
                <p className="text-sm text-destructive">{errors["title"]}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">
                Description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  handleInputChange("description", e.target.value)
                }
                placeholder="Details about this expense event"
                rows={4}
                aria-invalid={!!errors["description"]}
                className={`w-full ${
                  errors["description"] ? "border-destructive" : ""
                }`}
              />
              {errors["description"] && (
                <p className="text-sm text-destructive">
                  {errors["description"]}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start_date">
                  Start Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) =>
                    handleInputChange("start_date", e.target.value)
                  }
                  aria-invalid={!!errors["start_date"]}
                  className={errors["start_date"] ? "border-destructive" : ""}
                />
                {errors["start_date"] && (
                  <p className="text-sm text-destructive">
                    {errors["start_date"]}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="end_date">
                  End Date <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) =>
                    handleInputChange("end_date", e.target.value)
                  }
                  aria-invalid={!!errors["end_date"]}
                  className={errors["end_date"] ? "border-destructive" : ""}
                />
                {errors["end_date"] && (
                  <p className="text-sm text-destructive">
                    {errors["end_date"]}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
              <Button
                type="submit"
                disabled={saving}
                variant="neutral"
                className="w-full sm:w-auto"
              >
                {saving ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Create Event
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
