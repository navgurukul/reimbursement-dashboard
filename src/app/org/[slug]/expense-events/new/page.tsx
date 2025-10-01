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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";


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
    if (!formData.start_date) newErrors["start_date"] = "Start date is required.";
    if (!formData.end_date) newErrors["end_date"] = "End date is required.";
    if (!formData.description) newErrors["description"] = "Description is required.";

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
    <div className="max-w-[800px] mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => router.push(`/org/${slug}/expense-events`)}
          className="text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Events
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create New Expense Event</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="title" className="text-sm font-medium">
                Event Title*
              </label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange("title", e.target.value)}
                className={errors["title"] ? "border-red-500" : ""}
              />
              {errors["title"] && (
                <p className="text-red-500 text-sm mt-1">{errors["title"]}</p>
              )}

            </div>

            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium">
                Description
              </label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  handleInputChange("description", e.target.value)
                }
                placeholder="Details about this expense event"
                rows={4}
                className={`w-full ${errors["description"] ? "border-red-500" : ""}`}
              />
              {errors["description"] && (
                <p className="text-red-500 text-sm mt-1">{errors["description"]}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="start_date" className="text-sm font-medium">
                  Start Date <span className="text-red-500">*</span>
                </label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => handleInputChange("start_date", e.target.value)}
                  className={errors["start_date"] ? "border-red-500" : ""}
                />
                {errors["start_date"] && (
                  <p className="text-red-500 text-sm mt-1">{errors["start_date"]}</p>
                )}

              </div>
              <div className="space-y-2">
                <label htmlFor="end_date" className="text-sm font-medium">
                  End Date <span className="text-red-500">*</span>
                </label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => handleInputChange("end_date", e.target.value)}
                  className={errors["end_date"] ? "border-red-500" : ""}
                />
                {errors["end_date"] && (
                  <p className="text-red-500 text-sm mt-1">{errors["end_date"]}</p>
                )}


              </div>

            </div>

            <div className="pt-4 flex justify-end">
              <Button
                type="submit"
                disabled={saving}
                className="bg-black text-white hover:bg-black/90"
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
