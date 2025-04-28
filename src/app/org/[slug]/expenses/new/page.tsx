"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { orgSettings, expenses, ReceiptInfo } from "@/lib/db";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Upload } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/store/useAuthStore";
import { organizations } from "@/lib/db";

interface Column {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  visible?: boolean;
  options?: string[] | { value: string; label: string }[];
}

interface ExpenseData {
  org_id: string;
  user_id: string;
  expense_type: string;
  amount: number;
  date: string;
  status: "submitted" | "approved" | "rejected";
  receipt: ReceiptInfo | null;
  custom_fields: Record<string, any>;
  approver_id?: string;
}

export default function NewExpensePage() {
  const router = useRouter();
  const params = useParams();
  const { organization, userRole } = useOrgStore();
  const { user } = useAuthStore();
  const orgId = organization?.id!;
  const slug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [columns, setColumns] = useState<Column[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [approvers, setApprovers] = useState<
    { id: string; full_name: string }[]
  >([]);

  // Fetch organization settings and approvers
  useEffect(() => {
    async function fetchData() {
      if (!orgId) return;

      try {
        const [
          { data: settings, error: settingsError },
          { data: members, error: membersError },
        ] = await Promise.all([
          orgSettings.getByOrgId(orgId),
          organizations.getOrganizationMembers(orgId),
        ]);

        if (settingsError) {
          toast.error("Failed to load organization settings", {
            description: settingsError.message,
          });
          return;
        }

        if (membersError) {
          toast.error("Failed to load organization members", {
            description: membersError.message,
          });
          return;
        }
        console.log("Settings:", settings);
        if (settings) {
          setColumns(settings.expense_columns || []);

          // Initialize form data with default values
          const initialData: Record<string, any> = {};
          settings.expense_columns.forEach((col: any) => {
            if (col.visible) {
              initialData[col.key] = "";
            }
          });

          // Set default date to today
          initialData.date = new Date().toISOString().split("T")[0];

          setFormData(initialData);
        }

        // Filter members to get only admins and owners
        if (members) {
          const approverList = members
            .filter((m) => m.role === "admin" || m.role === "owner")
            .map((m) => ({
              id: m.user_id,
              full_name: m.full_name || m.user_id,
            }));
          setApprovers(approverList);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [orgId]);

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setReceiptFile(file);

    // Create preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setReceiptPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Handle form input changes
  const handleInputChange = (
    key: string,
    value: string | number | boolean | string[]
  ) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      // Prepare expense data
      const expenseData: ExpenseData = {
        org_id: orgId,
        user_id: user.id,
        expense_type: formData.expense_type || "Other",
        amount: parseFloat(formData.amount) || 0,
        date: formData.date,
        status: "submitted",
        receipt: null,
        custom_fields: {},
      };

      // Add approver if selected (for admins and owners)
      if (userRole !== "member" && formData.approver_id) {
        expenseData.approver_id = formData.approver_id;
      }

      // Add custom fields
      columns.forEach((col) => {
        if (
          col.visible &&
          col.key !== "expense_type" &&
          col.key !== "amount" &&
          col.key !== "date" &&
          col.key !== "approver_id"
        ) {
          expenseData.custom_fields[col.key] = formData[col.key];
        }
      });

      // Create expense with receipt if provided
      const { data, error } = await expenses.create(
        expenseData,
        receiptFile || undefined
      );

      if (error) {
        throw error;
      }

      toast.success("Expense created successfully");
      router.push(`/org/${slug}/expenses`);
    } catch (error: any) {
      console.error("Error creating expense:", error);
      toast.error("Failed to create expense", {
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => router.push(`/org/${slug}/expenses`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Expenses
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? (
            <>
              <Spinner className="mr-2 h-4 w-4" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Expense
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Expense</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {columns.map((col) => {
              if (!col.visible) return null;

              return (
                <div key={col.key} className="space-y-2">
                  <Label htmlFor={col.key}>
                    {col.label}
                    {col.required && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </Label>

                  {col.type === "text" && (
                    <Input
                      id={col.key}
                      value={formData[col.key] || ""}
                      onChange={(e) =>
                        handleInputChange(col.key, e.target.value)
                      }
                      required={col.required}
                    />
                  )}

                  {col.type === "number" && (
                    <Input
                      id={col.key}
                      type="number"
                      value={formData[col.key] || ""}
                      onChange={(e) =>
                        handleInputChange(col.key, parseFloat(e.target.value))
                      }
                      required={col.required}
                    />
                  )}

                  {col.type === "date" && (
                    <Input
                      id={col.key}
                      type="date"
                      value={formData[col.key] || ""}
                      onChange={(e) =>
                        handleInputChange(col.key, e.target.value)
                      }
                      required={col.required}
                    />
                  )}

                  {col.type === "textarea" && (
                    <Textarea
                      id={col.key}
                      value={formData[col.key] || ""}
                      onChange={(e) =>
                        handleInputChange(col.key, e.target.value)
                      }
                      required={col.required}
                    />
                  )}

                  {col.type === "dropdown" && col.options && (
                    <Select
                      value={formData[col.key] || ""}
                      onValueChange={(value: string) =>
                        handleInputChange(col.key, value)
                      }
                    >
                      <SelectTrigger id={col.key}>
                        <SelectValue placeholder="Select an option" />
                      </SelectTrigger>
                      <SelectContent>
                        {col.options.map(
                          (
                            option: string | { value: string; label: string }
                          ) => {
                            const value =
                              typeof option === "string"
                                ? option
                                : option.value;
                            const label =
                              typeof option === "string"
                                ? option
                                : option.label;
                            return (
                              <SelectItem key={value} value={value}>
                                {label}
                              </SelectItem>
                            );
                          }
                        )}
                      </SelectContent>
                    </Select>
                  )}

                  {col.type === "radio" && col.options && (
                    <RadioGroup
                      value={formData[col.key] || ""}
                      onValueChange={(value: string) =>
                        handleInputChange(col.key, value)
                      }
                    >
                      {col.options.map(
                        (option: string | { value: string; label: string }) => {
                          const value =
                            typeof option === "string" ? option : option.value;
                          const label =
                            typeof option === "string" ? option : option.label;
                          return (
                            <div
                              key={value}
                              className="flex items-center space-x-2"
                            >
                              <RadioGroupItem
                                value={value}
                                id={`${col.key}-${value}`}
                              />
                              <Label htmlFor={`${col.key}-${value}`}>
                                {label}
                              </Label>
                            </div>
                          );
                        }
                      )}
                    </RadioGroup>
                  )}

                  {col.type === "checkbox" && col.options && (
                    <div className="space-y-2">
                      {col.options.map(
                        (option: string | { value: string; label: string }) => {
                          const value =
                            typeof option === "string" ? option : option.value;
                          const label =
                            typeof option === "string" ? option : option.label;
                          return (
                            <div
                              key={value}
                              className="flex items-center space-x-2"
                            >
                              <Checkbox
                                id={`${col.key}-${value}`}
                                checked={(formData[col.key] || []).includes(
                                  value
                                )}
                                onCheckedChange={(checked) => {
                                  const currentValues = formData[col.key] || [];
                                  if (checked) {
                                    handleInputChange(col.key, [
                                      ...currentValues,
                                      value,
                                    ]);
                                  } else {
                                    handleInputChange(
                                      col.key,
                                      currentValues.filter(
                                        (v: string) => v !== value
                                      )
                                    );
                                  }
                                }}
                              />
                              <Label htmlFor={`${col.key}-${value}`}>
                                {label}
                              </Label>
                            </div>
                          );
                        }
                      )}
                    </div>
                  )}

                  {col.type === "file" && (
                    <div className="space-y-2">
                      <Input
                        id={col.key}
                        type="file"
                        onChange={handleFileChange}
                        accept="image/*,.pdf"
                      />
                      {receiptPreview && (
                        <div className="mt-2">
                          {receiptPreview.startsWith("data:image") ? (
                            <img
                              src={receiptPreview}
                              alt="Receipt preview"
                              className="max-h-40 rounded-md"
                            />
                          ) : (
                            <div className="p-2 border rounded-md">
                              <p className="text-sm">PDF receipt selected</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Add approver selection for admins and owners */}
            {userRole !== "member" && (
              <div className="space-y-2">
                <Label htmlFor="approver">Assign to Approver</Label>
                <Select
                  value={formData.approver_id}
                  onValueChange={(value) =>
                    handleInputChange("approver_id", value)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an approver" />
                  </SelectTrigger>
                  <SelectContent>
                    {approvers.map((approver) => (
                      <SelectItem key={approver.id} value={approver.id}>
                        {approver.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Receipt upload section */}
            <div className="space-y-2">
              <Label htmlFor="receipt">Receipt</Label>
              <div className="flex items-center space-x-2">
                <Input
                  id="receipt"
                  type="file"
                  onChange={handleFileChange}
                  accept="image/*,.pdf"
                />
                <Button type="button" variant="outline" disabled={!receiptFile}>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload
                </Button>
              </div>
              {receiptPreview && (
                <div className="mt-2">
                  {receiptPreview.startsWith("data:image") ? (
                    <img
                      src={receiptPreview}
                      alt="Receipt preview"
                      className="max-h-40 rounded-md"
                    />
                  ) : (
                    <div className="p-2 border rounded-md">
                      <p className="text-sm">PDF receipt selected</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
