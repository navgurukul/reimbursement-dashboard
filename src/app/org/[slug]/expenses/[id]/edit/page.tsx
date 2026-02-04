"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { orgSettings, expenses, expenseHistory, vouchers } from "@/lib/db";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Upload, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import supabase from "@/lib/supabase";
import ReceiptPreview from "@/components/ReceiptPreview";
import VoucherPreview from "@/components/VoucherPreview";

export default function EditExpensePage() {
  const router = useRouter();
  const params = useParams();
  const { organization, userRole } = useOrgStore();
  const orgId = organization?.id!;
  const expenseId = params.id as string;
  const slug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expense, setExpense] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [columns, setColumns] = useState<any[]>([]);
  const [expenseTypeOptions, setExpenseTypeOptions] = useState<string[]>([]);
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [hasVoucher, setHasVoucher] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch expense data
        const { data, error } = await expenses.getById(expenseId);
        if (error) {
          toast.error("Failed to load expense", {
            description: error.message,
          });
          router.push(`/org/${slug}/expenses`);
          return;
        }
        setExpense(data);
        setFormData({
          expense_type: data.expense_type,
          amount: data.amount,
          date: new Date(data.date).toISOString().split("T")[0],
          ...data.custom_fields,
        });

        // Check if expense has voucher
        const { data: voucherData } = await vouchers.getByExpenseId(expenseId);
        setHasVoucher(!!voucherData);

        // Fetch organization settings for dropdowns
        const { data: settings, error: settingsError } = await orgSettings.getByOrgId(orgId);
        if (!settingsError && settings && settings.expense_columns) {
          setColumns(settings.expense_columns);

          // Extract expense type options
          const expenseTypeCol = settings.expense_columns.find(
            (col: any) => col.key === "expense_type"
          );
          if (expenseTypeCol && expenseTypeCol.options) {
            const options = expenseTypeCol.options;
            if (Array.isArray(options) && options.length > 0) {
              if (typeof options[0] === "object") {
                setExpenseTypeOptions(
                  (options as Array<{ value: string; label: string }>).map(
                    (opt) => opt.label || opt.value
                  )
                );
              } else {
                setExpenseTypeOptions(options as string[]);
              }
            }
          }

          // Extract location options
          const locationCol = settings.expense_columns.find(
            (col: any) => col.key === "location" || col.key === "location_of_expense"
          );
          if (locationCol && locationCol.options) {
            const options = locationCol.options;
            if (Array.isArray(options) && options.length > 0) {
              if (typeof options[0] === "object") {
                setLocationOptions(
                  (options as Array<{ value: string; label: string }>).map(
                    (opt) => opt.label || opt.value
                  )
                );
              } else {
                setLocationOptions(options as string[]);
              }
            }
          }
        }
      } catch (error) {
        console.error("Error fetching expense:", error);
        toast.error("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [expenseId, router, slug, orgId]);

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

  const handleInputChange = (
    key: string,
    value: string | number | boolean | string[]
  ) => {
    setFormData((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
  
    try {
      // Get current user from Supabase
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error("User not authenticated. Please log in again.");
      }
  
      // Get username for history entries using improved extraction
      try {
        const authRaw = localStorage.getItem('auth-storage');
        const authStorage = JSON.parse(authRaw || '{}');
        
        // Try multiple paths and nested data
        let userName = "Unknown User";
        
        if (authStorage?.state?.user?.profile?.full_name) {
          userName = authStorage.state.user.profile.full_name;
        } else if (typeof authRaw === 'string' && authRaw.includes('full_name')) {
          // Fallback - try to extract from the raw string if JSON parsing doesn't get the nested structure
          const match = authRaw.match(/"full_name":\s*"([^"]+)"/);
          if (match && match[1]) {
            userName = match[1];
          }
        }
                
        // Check what fields have changed
        if (expense.expense_type !== formData.expense_type) {
          // Log expense type change
          await expenseHistory.addEntry(
            expenseId,
            session.user.id,
            userName,
            'updated',
            expense.expense_type,
            formData.expense_type
          );
        }
  
        if (expense.amount !== parseFloat(formData.amount)) {
          // Log amount change
          await expenseHistory.addEntry(
            expenseId,
            session.user.id,
            userName,
            'updated',
            expense.amount.toString(),
            formData.amount.toString()
          );
        }
  
        // Add custom fields
        Object.entries(formData).forEach(([key, value]) => {
          if (key !== "expense_type" && key !== "amount" && key !== "date") {
            // Log changes to custom fields if they're different
            if (expense.custom_fields[key] !== value) {
              expenseHistory.addEntry(
                expenseId,
                session.user.id,
                userName,
                'updated',
                expense.custom_fields[key]?.toString() || '',
                value?.toString() || ''
              ).catch(err => console.error("Error logging field update:", err));
            }
          }
        });
      } catch (error) {
        console.error('Error extracting username from localStorage:', error);
        // If username extraction fails, still update the expense without history entries
      }
  
      // Prepare expense data
      const updates: any = {
        expense_type: formData.expense_type,
        amount: parseFloat(formData.amount),
        date: formData.date,
        custom_fields: {},
      };
  
      // Add custom fields
      Object.entries(formData).forEach(([key, value]) => {
        if (key !== "expense_type" && key !== "amount" && key !== "date") {
          updates.custom_fields[key] = value;
        }
      });
  
      // Update expense with receipt if provided
      const { error } = await expenses.update(
        expenseId,
        updates,
        receiptFile || undefined
      );
  
      if (error) {
        throw error;
      }
  
      toast.success("Expense updated successfully");
      router.push(`/org/${slug}/expenses/${expenseId}`);
    } catch (error: any) {
      console.error("Error updating expense:", error);
      toast.error("Failed to update expense", {
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!expense) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => router.push(`/org/${slug}/expenses/${expenseId}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Expense
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
              Save Changes
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit Expense</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expense_type">Expense Type</Label>
                {expenseTypeOptions.length > 0 ? (
                  <Select
                    value={formData.expense_type || ""}
                    onValueChange={(value: string) =>
                      handleInputChange("expense_type", value)
                    }
                  >
                    <SelectTrigger id="expense_type" className="w-full">
                      <SelectValue placeholder="Select expense type" />
                    </SelectTrigger>
                    <SelectContent>
                      {expenseTypeOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="expense_type"
                    value={formData.expense_type || ""}
                    onChange={(e) =>
                      handleInputChange("expense_type", e.target.value)
                    }
                    required
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  value={formData.amount || ""}
                  onChange={(e) =>
                    handleInputChange("amount", parseFloat(e.target.value))
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date || ""}
                  onChange={(e) => handleInputChange("date", e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Custom fields */}
            {Object.entries(expense.custom_fields).map(([key, value]) => {
              // Check if this field is location_of_expense and has options
              const isLocationField = key === "location_of_expense" || key === "location";
              const hasLocationOptions = isLocationField && locationOptions.length > 0;

              return (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{key}</Label>
                  {hasLocationOptions ? (
                    <Select
                      value={formData[key] || ""}
                      onValueChange={(value: string) =>
                        handleInputChange(key, value)
                      }
                    >
                      <SelectTrigger id={key} className="w-full">
                        <SelectValue placeholder={`Select ${key}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {locationOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={key}
                      value={formData[key] || ""}
                      onChange={(e) => handleInputChange(key, e.target.value)}
                    />
                  )}
                </div>
              );
            })}

            {/* Receipt upload section - only show if no voucher exists */}
            {!hasVoucher && (
              <div className="space-y-2">
                <Label htmlFor="receipt">Receipt</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="receipt"
                    type="file"
                    onChange={handleFileChange}
                    accept="image/*,.pdf"
                  />
                  {receiptFile && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setReceiptFile(null);
                        setReceiptPreview(null);
                      }}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Clear
                    </Button>
                  )}
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
                {expense.receipt && !receiptPreview && (
                  <div className="mt-2">
                    <p className="text-sm text-muted-foreground">
                      Current receipt: {expense.receipt.filename}
                    </p>
                  </div>
                )}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Current Receipt Preview - only show if expense has receipt */}
      {expense.receipt && !receiptFile && !hasVoucher && (
        <ReceiptPreview expense={expense} defaultOpen={true} />
      )}

      {/* Voucher Preview - only show if expense has voucher */}
      {hasVoucher && (
        <VoucherPreview expense={expense} expenseId={expenseId} defaultOpen={true} />
      )}
    </div>
  );
}
