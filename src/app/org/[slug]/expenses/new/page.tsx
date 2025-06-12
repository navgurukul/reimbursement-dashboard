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
  profiles,
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
import { organizations, expenseHistory } from "@/lib/db";
import { defaultExpenseColumns } from "@/lib/defaults";
import { Switch } from "@/components/ui/switch";
import VoucherForm from "./VoucherForm";
import SignaturePad from "@/components/SignatureCanvas";
import supabase from "@/lib/supabase";
import {
  getUserSignatureUrl,
  saveUserSignature,
  uploadSignature,
} from "@/lib/utils";

interface Column {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  visible?: boolean;
  options?: Array<string | { value: string; label: string }>;
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
  signature_url?: string;
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

  // Separate signature states for expense and voucher
  const [expenseSignature, setExpenseSignature] = useState<string | undefined>(
    undefined
  );
  const [voucherSignature, setVoucherSignature] = useState<string | undefined>(
    undefined
  );

  const [savedUserSignature, setSavedUserSignature] = useState<string | null>(
    null
  );
  const [loadingSignature, setLoadingSignature] = useState(true);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Load the user's saved signature if it exists
  useEffect(() => {
    // Fetch user's saved signature if it exists
    async function fetchUserSignature() {
      if (!user?.id) return;

      try {
        setLoadingSignature(true);

        const { url, error } = await getUserSignatureUrl(user.id);

        if (error) {
          console.error("Error fetching signature:", error);
          return;
        }

        if (url) {
          setSavedUserSignature(url);

          // If no current expense signature is set, use the saved one
          if (!formData.expense_signature_data_url) {
            setExpenseSignature(url);
            setFormData((prev) => ({
              ...prev,
              expense_signature_data_url: url,
              expense_signature_preview: url,
            }));
          }
        } else {
        }
      } catch (error) {
        console.error("Error in fetchUserSignature:", error);
      } finally {
        setLoadingSignature(false);
      }
    }

    fetchUserSignature();
  }, [user?.id]);

  // Fetch available expense events
  useEffect(() => {
    if (!orgId || !user) return;

    const fetchEvents = async () => {
      try {
        // Use the new function that considers user role when fetching events
        const { data, error } = await expenseEvents.getAvailableEvents(
          orgId,
          user.id,
          userRole || "member" // Default to member if userRole is undefined
        );

        if (error) throw error;

        // Filter to only show "submitted" status events for regular members
        // Admins/owners will see events with both "draft" and "submitted" status
        const availableEvents = (data || []).filter((event) => {
          if (userRole === "admin" || userRole === "owner") {
            // Admins and owners can see events with any status
            return true;
          } else {
            // Regular members can see:
            // - Their own events with any status
            // - Events created by others only if they have "submitted" status
            return event.user_id === user.id || event.status === "submitted";
          }
        });

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
  }, [orgId, user, eventIdFromQuery, userRole]);

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

        // Fetch organization members
        const { data: membersData } = await organizations.getOrganizationMembers(orgId);

        let approverOptions: Array<{ value: string; label: string }> = [];

        if (membersData) {
          // Filter to get only approvers (owners, admins, managers)
          const approvers = membersData.filter((member) =>
            ["owner", "admin", "manager"].includes(member.role)
          );

          // Fetch profiles for approvers
          const { data: profilesData } = await profiles.getByIds(
            approvers.map((approver) => approver.user_id)
          );

          // Create a map of user_id to full_name or email
          const approverNames = new Map(
            profilesData?.map((profile) => [
              profile.user_id,
              profile.full_name || profile.email,
            ]) || []
          );

          // Create approver options
          approverOptions = approvers.map((approver) => ({
            value: approver.user_id,
            label: approverNames.get(approver.user_id) || approver.user_id,
          }));
        }

        if (settings) {
          const columnsToUse =
            settings.expense_columns && settings.expense_columns.length > 0
              ? settings.expense_columns
              : defaultExpenseColumns;

          // Process the columns to filter out self-approval and add approver options
          const processedColumns = columnsToUse.map((col: Column) => {
            if (col.key === "approver") {
              return {
                ...col,
                options: approverOptions.filter(option => option.value !== user?.id),
              };
            }
            return col;
          });

          setColumns(processedColumns);

          const initialData: Record<string, any> = {};
          processedColumns.forEach((col: any) => {
            if (col.visible) {
              initialData[col.key] = "";
            }
          });

          initialData.date = new Date().toISOString().split("T")[0];
          initialData.event_id = eventIdFromQuery || "";
          setFormData((prev) => ({ ...initialData, ...prev }));
        } else {
          // Process default columns with approver options
          const processedDefaultColumns = defaultExpenseColumns.map((col) => {
            if (col.key === "approver") {
              return {
                ...col,
                options: approverOptions.filter(option => option.value !== user?.id),
              };
            }
            return col;
          });

          setColumns(processedDefaultColumns);

          const initialData: Record<string, any> = {};
          processedDefaultColumns.forEach((col) => {
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
  }, [orgId, eventIdFromQuery, user]);

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
    // Prevent selecting self as approver
    if (key === "approver" && value === user?.id) {
      toast.error("You cannot approve your own expenses");
      return;
    }

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

  // Handle expense signature save - separate from voucher signature
  const handleExpenseSignatureSave = async (dataUrl: string) => {
    // Update local state
    setExpenseSignature(dataUrl);
    setFormData((prev) => ({
      ...prev,
      expense_signature_data_url: dataUrl,
      expense_signature_preview: dataUrl,
    }));

    // Only save to profile if this is a new signature (not the saved one)
    if (dataUrl !== savedUserSignature && user?.id && organization?.id) {
      try {
        // Use the comprehensive function that handles both upload and profile update
        const { success, path, error } = await saveUserSignature(
          dataUrl,
          user.id,
          organization.id
        );

        if (error || !success) {
          console.error("Error saving signature:", error);
          toast.error("Could not save your signature for future use");
          return;
        }

        toast.success("Your signature has been saved for future use");

        // Refresh the saved signature URL
        const { url } = await getUserSignatureUrl(user.id);
        if (url) {
          setSavedUserSignature(url);
        }
      } catch (error) {
        console.error("Unexpected error saving signature:", error);
        toast.error("An error occurred while saving your signature");
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (!user?.id || !organization) {
        throw new Error("Missing required data");
        // No need for 'return' after throw as it's unreachable
      }

      // Validate that user is not approving their own expense
      if (formData.approver === user.id) {
        toast.error("You cannot approve your own expenses");
        setSaving(false);
        return;
      }

      // Validate signatures based on form type
      // FIXED: Moved this validation block up to ensure proper code structure
      if (!voucherModalOpen) {
        if (!formData.expense_signature_data_url) {
          toast.error("Please add your signature before submitting");
          setSaving(false);
          return;
        }
      } else {
        if (!formData.voucher_signature_data_url) {
          toast.error(
            "Please add your signature before submitting the voucher"
          );
          setSaving(false);
          return;
        }
      }

      // Get the user's saved signature path from their profile if needed
      let profileSignaturePath: string | null = null;
      if (
        (savedUserSignature === formData.expense_signature_data_url &&
          !voucherModalOpen) ||
        (savedUserSignature === formData.voucher_signature_data_url &&
          voucherModalOpen)
      ) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("signature_url")
          .eq("user_id", user.id)
          .single();

        if (profile?.signature_url) {
          profileSignaturePath = profile.signature_url;
        }
      }

      // Process signatures - use separate variables for expense and voucher
      let expense_signature_url: string | null = null;
      let voucher_signature_url: string | null = null;
      let manager_signature_url: string | null = null;

      // First handle voucher signature (even if we're in expense mode, we'll need it for reference)
      if (voucherModalOpen && formData.voucher_signature_data_url) {
        if (
          formData.voucher_signature_data_url === savedUserSignature &&
          profileSignaturePath
        ) {
          // Use the saved signature path directly
          voucher_signature_url = profileSignaturePath;
        } else if (
          formData.voucher_signature_data_url.startsWith("data:image/")
        ) {
          // Upload a new signature
          const { path, error } = await uploadSignature(
            formData.voucher_signature_data_url,
            user.id,
            organization.id,
            "user"
          );

          if (error) {
            toast.error(`Failed to upload your signature: ${error.message}`);
            setSaving(false);
            return;
          } else {
            voucher_signature_url = path;
          }
        } else {
          // Invalid signature format
          toast.error(
            "Invalid signature format. Please redraw your signature."
          );
          setSaving(false);
          return;
        }
      }

      // Handle expense signature
      if (!voucherModalOpen && formData.expense_signature_data_url) {
        // For expense form
        if (
          formData.expense_signature_data_url === savedUserSignature &&
          profileSignaturePath
        ) {
          // Use the saved signature path directly
          expense_signature_url = profileSignaturePath;
        } else if (
          formData.expense_signature_data_url.startsWith("data:image/")
        ) {
          // Upload a new signature
          const { path, error } = await uploadSignature(
            formData.expense_signature_data_url,
            user.id,
            organization.id,
            "user"
          );

          if (error) {
            toast.error(`Failed to upload your signature: ${error.message}`);
            setSaving(false);
            return;
          } else {
            expense_signature_url = path;
          }
        } else {
          // Invalid signature format
          toast.error(
            "Invalid signature format. Please redraw your signature."
          );
          setSaving(false);
          return;
        }
      }

      // Proceed with approver signature if this is a voucher and it exists
      if (voucherModalOpen && formData.manager_signature_data_url) {
        if (formData.manager_signature_data_url.startsWith("data:image/")) {
          const { path, error } = await uploadSignature(
            formData.manager_signature_data_url,
            user.id,
            organization.id,
            "approver"
          );

          if (error) {
            toast.error(
              `Failed to upload approver signature: ${error.message}`
            );
          } else {
            manager_signature_url = path;
          }
        } else {
          toast.error("Invalid manager signature format.");
        }
      }

      // Extract approver_id directly from formData
      const approver_id = formData.approver || null;

      // IMPORTANT CHANGE: For voucher mode, use the voucher signature URL for the expense
      const signature_url_to_use = voucherModalOpen
        ? voucher_signature_url // Use voucher signature in voucher mode
        : expense_signature_url; // Use expense signature in regular mode

      const custom_fields: Record<string, any> = {};

      // Process custom fields regardless of expense type
      columns.forEach((col) => {
        if (
          col.visible &&
          col.key !== "expense_type" &&
          col.key !== "amount" &&
          col.key !== "date" &&
          col.key !== "approver" && // Skip adding approver to custom fields
          col.key !== "event_id"
        ) {
          custom_fields[col.key] = formData[col.key];
        }
      });

      // For voucher mode, make sure description is captured in custom fields
      if (voucherModalOpen) {
        custom_fields["description"] = formData.purpose || "Cash Voucher";
      }

      // Create the base expense data structure - make it consistent for both paths
      const baseExpenseData = {
        org_id: organization.id,
        user_id: user.id,
        amount: voucherModalOpen
          ? parseFloat(formData.voucherAmount || "0")
          : parseFloat(formData.amount || "0"),
        expense_type: (formData.expense_type as string) || "Other",
        date: new Date(formData.date).toISOString(),
        custom_fields: custom_fields,
        event_id: formData.event_id || null,
        approver_id, // Include approver_id directly
        signature_url: signature_url_to_use || undefined,
        receipt: null, // Add the required receipt property
      };

      if (voucherModalOpen) {
        const { data: expenseData, error: expenseError } =
          await expenses.create(baseExpenseData, undefined);

        if (expenseError || !expenseData) {
          console.error("Expense creation error:", expenseError);
          toast.error("Failed to create expense");
          setSaving(false);
          return;
        }

        // Add history entry for expense creation with improved username extraction
        try {
          const authRaw = localStorage.getItem("auth-storage");

          const authStorage = JSON.parse(authRaw || "{}");

          // Try multiple paths and nested data
          let userName = "Unknown User";

          if (authStorage?.state?.user?.profile?.full_name) {
            userName = authStorage.state.user.profile.full_name;
          } else if (
            typeof authRaw === "string" &&
            authRaw.includes("full_name")
          ) {
            // Fallback - try to extract from the raw string if JSON parsing doesn't get the nested structure
            const match = authRaw.match(/"full_name":\s*"([^"]+)"/);
            if (match && match[1]) {
              userName = match[1];
            }
          }

          console.log("Final username to be used:", userName);

          await expenseHistory.addEntry(
            expenseData.id,
            user.id,
            userName,
            "created",
            null,
            expenseData.amount.toString()
          );
        } catch (logError) {
          console.error("Error logging expense creation:", logError);
          // Fallback
          await expenseHistory.addEntry(
            expenseData.id,
            user.id,
            "Unknown User",
            "created",
            null,
            expenseData.amount.toString()
          );
        }

        console.log("Expense created successfully, now creating voucher...");
        console.log("Signature URLs being sent to backend:", {
          signature_url: voucher_signature_url, // FIXED: Use voucher_signature_url instead of signature_url
          manager_signature_url,
        });

        // Create voucher with direct Supabase insert to avoid type issues
        const voucherData = {
          expense_id: expenseData.id, // Reference the expense we just created
          your_name: formData.yourName || null,
          amount: parseFloat(formData.voucherAmount || "0"),
          purpose: formData.purpose || null, // Description for the voucher
          credit_person: formData.voucherCreditPerson || null,
          signature_url: voucher_signature_url, // Use voucher signature
          manager_signature_url: manager_signature_url,
          created_by: user.id,
          org_id: organization.id,
          approver_id, // Include approver_id
        };

        const { data: voucherResponse, error: voucherError } = await supabase
          .from("vouchers")
          .insert([voucherData])
          .select()
          .single();

        if (voucherError) {
          console.error("Voucher creation error:", voucherError);
          toast.error(`Failed to create voucher: ${voucherError.message}`);

          // Attempt to delete the expense if voucher creation fails
          try {
            await supabase.from("expenses").delete().eq("id", expenseData.id);
          } catch (cleanupError) {
            console.error("Failed to clean up expense:", cleanupError);
          }

          setSaving(false);
          return;
        }

        toast.success("Voucher submitted successfully");
      } else {
        // For regular expenses, just create it directly
        // FIXED: Added data to the destructuring to capture the return value
        const { data, error } = await expenses.create(
          baseExpenseData,
          receiptFile || undefined
        );

        if (error) {
          console.error("Error creating regular expense:", error);
          toast.error(`Failed to create expense: ${error.message}`);
          setSaving(false);
          return;
        }

        // Add history entry for regular expense creation with improved username extraction
        try {
          const authRaw = localStorage.getItem("auth-storage");
          console.log("Auth raw:", authRaw);
          const authStorage = JSON.parse(authRaw || "{}");

          // Try multiple paths and nested data
          let userName = "Unknown User";

          if (authStorage?.state?.user?.profile?.full_name) {
            userName = authStorage.state.user.profile.full_name;
          } else if (
            typeof authRaw === "string" &&
            authRaw.includes("full_name")
          ) {
            const match = authRaw.match(/"full_name":\s*"([^"]+)"/);
            if (match && match[1]) {
              userName = match[1];
            }
          }

          if (data && data.id) {
            await expenseHistory.addEntry(
              data.id,
              user.id,
              userName,
              "created",
              null,
              data.amount.toString()
            );
          }
        } catch (logError) {
          console.error("Error logging expense creation:", logError);
          // Fallback
          if (data && data.id) {
            await expenseHistory.addEntry(
              data.id,
              user.id,
              "Unknown User",
              "created",
              null,
              data.amount.toString()
            );
          }
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
                  d="M8 7H16M8 12H16M8 17H12M19 3H5C3.89543 3 3 3.89543 3 5V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V5C21 3.89543 20.1046 3 19 3Z"
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

                            // Skip rendering option if this is the approver dropdown and the option is the current user
                            if (col.key === "approver" && value === user?.id) {
                              return null;
                            }

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

            {/* Expense Signature Section - Only shown when voucher is not open */}
            {!voucherModalOpen && (
              <div className="p-4 bg-gray-50/50 rounded-lg border space-y-4">
                <div className="flex items-center space-x-3">
                  <svg
                    className="h-5 w-5 text-gray-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M15 12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12C9 10.3431 10.3431 9 12 9C13.6569 9 15 10.3431 15 12Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12.5 18H5C3.89543 18 3 17.1046 3 16V8C3 6.89543 3.89543 6 5 6H19C20.1046 6 21 6.89543 21 8V13"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M16 20L19 17M19 17L22 20M19 17V15"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <Label className="text-sm font-medium text-gray-900">
                    Your Signature <span className="text-red-500">*</span>
                  </Label>
                </div>

                {loadingSignature ? (
                  <div className="flex items-center justify-center h-32 bg-gray-50 border rounded-lg">
                    <p className="text-sm text-gray-500">
                      Loading your signature...
                    </p>
                  </div>
                ) : (
                  <SignaturePad
                    onSave={handleExpenseSignatureSave}
                    label="Your Signature"
                    signatureUrl={formData.expense_signature_preview}
                    userSignatureUrl={savedUserSignature || undefined}
                  />
                )}

                {savedUserSignature &&
                  formData.expense_signature_preview !== savedUserSignature && (
                    <p className="text-xs text-blue-600">
                      * You're using a new signature. This will replace your
                      saved signature when you submit.
                    </p>
                  )}
              </div>
            )}

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
                  savedUserSignature={savedUserSignature}
                />
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
