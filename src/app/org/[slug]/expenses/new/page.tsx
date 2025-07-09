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

interface ExpenseItemData {
  expense_type: string
  amount: number
  date: string
  description: string
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

  const [errors, setErrors] = useState<Record<string, string>>({});

  const [columns, setColumns] = useState<Column[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({
    event_id: eventIdFromQuery || "",
  });

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptFiles, setReceiptFiles] = useState<Record<number, File | null>>({});
  const [receiptPreviews, setReceiptPreviews] = useState<Record<number, string | null>>({});

  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const [voucherModalOpenMap, setVoucherModalOpenMap] = useState<Record<number, boolean>>({});

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

  const [expenseItems, setExpenseItems] = useState<number[]>([]);
  // Separate state for expense items data
  const [expenseItemsData, setExpenseItemsData] = useState<Record<number, ExpenseItemData>>({})

  // const addItem = () => {
  //   setExpenseItems((prev) => [...prev, prev.length + 1]);
  // };

  const addItem = () => {
    const newId = Date.now() // Simple ID generation
    setExpenseItems((prev) => [...prev, newId])
    // Initialize empty data for new item
    setExpenseItemsData((prev) => ({
      ...prev,
      [newId]: {
        expense_type: "",
        amount: 0,
        date: new Date().toISOString(),
        description: "",
      },
    }))
  }

  // const deleteItem = (id: number) => {
  //   setExpenseItems((prev) => prev.filter((item) => item !== id));
  // };

  const deleteItem = (id: number) => {
    setExpenseItems((prev) => prev.filter((item) => item !== id))
    setExpenseItemsData((prev) => {
      const newData = { ...prev }
      delete newData[id]
      return newData
    })
    // Clean up voucher modal state
    setVoucherModalOpenMap((prev) => {
      const newMap = { ...prev }
      delete newMap[id]
      return newMap
    })
    // Clean up receipt files
    setReceiptFiles((prev) => {
      const newFiles = { ...prev }
      delete newFiles[id]
      return newFiles
    })
    setReceiptPreviews((prev) => {
      const newPreviews = { ...prev }
      delete newPreviews[id]
      return newPreviews
    })
  }

  // Handler for expense items - separate from main form
  const handleExpenseItemChange = (itemId: number, key: keyof ExpenseItemData, value: string | number) => {
    setExpenseItemsData((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [key]: value,
      },
    }))
  }

  // Get expense item value
  const getExpenseItemValue = (itemId: number, key: keyof ExpenseItemData): string | number => {
    // return expenseItemsData[itemId]?.[key] || (key === 'amount' || key === 'date' ? 0 : "")

    const value = expenseItemsData[itemId]?.[key];
    if (
      value === undefined ||
      value === null ||
      (key === "amount" && (value === 0 || isNaN(Number(value))))
    ) {
      return "";
    }
    return value;
  }

  // Add these utility functions for error handling and UX improvements
  const scrollToFirstError = (errors: Record<string, string>) => {
    const firstErrorField = Object.keys(errors)[0];
    if (firstErrorField) {
      // Try to find the element by ID first, then by name attribute
      const element =
        document.getElementById(firstErrorField) ||
        document.querySelector(`[name="${firstErrorField}"]`) ||
        document.querySelector(`input[id="${firstErrorField}"]`) ||
        document.querySelector(`select[id="${firstErrorField}"]`) ||
        document.querySelector(`textarea[id="${firstErrorField}"]`);

      if (element) {
        // Scroll to the element with some offset for better visibility
        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });

        // Focus the element after a small delay to ensure scroll is complete
        setTimeout(() => {
          (element as HTMLElement).focus();
        }, 300);
      }
    }
  };

  const showErrorSummary = (errors: Record<string, string>) => {
    toast.error("Please fill in the required fields", {
      duration: 4000,
    });
  };

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
        const { data: membersData } =
          await organizations.getOrganizationMembers(orgId);

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
                options: approverOptions.filter(
                  (option) => option.value !== user?.id
                ),
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
                options: approverOptions.filter(
                  (option) => option.value !== user?.id
                ),
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

  // Handle single receipt files
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Clear receipt error if file is selected
    setErrors((prevErrors) => {
      const updatedErrors = { ...prevErrors };
      delete updatedErrors["receipt"];
      return updatedErrors;
    });

    setReceiptFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setReceiptPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Handle multiple receipt files
  const handleFileChanges = (e: React.ChangeEvent<HTMLInputElement>, index: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrors((prevErrors) => {
      const updatedErrors = { ...prevErrors };
      delete updatedErrors[`receipt-${index}`];
      return updatedErrors;
    });

    const reader = new FileReader();
    reader.onloadend = () => {
      setReceiptFiles((prev) => ({ ...prev, [index]: file }));
      setReceiptPreviews((prev) => ({ ...prev, [index]: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const toggleVoucherModal = (index: number) => {
    setVoucherModalOpenMap((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleInputChange = (
    key: string,
    value: string | number | boolean | string[]
  ) => {
    // Clear error if value is now filled
    if (errors[key] && value !== "") {
      setErrors((prevErrors) => {
        const updatedErrors = { ...prevErrors };
        delete updatedErrors[key];
        return updatedErrors;
      });
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

    const newErrors: Record<string, string> = {};

    if (voucherModalOpenMap[0]) {
      if (!formData.yourName) newErrors["yourName"] = "Your Name is required";
      if (!formData.voucherAmount)
        newErrors["voucherAmount"] = "Amount is required";
      if (!formData.purpose) newErrors["purpose"] = "Purpose is required";
      if (!formData.voucherCreditPerson)
        newErrors["voucherCreditPerson"] = "Credit Person is required";
      if (!formData.voucher_signature_data_url)
        newErrors["voucher_signature_data_url"] = "Signature is required";
    }
    // Loop through all required and visible fields
    for (const col of columns) {
      if (col.required && col.visible && !formData[col.key]) {
        newErrors[col.key] = `${col.label} is required`;
      }
    }

    // Receipt required if not in voucher mode
    if (!voucherModalOpenMap[0] && !receiptFiles) {
      newErrors["receipt"] = "Receipt is required";
    }

    // If any error found, show them and stop
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);

      // Show error summary
      showErrorSummary(newErrors);

      // Scroll to first error after a small delay to ensure state is updated
      setTimeout(() => {
        scrollToFirstError(newErrors);
      }, 100);

      setSaving(false);
      return;
    }
    // Clear previous errors if no issues
    setErrors({});
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
      if (!voucherModalOpenMap[0]) {
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
          !voucherModalOpenMap[0]) ||
        (savedUserSignature === formData.voucher_signature_data_url &&
          voucherModalOpenMap[0])
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
      if (voucherModalOpenMap[0] && formData.voucher_signature_data_url) {
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
      if (!voucherModalOpenMap[0] && formData.expense_signature_data_url) {
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
      if (voucherModalOpenMap[0] && formData.manager_signature_data_url) {
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
      const signature_url_to_use = voucherModalOpenMap[0]
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
      if (voucherModalOpenMap[0]) {
        custom_fields["description"] = formData.purpose || "Cash Voucher";
      }

      // Create the base expense data structure - make it consistent for both paths
      const baseExpenseData = {
        org_id: organization.id,
        user_id: user.id,
        amount: voucherModalOpenMap[0]
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

      if (voucherModalOpenMap[0]) {
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
        // ✅ First: save the main/base expense form (the one at the top)
        const { data: baseData, error: baseError } = await expenses.create(
          baseExpenseData,
          receiptFiles[0] || undefined
        );

        if (baseError) {
          console.error("Error creating base expense:", baseError);
          toast.error(`Failed to create base expense: ${baseError.message}`);
          setSaving(false);
          return;
        }

        // 📝 Log history for main/base expense
        try {
          const authRaw = localStorage.getItem("auth-storage");
          const authStorage = JSON.parse(authRaw || "{}");

          let userName = "Unknown User";
          if (authStorage?.state?.user?.profile?.full_name) {
            userName = authStorage.state.user.profile.full_name;
          } else if (typeof authRaw === "string" && authRaw.includes("full_name")) {
            const match = authRaw.match(/"full_name":\s*"([^"]+)"/);
            if (match && match[1]) {
              userName = match[1];
            }
          }

          await expenseHistory.addEntry(
            baseData.id,
            user.id,
            userName,
            "created",
            null,
            baseData.amount.toString()
          );
        } catch (logError) {
          console.error("Error logging base expense creation:", logError);
          await expenseHistory.addEntry(
            baseData.id,
            user.id,
            "Unknown User",
            "created",
            null,
            baseData.amount.toString()
          );
        }

        // ✅ Then: loop through additional expense items (if any)
        if (expenseItems.length > 0) {
          for (const itemId of expenseItems) {
            const item = expenseItemsData[itemId];

            const individualExpenseData = {
              org_id: organization.id,
              user_id: user.id,
              amount: item.amount,
              expense_type: item.expense_type || "Other",
              date: new Date(item.date).toISOString(),
              custom_fields: {
                description: item.description || "",
              },
              event_id: formData.event_id || null,
              approver_id: formData.approver || null,
              signature_url: expense_signature_url || undefined,
              receipt: null,
            };

            const { data, error } = await expenses.create(
              individualExpenseData,
              receiptFiles[itemId] || undefined
            );

            if (error) {
              toast.error(`Failed to create expense item: ${error.message}`);
              console.error("Error creating item:", error);
              continue;
            }

            await expenseHistory.addEntry(
              data.id,
              user.id,
              "Unknown User",
              "created",
              null,
              data.amount.toString()
            );
          }

          toast.success("All expense items submitted successfully");
        } else {
          // Single expense
          const { data, error } = await expenses.create(
            baseExpenseData,
            receiptFiles[0] || undefined
          );

          if (error) {
            console.error("Error creating regular expense:", error);
            toast.error(`Failed to create expense: ${error.message}`);
            setSaving(false);
            return;
          }

          try {
            const authRaw = localStorage.getItem("auth-storage");
            const authStorage = JSON.parse(authRaw || "{}");

            let userName = "Unknown User";
            if (authStorage?.state?.user?.profile?.full_name) {
              userName = authStorage.state.user.profile.full_name;
            } else if (typeof authRaw === "string" && authRaw.includes("full_name")) {
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

        // After creation, redirect
        if (eventIdFromQuery) {
          router.push(`/org/${slug}/expense-events/${eventIdFromQuery}`);
        } else {
          router.push(`/org/${slug}/expenses`);
        }
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
      <Card className="shadow-sm">
        {/* <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                if (eventIdFromQuery) {
                  router.push(`/org/${slug}/expense-events/${eventIdFromQuery}`);
                } else {
                  router.push(`/org/${slug}/expenses`);
                }
              }}
              className="text-gray-600 hover:text-gray-900 cursor-pointer"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {eventIdFromQuery ? "Back to Event" : "Back to Expenses"}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving}
              className="bg-black text-white hover:bg-black/90 cursor-pointer"
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
        </CardHeader> */}

        <CardHeader className="border-b">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                if (eventIdFromQuery) {
                  router.push(`/org/${slug}/expense-events/${eventIdFromQuery}`);
                } else {
                  router.push(`/org/${slug}/expenses`);
                }
              }}
              className="text-gray-600 hover:text-gray-900 cursor-pointer w-full md:w-auto"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {eventIdFromQuery ? "Back to Event" : "Back to Expenses"}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving}
              className="bg-black text-white hover:bg-black/90 cursor-pointer w-full md:w-auto"
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
        </CardHeader>

        <CardContent className="p-6 pt-0">
          <CardTitle className="text-2xl font-bold mb-4">New Expense Report</CardTitle>
          <h2 className="text-lg font-semibold mb-2">Basic Information</h2>
          <form onSubmit={handleSubmit} noValidate className="space-y-6">
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

            {/* Expense Type, Amount, Date, Approver, Description */}
            <div className="space-y-6">
              {/* Grid Row: Date and Approver */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {columns.map((col) => {
                  if (
                    !col.visible ||
                    !["date", "dropdown", "expense_type", "number"].includes(col.type) ||
                    !["date", "approver", "expense_type", "amount"].includes(col.key)
                  )
                    return null;

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

                      {/* Date Input */}
                      {col.type === "date" && (
                        <>
                          <Input
                            id={col.key}
                            name={col.key}
                            type="date"
                            value={formData[col.key] || ""}
                            onChange={(e) => handleInputChange(col.key, e.target.value)}
                            className={`w-full ${errors[col.key]
                              ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                              : ""
                              }`}
                          />
                          {errors[col.key] && (
                            <p
                              className="text-red-500 text-sm mt-1"
                              role="alert"
                              id={`${col.key}-error`}
                            >
                              {errors[col.key]}
                            </p>
                          )}
                        </>
                      )}

                      {/* Dropdown Input (Approver) */}
                      {col.type === "dropdown" && col.options && (
                        <>
                          <Select
                            value={formData[col.key] || ""}
                            onValueChange={(value: string) =>
                              handleInputChange(col.key, value)
                            }
                          >
                            <SelectTrigger
                              id={col.key}
                              className={`w-full ${errors[col.key]
                                ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                : ""
                                }`}
                            >
                              <SelectValue placeholder="Select an approver" />
                            </SelectTrigger>
                            <SelectContent>
                              {col.options.map((option: any) => {
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
                          {errors[col.key] && (
                            <p
                              className="text-red-500 text-sm mt-1"
                              role="alert"
                              id={`${col.key}-error`}
                            >
                              {errors[col.key]}
                            </p>
                          )}
                        </>
                      )}

                      {/* Expense Type Dropdown */}
                      {col.type === "expense_type" && col.options && (
                        <>
                          <Select
                            value={formData[col.key] || ""}
                            onValueChange={(value: string) =>
                              handleInputChange(col.key, value)
                            }
                          >
                            <SelectTrigger
                              id={col.key}
                              className={`w-full ${errors[col.key]
                                ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                : ""
                                }`}
                            >
                              <SelectValue placeholder="Select expense type" />
                            </SelectTrigger>
                            <SelectContent>
                              {col.options.map((option: any) => {
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
                          {errors[col.key] && (
                            <p
                              className="text-red-500 text-sm mt-1"
                              role="alert"
                              id={`${col.key}-error`}
                            >
                              {errors[col.key]}
                            </p>
                          )}
                        </>
                      )}

                      {/* Amount Input */}
                      {col.type === "number" && (
                        <>
                          <Input
                            id={col.key}
                            name={col.key}
                            type="number"
                            value={formData[col.key] || ""}
                            onChange={(e) =>
                              handleInputChange(col.key, parseFloat(e.target.value))
                            }
                            className={`w-full ${errors[col.key]
                              ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                              : ""
                              }`}
                            placeholder="Enter amount"
                          />
                          {errors[col.key] && (
                            <p
                              className="text-red-500 text-sm mt-1"
                              role="alert"
                              id={`${col.key}-error`}
                            >
                              {errors[col.key]}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Full Width Description */}
              {columns.map((col) => {
                if (!col.visible || col.key !== "description") return null;

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
                    <Textarea
                      id={col.key}
                      name={col.key}
                      value={formData[col.key] || ""}
                      onChange={(e) => handleInputChange(col.key, e.target.value)}
                      className={`w-full min-h-[75px] ${errors[col.key]
                        ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                        : ""
                        }`}
                      placeholder="Brief description of this expense report..."
                    />
                    {errors[col.key] && (
                      <p
                        className="text-red-500 text-sm mt-1"
                        role="alert"
                        id={`${col.key}-error`}
                      >
                        {errors[col.key]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

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
                    className="cursor-pointer"
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
                        name="receipt"
                        type="file"
                        onChange={(e) => handleFileChange(e)}
                        required={!voucherModalOpen}
                        aria-invalid={errors["receipt"] ? "true" : "false"}
                        aria-describedby={
                          errors["receipt"] ? "receipt-error" : undefined
                        }
                        className={
                          errors["receipt"]
                            ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                            : ""
                        }
                      />
                      {errors["receipt"] && (
                        <p
                          id="receipt-error"
                          className="text-red-500 text-sm mt-1"
                          role="alert"
                        >
                          {errors["receipt"]}
                        </p>
                      )}

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
                  errors={errors}
                />
              )}
            </div>

            {/* Expense Items Section */}
            {expenseItems.length > 0 && (
              <div className="space-y-6">
                {/* <h3 className="text-lg font-medium mb-2">Expense Items</h3> */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-5 space-y-6 bg-gray-50">
                  {expenseItems.map((id, index) => (
                    <div key={id} className="border rounded-lg bg-white p-5">
                      <div className="flex justify-between items-center mb-3">

                        <h1 className="text-xl font-medium text-gray-700">
                          Expense Item #{index + 2}
                        </h1>

                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteItem(id)}
                          className="cursor-pointer"
                        >
                          Delete
                        </Button>

                      </div>

                      {/* Expense Type, Date, Amount */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {columns.map((col) => {
                          if (
                            !col.visible ||
                            !['dropdown', 'date', 'number'].includes(col.type) ||
                            col.key === "approver"
                          )
                            return null;

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

                              {/* Dropdown */}
                              {col.type === "dropdown" && col.options && (
                                <>
                                  <Select
                                    // value={formData[col.key] || ""}
                                    // onValueChange={(value) => handleInputChange(col.key, value)}
                                    value={
                                      getExpenseItemValue(id, "expense_type") !== undefined && getExpenseItemValue(id, "expense_type") !== null
                                        ? String(getExpenseItemValue(id, "expense_type"))
                                        : undefined
                                    }
                                    onValueChange={(value) => handleExpenseItemChange(id, "expense_type", value)}
                                  >
                                    <SelectTrigger
                                      id={col.key}
                                      className={`w-full ${errors[col.key]
                                        ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                        : ""
                                        }`}
                                    >
                                      <SelectValue placeholder="Select expense type" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {col.options.map((option: any) => {
                                        const value = typeof option === "string" ? option : option.value;
                                        const label = typeof option === "string" ? option : option.label;
                                        return (
                                          <SelectItem key={value} value={value}>
                                            {label}
                                          </SelectItem>
                                        );
                                      })}
                                    </SelectContent>
                                  </Select>
                                  {errors[col.key] && (
                                    <p className="text-red-500 text-sm">{errors[col.key]}</p>
                                  )}
                                </>
                              )}

                              {/* Date */}
                              {col.type === "date" && (
                                <>
                                  <Input
                                    id={col.key}
                                    name={col.key}
                                    type="date"
                                    // value={formData[col.key] || ""}
                                    // onChange={(e) => handleInputChange(col.key, e.target.value)}
                                    value={getExpenseItemValue(id, "date")}
                                    onChange={(e) => handleExpenseItemChange(id, "date", e.target.value)}
                                    className={`w-full ${errors[col.key]
                                      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                      : ""
                                      }`}
                                  />
                                  {errors[col.key] && (
                                    <p className="text-red-500 text-sm">{errors[col.key]}</p>
                                  )}
                                </>
                              )}

                              {/* Number */}
                              {col.type === "number" && (
                                <>
                                  <Input
                                    id={col.key}
                                    name={col.key}
                                    type="number"
                                    placeholder="Enter amount"
                                    // value={formData[col.key] || ""}
                                    // onChange={(e) =>
                                    //   handleInputChange(col.key, parseFloat(e.target.value))
                                    // }

                                    value={getExpenseItemValue(id, "amount")}
                                    onChange={(e) => handleExpenseItemChange(id, "amount", parseFloat(e.target.value))}
                                    className={`w-full ${errors[col.key]
                                      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                      : ""
                                      }`}
                                  />
                                  {errors[col.key] && (
                                    <p className="text-red-500 text-sm">{errors[col.key]}</p>
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Description (full width) */}
                      {columns.map((col) => {
                        if (!col.visible || col.type !== "textarea" || col.key === "approver") return null;

                        return (
                          <div key={col.key} className="space-y-2">
                            <Label htmlFor={col.key} className="text-sm font-medium text-gray-700">
                              {col.label}
                              {col.required && (
                                <span className="text-red-500 ml-1 text-sm">*</span>
                              )}
                            </Label>
                            <Textarea
                              id={col.key}
                              name={col.key}
                              // value={formData[col.key] || ""}
                              // onChange={(e) => handleInputChange(col.key, e.target.value)}
                              value={getExpenseItemValue(id, "description")}
                              onChange={(e) => handleExpenseItemChange(id, "description", e.target.value)}
                              className={`w-full min-h-[50px] ${errors[col.key]
                                ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                : ""
                                }`}
                            />
                            {errors[col.key] && (
                              <p className="text-red-500 text-sm">{errors[col.key]}</p>
                            )}
                          </div>
                        );
                      })}

                      {/* Receipt Upload + Add Button */}
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">Receipt</Label>

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
                              checked={voucherModalOpenMap[index] || false}
                              className="cursor-pointer"
                              onCheckedChange={() => toggleVoucherModal(index)}
                              id="voucher-switch"
                            />
                          </div>

                          {!voucherModalOpenMap[index] && (
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
                                  name="receipt"
                                  type="file"
                                  onChange={(e) => handleFileChanges(e, index)}
                                  required={!voucherModalOpenMap[index]}
                                  aria-invalid={errors["receipt"] ? "true" : "false"}
                                  aria-describedby={
                                    errors["receipt"] ? "receipt-error" : undefined
                                  }
                                  className={
                                    errors["receipt"]
                                      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                      : ""
                                  }
                                />
                                {errors["receipt"] && (
                                  <p
                                    id="receipt-error"
                                    className="text-red-500 text-sm mt-1"
                                    role="alert"
                                  >
                                    {errors["receipt"]}
                                  </p>
                                )}

                                <div className="text-sm text-gray-500 mt-1">
                                  {receiptFiles[index] ? receiptFiles[index].name : "No file chosen"}
                                </div>
                              </div>
                              {receiptPreviews[index] && (
                                <div className="mt-2">
                                  {receiptPreviews[index].startsWith("data:image") ? (
                                    <img
                                      src={receiptPreviews[index]}
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

                        {voucherModalOpenMap[index] && (
                          <VoucherForm
                            formData={formData}
                            onInputChange={handleInputChange}
                            userRole={userRole}
                            savedUserSignature={savedUserSignature}
                            errors={errors}
                          />
                        )}

                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Button
              type="button"
              onClick={addItem}
              className="bg-green-600 hover:bg-green-600 text-white font-semibold px-4 py-2 rounded-mdv cursor-pointer"
            >
              ➕ Add Another Expense Item
            </Button>

            {/* Expense Signature Section - Only shown when voucher is not open */}
            {(() => {
              // Only show the signature section if *none* of the vouchers are open (i.e., for the main expense form)
              const anyVoucherOpen = Object.values(voucherModalOpenMap).some(Boolean);
              if (!anyVoucherOpen) {
                return (
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
                );
              }
              return null;
            })()}

          </form>
        </CardContent>
      </Card>
    </div>
  );
}
