"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import {
  orgSettings,
  expenses,
  ReceiptInfo,
  vouchers,
  ExpenseEvent,
  expenseEvents,
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
import { ArrowLeft, CalendarIcon, Save, Upload } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useAuthStore } from "@/store/useAuthStore";
import { organizations } from "@/lib/db";
import { defaultExpenseColumns } from "@/lib/defaults";
import { Switch } from "@/components/ui/switch";
import VoucherForm from "./VoucherForm";
import supabase from "@/lib/supabase";
import { uploadSignature } from "@/lib/utils"
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
  event_id?: string | null;
}

export default function NewExpensePage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const eventIdFromQuery = searchParams.get("eventId");

  const { organization, userRole } = useOrgStore();
  const { user } = useAuthStore();
  const orgId = organization?.id!;
  const slug = params.slug as string;

  const [isMounted, setIsMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [columns, setColumns] = useState<Column[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({
    event_id: eventIdFromQuery || "",
  });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const [events, setEvents] = useState<ExpenseEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<ExpenseEvent | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fetch available expense events
  useEffect(() => {
    if (!orgId || !user) return;

    const fetchEvents = async () => {
      try {
        const { data, error } = await expenseEvents.getByOrgAndUser(
          orgId,
          user.id
        );

        if (error) throw error;

        // Only show draft or submitted events
        const availableEvents = (data || []).filter((event) =>
          ["draft", "submitted"].includes(event.status)
        );

        setEvents(availableEvents);

        // If we have an eventId from the URL and it exists in available events, select it
        if (eventIdFromQuery) {
          const event = availableEvents.find(
            (event) => event.id === eventIdFromQuery
          );
          if (event) {
            setSelectedEvent(event);
            handleInputChange("event_id", eventIdFromQuery);
          }
        }
      } catch (error: any) {
        console.error("Failed to load events:", error);
      }
    };

    fetchEvents();
  }, [orgId, user, eventIdFromQuery]);

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
          initialData.event_id = eventIdFromQuery || "";
          setFormData((prev) => ({ ...initialData, ...prev }));
        } else {
          setColumns(defaultExpenseColumns);
          const initialData: Record<string, any> = {};
          defaultExpenseColumns.forEach((col) => {
            if (col.visible) {
              initialData[col.key] = "";
            }
          });
          initialData.date = new Date().toISOString().split("T")[0];
          initialData.event_id = eventIdFromQuery || "";
          setFormData((prev) => ({ ...initialData, ...prev }));
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [orgId, eventIdFromQuery]);

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

    // If changing the event, update the selected event
    if (key === "event_id" && value) {
      const event = events.find((e) => e.id === value);
      setSelectedEvent(event || null);
    }
  };

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setSaving(true);

  try {
    if (!user?.id || !organization) {
      throw new Error("Missing required data");
    }

    // Process signatures if this is a voucher
    let signature_url: string | null = null;
    let manager_signature_url: string | null = null;

    if (voucherModalOpen) {
      console.log("Processing voucher with signatures...");

      // Upload the user signature if exists
      if (formData.signature_data_url) {
        const { path, error } = await uploadSignature(
          formData.signature_data_url,
          user.id,
          organization.id,
          "user"
        );

        if (error) {
          toast.error(`Failed to upload your signature: ${error.message}`);
        } else {
          signature_url = path;
        }
      }

      // Upload the approver signature if exists
      if (formData.manager_signature_data_url) {
        const { path, error } = await uploadSignature(
          formData.manager_signature_data_url,
          user.id,
          organization.id,
          "approver"
        );

        if (error) {
          toast.error(`Failed to upload approver signature: ${error.message}`);
        } else {
          manager_signature_url = path;
        }
      }
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
      event_id: formData.event_id || null,
    };

    if (voucherModalOpen) {
      console.log("Creating expense for voucher...");
      const { data: expenseData, error: expenseError } = await expenses.create(
        baseExpenseData
      );

      if (expenseError || !expenseData) {
        console.error("Expense creation error:", expenseError);
        toast.error("Failed to create expense");
        return;
      }

      console.log("Expense created successfully, now creating voucher...");
      console.log("Signature URLs being sent to backend:", {
        signature_url,
        manager_signature_url,
      });

      // Create voucher with direct Supabase insert to avoid type issues
    const { data: voucherResponse, error: voucherError } = await supabase
      .from("vouchers")
      .insert([
        {
          expense_id: expenseData.id,
          your_name: formData.yourName || null,
          amount: parseFloat(formData.voucherAmount || "0"),
          purpose: formData.purpose || null,
          credit_person: formData.voucherCreditPerson || null,
          signature_url: signature_url,
          manager_signature_url: manager_signature_url,
          created_by: user.id,
          org_id: organization.id, // Add this explicitly
        },
      ])
      .select()
      .single();

      if (voucherError) {
        console.error("Voucher creation error:", voucherError);
        toast.error(`Failed to create voucher: ${voucherError.message}`);
        return;
      }

      console.log("Voucher created successfully:", voucherResponse);
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
          col.key !== "approver_id" &&
          col.key !== "event_id"
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

    // If expense was added from an event's page, redirect back to that event
    if (eventIdFromQuery) {
      router.push(`/org/${slug}/expense-events/${eventIdFromQuery}`);
    } else {
      router.push(`/org/${slug}/expenses`);
    }
  } catch (error: any) {
    console.error("Error in submit handler:", error);
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
    <div className="max-w-[800px] mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <Button
          variant="ghost"
          onClick={() => {
            if (eventIdFromQuery) {
              router.push(`/org/${slug}/expense-events/${eventIdFromQuery}`);
            } else {
              router.push(`/org/${slug}/expenses`);
            }
          }}
          className="text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {eventIdFromQuery ? "Back to Event" : "Back to Expenses"}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={saving}
          className="bg-black text-white hover:bg-black/90"
        >
          {saving ? (
            <>
              <Spinner className="mr-2 h-4 w-4" />
              Saving...
            </>
          ) : (
            <>
              <svg
                className="mr-2 h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M17 17H19V7H5V17H7M7 21H17V13H7V21Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Save Expense
            </>
          )}
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="border-b">
          <CardTitle className="text-lg font-medium">New Expense</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Event Selection */}
            <div className="p-4 bg-blue-50/50 rounded-lg border border-blue-100 mb-6">
              <div className="flex items-center space-x-3 mb-2">
                <CalendarIcon className="h-5 w-5 text-blue-500" />
                <Label
                  htmlFor="event_id"
                  className="text-sm font-medium text-gray-900"
                >
                  Expense Event
                </Label>
              </div>
              <Select
                value={formData.event_id || "none"}
                onValueChange={(value) =>
                  handleInputChange("event_id", value === "none" ? "" : value)
                }
              >
                <SelectTrigger id="event_id" className="w-full">
                  <SelectValue placeholder="Select an event (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No event</SelectItem>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.title} (
                      {new Date(event.start_date).toLocaleDateString()} -{" "}
                      {new Date(event.end_date).toLocaleDateString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-2">
                {selectedEvent ? (
                  <span>
                    This expense will be added to the event:{" "}
                    <strong>{selectedEvent.title}</strong>
                  </span>
                ) : (
                  "Group your expense under an event for better organization"
                )}
              </p>
            </div>

            {columns.map((col) => {
              if (!col.visible || col.key === "receipt") return null;

              return (
                <div key={col.key} className="space-y-2">
                  <Label
                    htmlFor={col.key}
                    className="text-sm font-medium text-gray-700"
                  >
                    {col.label}
                    {col.required && (
                      <span className="text-red-500 ml-1 text-sm">*</span>
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
                      onValueChange={(value: string) =>
                        handleInputChange(col.key, value)
                      }
                    >
                      <SelectTrigger id={col.key} className="w-full">
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
                </div>
              );
            })}

            <div className="space-y-4">
              <div className="p-4 bg-gray-50/50 rounded-lg border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <svg
                      className="h-5 w-5 text-gray-400"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M8 7H16M8 12H16M8 17H12M19 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <Label
                      htmlFor="voucher-switch"
                      className="text-sm font-medium text-gray-900"
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
                  <div className="mt-4">
                    <Label
                      htmlFor="receipt"
                      className="text-sm font-medium text-gray-700"
                    >
                      Receipt <span className="text-red-500 ml-0.5">*</span>
                    </Label>
                    <div className="mt-2">
                      <Input
                        id="receipt"
                        type="file"
                        onChange={handleFileChange}
                        accept="image/*,.pdf"
                        className="w-full cursor-pointer border-gray-200"
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
                          <div className="p-3 bg-gray-50 rounded-md border">
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

