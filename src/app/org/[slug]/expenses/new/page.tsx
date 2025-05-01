"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import {
  orgSettings,
  expenses,
  ReceiptInfo,
  vouchers,
  Expense,
} from "@/lib/db";
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
import { defaultExpenseColumns } from "@/lib/defaults";
import { Switch } from "@/components/ui/switch";
import VoucherForm from "./VoucherForm";

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

  const [isMounted, setIsMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [columns, setColumns] = useState<Column[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    async function fetchData() {
      if (!orgId) return;

      try {
        const { data: settings, error: settingsError } =
          await orgSettings.getByOrgId(orgId);

        if (settingsError) {
          toast.error("Failed to load organization settings");
          return;
        }

        if (settings) {
          const columnsToUse =
            settings.expense_columns && settings.expense_columns.length > 0
              ? settings.expense_columns
              : defaultExpenseColumns;

          setColumns(columnsToUse);

          const initialData: Record<string, any> = {};
          columnsToUse.forEach((col: any) => {
            if (col.visible) {
              initialData[col.key] = "";
            }
          });

          initialData.date = new Date().toISOString().split("T")[0];
          setFormData(initialData);
        } else {
          setColumns(defaultExpenseColumns);
          const initialData: Record<string, any> = {};
          defaultExpenseColumns.forEach((col) => {
            if (col.visible) {
              initialData[col.key] = "";
            }
          });
          initialData.date = new Date().toISOString().split("T")[0];
          setFormData(initialData);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setReceiptFile(file);
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
      if (!user?.id || !organization) {
        throw new Error("Missing required data");
      }

      const baseExpenseData = {
        org_id: organization.id,
        user_id: user.id,
        status: "submitted" as const,
        receipt: null,
        amount: voucherModalOpen
          ? parseFloat(formData.voucherAmount || "0")
          : parseFloat(formData.amount || "0"),
        expense_type: (formData.expense_type as string) || "Other",
        date: new Date(formData.date).toISOString(),
        custom_fields: {},
      };

      if (voucherModalOpen) {
        const { data: expenseData, error: expenseError } =
          await expenses.create(baseExpenseData);

        if (expenseError || !expenseData) {
          toast.error("Failed to create expense");
          return;
        }

        const voucherData = {
          expense_id: expenseData.id,
          your_name: formData.yourName,
          amount: parseFloat(formData.voucherAmount || "0"),
          purpose: formData.purpose,
          credit_person: formData.voucherCreditPerson,
          signature_url: formData.signature_url,
          manager_signature_url: formData.manager_signature_url,
        };

        const { error: voucherError } = await vouchers.create(voucherData);

        if (voucherError) {
          toast.error("Failed to create voucher");
          return;
        }

        toast.success("Voucher submitted successfully");
      } else {
        const regularExpensePayload = {
          ...baseExpenseData,
          custom_fields: {} as Record<string, any>,
        };

        columns.forEach((col) => {
          if (
            col.visible &&
            col.key !== "expense_type" &&
            col.key !== "amount" &&
            col.key !== "date" &&
            col.key !== "approver_id"
          ) {
            regularExpensePayload.custom_fields[col.key] = formData[col.key];
          }
        });

        const { error } = await expenses.create(
          regularExpensePayload,
          receiptFile || undefined
        );

        if (error) {
          throw error;
        }

        toast.success("Expense created successfully");
      }

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

  if (loading || !isMounted) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto py-8">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => router.push(`/org/${slug}/expenses`)}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Expenses
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center gap-2 bg-primary text-white hover:bg-primary/90"
        >
          {saving ? (
            <>
              <Spinner className="h-4 w-4" />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save Expense
            </>
          )}
        </Button>
      </div>

      <Card className="shadow-lg">
        <CardHeader className="bg-gray-50/50">
          <CardTitle className="text-xl font-semibold">New Expense</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {columns.map((col) => {
              if (!col.visible || col.key === "receipt") return null;

              return (
                <div key={col.key} className="space-y-2">
                  <Label htmlFor={col.key} className="text-sm font-medium">
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
                      className="w-full"
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
                      className="w-full"
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
                      className="w-full"
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
                      className="w-full min-h-[100px]"
                    />
                  )}

                  {col.type === "dropdown" && col.options && (
                    <Select
                      value={formData[col.key] || ""}
                      onValueChange={(value) =>
                        handleInputChange(col.key, value)
                      }
                    >
                      <SelectTrigger id={col.key} className="w-full">
                        <SelectValue placeholder="Select an option" />
                      </SelectTrigger>
                      <SelectContent>
                        {col.options.map((option) => {
                          const value =
                            typeof option === "string" ? option : option.value;
                          const label =
                            typeof option === "string" ? option : option.label;
                          return (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              );
            })}

            <div className="space-y-4">
              <div className="p-4 bg-white rounded-lg border">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-500">
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M20 6C20 4.89543 19.1046 4 18 4H6C4.89543 4 4 4.89543 4 6V18C4 19.1046 4.89543 20 6 20H18C19.1046 20 20 19.1046 20 18V6Z"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M8 12H16"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M8 8H16"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M8 16H12"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <Label
                      htmlFor="voucher-switch"
                      className="text-base font-medium"
                    >
                      No receipt? Create a voucher instead
                    </Label>
                  </div>
                  <Switch
                    checked={voucherModalOpen}
                    onCheckedChange={setVoucherModalOpen}
                    id="voucher-switch"
                  />
                </div>

                {!voucherModalOpen && (
                  <div>
                    <Label
                      htmlFor="receipt"
                      className="text-sm font-medium text-gray-700"
                    >
                      Receipt <span className="text-red-500 ml-0.5">*</span>
                    </Label>
                    <div className="mt-1">
                      <Input
                        id="receipt"
                        type="file"
                        onChange={handleFileChange}
                        accept="image/*,.pdf"
                        className="w-[500px] cursor-pointer border-gray-300 rounded-md shadow-sm text-gray-600"
                      />
                      <div className="text-sm text-gray-500 mt-1">
                        {receiptFile ? receiptFile.name : "No file chosen"}
                      </div>
                    </div>
                    {receiptPreview && (
                      <div className="mt-2">
                        {receiptPreview.startsWith("data:image") ? (
                          <img
                            src={receiptPreview}
                            alt="Receipt preview"
                            className="max-h-40 rounded-md border"
                          />
                        ) : (
                          <div className="p-4 bg-gray-50 rounded-md border">
                            <p className="text-sm text-gray-600">
                              PDF receipt selected
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {voucherModalOpen && (
                <VoucherForm
                  formData={formData}
                  onInputChange={handleInputChange}
                  userRole={userRole}
                />
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
