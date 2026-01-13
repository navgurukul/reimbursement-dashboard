"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import {
  orgSettings,
  expenses,
  ReceiptInfo,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ArrowLeft,
  CalendarIcon,
  Save,
  Upload,
  Trash2,
  Info,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthStore } from "@/store/useAuthStore";
import { organizations, expenseHistory, voucherAttachments } from "@/lib/db";
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
  unique_id?: string;
}

interface ExpenseItemData {
  expense_type: string;
  amount: number;
  date: string;
  description: string;
  [key: string]: string | number | string[] | undefined;
}

interface BankDetailRecord {
  id: number;
  account_holder: string | null;
  email: string | null;
  unique_id: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  ifsc_code?: string | null;
}

export default function NewExpensePage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const eventIdFromQuery = searchParams.get("eventId");

  const { organization, userRole } = useOrgStore();
  const { user, profile } = useAuthStore();
  const orgId = organization?.id!;
  const slug = params.slug as string;

  const [isMounted, setIsMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const creatorSigRef = useRef<HTMLDivElement | null>(null);
  const [creatorHighlight, setCreatorHighlight] = useState(false);

  const scrollToCreatorSignature = () => {
    try {
      if (creatorSigRef.current) {
        creatorSigRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
        setCreatorHighlight(true);
        setTimeout(() => setCreatorHighlight(false), 3000);
      }
    } catch (e) {
      console.error("Scroll to creator signature failed:", e);
    }
  };

  const [columns, setColumns] = useState<Column[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({
    event_id: eventIdFromQuery || "",
  });

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [receiptFiles, setReceiptFiles] = useState<Record<number, File | null>>(
    {}
  );
  const [receiptPreviews, setReceiptPreviews] = useState<
    Record<number, string | null>
  >({});

  const [voucherModalOpen, setVoucherModalOpen] = useState(false);
  const [voucherModalOpenMap, setVoucherModalOpenMap] = useState<
    Record<number, boolean>
  >({});

  const [events, setEvents] = useState<ExpenseEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<ExpenseEvent | null>(null);

  // Separate signature states for expense and voucher
  const [expenseSignature, setExpenseSignature] = useState<string | undefined>(
    undefined
  );

  const [savedUserSignature, setSavedUserSignature] = useState<string | null>(
    null
  );
  const [loadingSignature, setLoadingSignature] = useState(true);

  const [expenseItems, setExpenseItems] = useState<number[]>([]);
  const [expenseItemsData, setExpenseItemsData] = useState<
    Record<number, ExpenseItemData>
  >({});
  const [voucherAttachmentsMap, setVoucherAttachmentsMap] = useState<
    Record<number, File | null>
  >({});

  // voucherDataMap
  const [voucherDataMap, setVoucherDataMap] = useState<Record<number, any>>({});

  // Location options from settings
  const [locationOptions, setLocationOptions] = useState<string[]>([]);

  // Payment Unique ID helpers
  const [uniqueIdModalOpen, setUniqueIdModalOpen] = useState(false);
  const [bankSearchQuery, setBankSearchQuery] = useState("");
  const [bankSearchResults, setBankSearchResults] = useState<
    BankDetailRecord[]
  >([]);
  const [bankSearchLoading, setBankSearchLoading] = useState(false);
  const [bankSearchError, setBankSearchError] = useState<string | null>(null);
  const [selectedUniqueIdUser, setSelectedUniqueIdUser] =
    useState<BankDetailRecord | null>(null);
  const [prefilledUniqueId, setPrefilledUniqueId] = useState<string | null>(
    null
  );
  const [uniqueIdUnavailable, setUniqueIdUnavailable] = useState(false);

  const getDefaultValueByType = (type: string) => {
    switch (type) {
      case "text":
      case "textarea":
      case "dropdown":
      case "radio":
        return "";
      case "checkbox":
        return [];
      case "number":
        return 0;
      case "date":
        return new Date().toISOString().split("T")[0];
      default:
        return "";
    }
  };

  const addItem = () => {
    const newId = Date.now();

    const customFieldValues: Record<string, any> = {};
    customFields.forEach((col) => {
      customFieldValues[col.label] = getDefaultValueByType(col.type);
    });

    setExpenseItems((prev) => [...prev, newId]);
    setExpenseItemsData((prev) => ({
      ...prev,
      [newId]: {
        expense_type: "",
        amount: 0,
        // date: new Date().toISOString().split("T")[0],
        date: new Date().toISOString().split("T")[0],
        description: "",
        unique_id: formData.unique_id || "",
        ...customFieldValues, // ✅ Add label-based custom fields
      },
    }));
  };

  const deleteItem = (id: number) => {
    setExpenseItems((prev) => prev.filter((item) => item !== id));
    setExpenseItemsData((prev) => {
      const newData = { ...prev };
      delete newData[id];
      return newData;
    });
    // Clean up voucher modal state
    setVoucherModalOpenMap((prev) => {
      const newMap = { ...prev };
      delete newMap[id];
      return newMap;
    });
    // Clean up receipt files
    setReceiptFiles((prev) => {
      const newFiles = { ...prev };
      delete newFiles[id];
      return newFiles;
    });
    setReceiptPreviews((prev) => {
      const newPreviews = { ...prev };
      delete newPreviews[id];
      return newPreviews;
    });
  };

  // Handler for expense items - separate from main form
  const handleExpenseItemChange = (
    itemId: number,
    key: keyof ExpenseItemData,
    value: string | number | string[]
  ) => {
    setExpenseItemsData((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [key]: value,
      },
    }));

    // If "date" field is changed, also update voucherDataMap
    if (key === "date") {
      setVoucherDataMap((prev) => ({
        ...prev,
        [itemId]: {
          ...prev[itemId],
          date: value,
        },
      }));
    }
  };

  const getExpenseItemValue = (
    itemId: number,
    key: keyof ExpenseItemData
  ): string | number | string[] => {
    const value = expenseItemsData[itemId]?.[key];
    if (
      value === undefined ||
      value === null ||
      (key === "amount" && (value === 0 || isNaN(Number(value))))
    ) {
      return "";
    }
    return value;
  };
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

          // Extract location options from settings
          const locationColumn = columnsToUse.find(
            (col: Column) => col.key === "location"
          );
          if (locationColumn && locationColumn.options) {
            const options = locationColumn.options;
            if (Array.isArray(options) && options.length > 0) {
              if (typeof options[0] === "object") {
                // Convert array of objects to array of strings
                setLocationOptions(
                  (options as Array<{ value: string; label: string }>).map(
                    (opt) => opt.label || opt.value
                  )
                );
              } else {
                // It's already a string array
                setLocationOptions(options as string[]);
              }
            }
          }

          const initialData: Record<string, any> = {};
          processedColumns.forEach((col: any) => {
            if (col.visible) {
              initialData[col.key] = "";
            }
          });

          initialData.date = new Date().toISOString().split("T")[0];
          initialData.event_id = eventIdFromQuery || "";
          initialData.unique_id = "";
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
          initialData.unique_id = "";
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
  const handleFileChanges = (
    e: React.ChangeEvent<HTMLInputElement>,
    itemId: number
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setErrors((prevErrors) => {
      const updatedErrors = { ...prevErrors };
      delete updatedErrors[`receipt-${itemId}`];
      return updatedErrors;
    });

    const reader = new FileReader();
    reader.onloadend = () => {
      setReceiptFiles((prev) => ({ ...prev, [itemId]: file }));
      setReceiptPreviews((prev) => ({
        ...prev,
        [itemId]: reader.result as string,
      }));
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
    const newErrors: Record<string, string> = {};
    // Validate date against selected event
    if (selectedEvent && formData.date) {
      const selectedDate = new Date(formData.date);
      const startDate = new Date(selectedEvent.start_date);
      const endDate = new Date(selectedEvent.end_date);

      if (selectedDate < startDate || selectedDate > endDate) {
        newErrors[
          "date"
        ] = `Date must be within the event duration (${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()})`;
      }
    }
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

    if (key === "unique_id" && typeof value === "string") {
      // If user types or changes the value, consider it available
      setUniqueIdUnavailable(false);
      if (selectedUniqueIdUser && selectedUniqueIdUser.unique_id !== value) {
        setSelectedUniqueIdUser(null);
      }
      if (prefilledUniqueId && prefilledUniqueId !== value) {
        setPrefilledUniqueId(null);
      }
    }

    // If the top-level Payment Unique ID is changed, propagate it to all expense items
    if (key === "unique_id") {
      const v = typeof value === "string" ? value : String(value);
      setExpenseItemsData((prev) => {
        const updated: Record<number, ExpenseItemData> = { ...prev };
        expenseItems.forEach((id) => {
          const item = updated[id] || {};
          updated[id] = {
            ...item,
            unique_id: v,
          };
        });
        return updated;
      });
    }
    // If changing the event, update the selected event
    if (key === "event_id" && value) {
      const event = events.find((e) => e.id === value);
      setSelectedEvent(event || null);
    }
  };

  // Prefill Payment Unique ID using the logged-in user's bank details
  useEffect(() => {
    const fetchLoggedInUserUniqueId = async () => {
      if (!user?.email || !organization?.id) return;
      if (formData.unique_id) return;

      try {
        const { data, error } = await supabase
          .from("bank_details")
          .select(
            "id,account_holder,email,unique_id,bank_name,account_number,ifsc_code"
          )
          .eq("email", user.email)
          .limit(1);

        if (error) {
          console.error("Failed to fetch bank details for prefill:", error);
          return;
        }

        const record = data?.[0];
        if (record?.unique_id) {
          handleInputChange("unique_id", record.unique_id);
          setSelectedUniqueIdUser(record as BankDetailRecord);
          setPrefilledUniqueId(record.unique_id);
          setUniqueIdUnavailable(false);
        } else {
          // Logged-in user's bank details are missing a unique ID
          setUniqueIdUnavailable(true);
        }
      } catch (err) {
        console.error("Unexpected error while prefilling unique ID:", err);
      }
    };

    fetchLoggedInUserUniqueId();
  }, [formData.unique_id, organization?.id, user?.email]);

  const handleUniqueIdSelect = (detail: BankDetailRecord) => {
    const value = detail.unique_id || "";
    handleInputChange("unique_id", value);
    setSelectedUniqueIdUser(detail);
    setPrefilledUniqueId(detail.unique_id || null);
    setUniqueIdUnavailable(false);
    setUniqueIdModalOpen(false);
  };

  // Search bank details when the modal is open
  useEffect(() => {
    if (!uniqueIdModalOpen) {
      setBankSearchLoading(false);
      setBankSearchError(null);
      setBankSearchResults([]);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setBankSearchLoading(true);
      setBankSearchError(null);

      try {
        const trimmed = bankSearchQuery.trim();

        let query = supabase
          .from("bank_details")
          .select(
            "id,account_holder,email,unique_id,bank_name,account_number,ifsc_code"
          )
          .order("account_holder", { ascending: true });
        // .limit(20);

        if (trimmed) {
          query = query.or(
            `account_holder.ilike.%${trimmed}%,email.ilike.%${trimmed}%,unique_id.ilike.%${trimmed}%`
          );
        }

        const { data, error } = await query;
        if (error) throw error;

        setBankSearchResults((data || []) as BankDetailRecord[]);
      } catch (err: any) {
        console.error("Error searching bank details:", err);
        setBankSearchError("Unable to search users right now");
      } finally {
        setBankSearchLoading(false);
      }
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [bankSearchQuery, uniqueIdModalOpen]);

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

  const notifyApprover = async (params: {
    expenseId: string;
    amount: number;
    expenseType: string;
    approverEmail: string;
    approverName?: string;
  }) => {
    const { expenseId, amount, expenseType, approverEmail, approverName } =
      params;

    if (!approverEmail) return;

    try {
      await fetch("/api/expenses/notify-approver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expenseId,
          approverEmail,
          approverName,
          requesterName: profile?.full_name || user?.email || "",
          orgName: organization?.name,
          slug,
          amount,
          expenseType,
        }),
      });
    } catch (err) {
      console.error("Failed to send approver notification", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    const newErrors: Record<string, string> = {};

    // Validate main form fields
    if (voucherModalOpen) {
      if (!formData.yourName) newErrors["yourName"] = "Your Name is required";
      if (!formData.voucherAmount)
        newErrors["voucherAmount"] = "Amount is required";
      if (!formData.purpose) newErrors["purpose"] = "Purpose is required";
      if (!formData.voucherCreditPerson)
        newErrors["voucherCreditPerson"] = "Credit Person is required";
      if (!formData.voucher_signature_data_url)
        newErrors["voucher_signature_data_url"] = "Signature is required";
    }

    // Validate required Payment Unique ID
    if (!formData.unique_id || String(formData.unique_id).trim() === "") {
      newErrors["unique_id"] = "Payment Unique ID is required";
    }

    // Validate expense items
    for (const itemId of expenseItems) {
      const item = expenseItemsData[itemId];
      if (!item.expense_type)
        newErrors[`expense_type-${itemId}`] = "Expense Type is required";
      if (!item.amount || isNaN(item.amount))
        newErrors[`amount-${itemId}`] = "Amount is required";
      // if (!item.date) newErrors[`date-${itemId}`] = "Date is required";

      if (!item.date) {
        newErrors[`date-${itemId}`] = "Date is required";
      } else if (selectedEvent && item.date) {
        const itemDate = new Date(item.date);
        const startDate = new Date(selectedEvent.start_date);
        const endDate = new Date(selectedEvent.end_date);
        if (itemDate < startDate || itemDate > endDate) {
          newErrors[
            `date-${itemId}`
          ] = `Date must be within the event duration (${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()})`;
        }
      }

      // Validate custom fields for expense items
      customFields.forEach((col) => {
        if (col.required && !item[col.key]) {
          newErrors[`${col.key}-${itemId}`] = `${col.label} is required`;
        }
      });

      if (voucherModalOpenMap[itemId]) {
        const voucherData = voucherDataMap[itemId] || {};
        if (!voucherData.yourName)
          newErrors[`yourName-${itemId}`] = "Your Name is required";

        if (!voucherData.voucherAmount)
          newErrors[`voucherAmount-${itemId}`] = "Amount is required";
        if (!voucherData.purpose)
          newErrors[`purpose-${itemId}`] = "Purpose is required";
        if (!voucherData.voucherCreditPerson)
          newErrors[`voucherCreditPerson-${itemId}`] =
            "Credit Person is required";
        if (!voucherData.voucher_signature_data_url)
          newErrors[`voucher_signature_data_url-${itemId}`] =
            "Signature is required";
      } else {
        if (!receiptFiles[itemId])
          newErrors[`receipt-${itemId}`] = "Receipt is required";
      }
    }

    // Validate required fields from columns
    for (const col of columns) {
      if (col.required && col.visible && !formData[col.key]) {
        newErrors[col.key] = `${col.label} is required`;
      }
    }

    // ✅ Validate single Location
    if (!formData.location) {
      newErrors["location"] = "Location is required";
    }

    // Receipt required for main expense if not in voucher mode
    if (!voucherModalOpen && !receiptFile) {
      newErrors["receipt"] = "Receipt is required";
    }

    // If any errors, stop and show them
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showErrorSummary(newErrors);
      setTimeout(() => {
        scrollToFirstError(newErrors);
      }, 100);
      setSaving(false);
      return;
    }

    // Clear previous errors
    setErrors({});

    // Require creator signature for non-voucher expenses
    if (!voucherModalOpen && !formData.expense_signature_data_url) {
      toast.error("Please add your signature.");
      scrollToCreatorSignature();
      setSaving(false);
      return;
    }

    try {
      if (!user?.id || !organization) {
        throw new Error("Missing required data");
      }

      // Validate that user is not approving their own expense
      if (formData.approver === user.id) {
        toast.error("You cannot approve your own expenses");
        setSaving(false);
        return;
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

      // Process signatures
      let expense_signature_url: string | null = null;
      let voucher_signature_url: string | null = null;
      let manager_signature_url: string | null = null;

      // Handle voucher signature
      if (voucherModalOpen && formData.voucher_signature_data_url) {
        if (
          formData.voucher_signature_data_url === savedUserSignature &&
          profileSignaturePath
        ) {
          voucher_signature_url = profileSignaturePath;
        } else if (
          formData.voucher_signature_data_url.startsWith("data:image/")
        ) {
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
          }
          voucher_signature_url = path;
        } else {
          toast.error(
            "Invalid signature format. Please redraw your signature."
          );
          setSaving(false);
          return;
        }
      }

      // Handle expense signature
      if (!voucherModalOpen && formData.expense_signature_data_url) {
        if (
          formData.expense_signature_data_url === savedUserSignature &&
          profileSignaturePath
        ) {
          expense_signature_url = profileSignaturePath;
        } else if (
          formData.expense_signature_data_url.startsWith("data:image/")
        ) {
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
          }
          expense_signature_url = path;
        } else {
          toast.error(
            "Invalid signature format. Please redraw your signature."
          );
          setSaving(false);
          return;
        }
      }

      // Handle manager signature for voucher
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
            setSaving(false);
            return;
          }
          manager_signature_url = path;
        } else {
          toast.error("Invalid manager signature format.");
          setSaving(false);
          return;
        }
      }

      const approver_id = formData.approver || null;
      const signature_url_to_use = voucherModalOpen
        ? voucher_signature_url
        : expense_signature_url;

      const sanitizeLabel = (label: string): string => {
        return label
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, "")
          .replace(/\s+/g, "_");
      };

      const custom_fields: Record<string, any> = {};
      columns.forEach((col) => {
        if (
          col.visible &&
          col.key !== "expense_type" &&
          col.key !== "amount" &&
          col.key !== "date" &&
          col.key !== "approver" &&
          col.key !== "event_id"
        ) {
          let label = col.label?.trim();
          if (label) {
            label = sanitizeLabel(label);
            custom_fields[label] = formData[col.key];
          }
        }
      });

      if (voucherModalOpen) {
        custom_fields["description"] = formData.description || "Cash Voucher";
      }

      const approverProfile = await profiles.getById(formData.approver);
      const approverEmail = approverProfile?.data?.email || "";
      const approverName = approverProfile?.data?.full_name || "";

      // Create the base expense
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
        approver_id,
        // include top-level Payment Unique ID if provided
        unique_id: formData.unique_id || undefined,
        signature_url: signature_url_to_use ?? undefined,
        receipt: null,
        creator_email: user.email,
        approver_email: approverEmail,
        location: formData.location || null,
      };

      const { data: baseData, error: baseError } = await expenses.create(
        baseExpenseData,
        receiptFile || undefined
      );

      if (baseError) {
        console.error("Error creating base expense:", baseError);
        toast.error(`Failed to create base expense: ${baseError.message}`);
        setSaving(false);
        return;
      }

      await notifyApprover({
        expenseId: baseData.id,
        amount: baseExpenseData.amount,
        expenseType: baseExpenseData.expense_type,
        approverEmail,
        approverName,
      });

      // Log history for main/base expense
      try {
        const authRaw = localStorage.getItem("auth-storage");
        const authStorage = JSON.parse(authRaw || "{}");
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

      let attachmentData = null;
      if (formData.attachment) {
        const file = formData.attachment;

        const { path, error: fileError } = await voucherAttachments.upload(
          file,
          user.id,
          organization.id
        );

        if (fileError) {
          console.error("Upload error:", fileError.message || fileError);
          toast.error("Failed to upload payment screenshot");
          setSaving(false);
          return;
        }
        // Store in same format as expense.receipt
        attachmentData = [file.name, path, file.type].join(",");
      }

      // Create voucher for the base expense if in voucher mode
      if (voucherModalOpen) {
        const voucherData = {
          expense_id: baseData.id,
          your_name: formData.yourName || null,
          amount: parseFloat(formData.voucherAmount || "0"),
          purpose: formData.purpose || null,
          credit_person: formData.voucherCreditPerson || null,
          signature_url: voucher_signature_url,
          manager_signature_url: manager_signature_url,
          created_by: user.id,
          org_id: organization.id,
          approver_id,
          attachment: attachmentData,
        };

        const { data: voucherResponse, error: voucherError } = await supabase
          .from("vouchers")
          .insert([voucherData])
          .select()
          .single();

        if (voucherError) {
          console.error("Voucher creation error:", voucherError);
          toast.error(`Failed to create voucher: ${voucherError.message}`);
          try {
            await supabase.from("expense_new").delete().eq("id", baseData.id);
          } catch (cleanupError) {
            console.error("Failed to clean up expense:", cleanupError);
          }
          setSaving(false);
          return;
        }
      }

      // Process additional expense items
      if (expenseItems.length > 0) {
        for (const itemId of expenseItems) {
          const item = expenseItemsData[itemId];
          const isVoucher = voucherModalOpenMap[itemId] || voucherModalOpen;

          // Prepare custom fields for the item
          const itemCustomFields: Record<string, any> = {
            description: item.description || "",
          };

          // Add custom fields from expenseItemsData
          customFields.forEach((col) => {
            const label = col.label?.trim();
            if (label && item[col.key] !== undefined) {
              itemCustomFields[label] = item[col.key];
            }
          });

          const individualExpenseData = {
            org_id: organization.id,
            user_id: user.id,
            amount: item.amount,
            expense_type: item.expense_type || "Other",
            date: new Date(item.date).toISOString(),
            custom_fields: itemCustomFields,
            event_id: formData.event_id || null,
            approver_id: formData.approver || null,
            // Use per-item unique_id if present, otherwise fall back to top-level Payment Unique ID
            unique_id: item.unique_id || formData.unique_id || undefined,
            signature_url: isVoucher
              ? signature_url_to_use ?? undefined
              : expense_signature_url ?? undefined,
            receipt: null,
            creator_email: user.email,
            approver_email: approverEmail,
            location: item.location || null,
          };

          const { data: itemData, error: itemError } = await expenses.create(
            individualExpenseData,
            receiptFiles[itemId] || undefined
          );

          if (itemError) {
            toast.error(`Failed to create expense item: ${itemError.message}`);
            console.error("Error creating item:", itemError);
            continue;
          }

          await notifyApprover({
            expenseId: itemData.id,
            amount: individualExpenseData.amount,
            expenseType: individualExpenseData.expense_type,
            approverEmail,
            approverName,
          });

          let attachmentData = null;
          const voucherAttachment = voucherDataMap[itemId]?.attachment;
          if (voucherAttachment) {
            const { path, error: fileError } = await voucherAttachments.upload(
              voucherAttachment,
              user.id,
              organization.id
            );
            if (fileError) {
              console.error("Upload error:", fileError.message || fileError);
              toast.error("Failed to upload payment screenshot");
              setSaving(false);
              return;
            }
            attachmentData = [
              voucherAttachment.name,
              path,
              voucherAttachment.type,
            ].join(",");
          }

          if (isVoucher) {
            const itemVoucherData = voucherDataMap[itemId] || {};
            const voucherData = {
              expense_id: itemData.id,
              your_name: itemVoucherData.yourName || formData.yourName || null,
              amount: item.amount,
              purpose:
                itemVoucherData.purpose || formData.purpose || "Cash Voucher",
              credit_person:
                itemVoucherData.voucherCreditPerson ||
                formData.voucherCreditPerson ||
                null,
              signature_url: itemVoucherData.voucher_signature_url
                ? itemVoucherData.voucher_signature_url
                : signature_url_to_use ?? expense_signature_url ?? undefined,
              manager_signature_url:
                itemVoucherData.manager_signature_url ||
                manager_signature_url ||
                null,
              created_by: user.id,
              org_id: organization.id,
              approver_id: formData.approver || null,
              attachment: attachmentData,
            };

            const { error: voucherError } = await supabase
              .from("vouchers")
              .insert([voucherData]);

            if (voucherError) {
              console.error("Voucher creation error:", voucherError);
              toast.error(
                `Failed to create voucher for item: ${voucherError.message}`
              );
              try {
                await supabase
                  .from("expense_new")
                  .delete()
                  .eq("id", itemData.id);
              } catch (cleanupError) {
                console.error("Failed to clean up expense:", cleanupError);
              }
              continue;
            }
          }

          // Log history entry
          try {
            const authRaw = localStorage.getItem("auth-storage");
            const authStorage = JSON.parse(authRaw || "{}");
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
            await expenseHistory.addEntry(
              itemData.id,
              user.id,
              userName,
              "created",
              null,
              itemData.amount.toString()
            );
          } catch (logError) {
            console.error("Error logging expense item creation:", logError);
            await expenseHistory.addEntry(
              itemData.id,
              user.id,
              "Unknown User",
              "created",
              null,
              itemData.amount.toString()
            );
          }
        }
      }

      toast.success("All expenses and vouchers have been submitted successfully. Email notification has been sent to the expense approver.");
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

  const defaultSystemFields = [
    "amount",
    "date",
    "expense_type",
    "approver",
    "event_id",
    "description",
  ];
  const customFields = columns.filter(
    (col) => col.visible && !defaultSystemFields.includes(col.key)
  );

  return (
    <div className="max-w-[800px] mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <Button
          variant="link"
          onClick={() => {
            if (eventIdFromQuery) {
              router.push(`/org/${slug}/expense-events/${eventIdFromQuery}`);
            } else {
              router.push(`/org/${slug}/expenses`);
            }
          }}
          className="text-gray-600 hover:text-gray-900 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          {eventIdFromQuery ? "Back to Event" : "Back to Expenses"}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={saving}
          variant="neutral"
          className="cursor-pointer"
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
        <CardContent className="p-6 pt-0">
          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            {/* Unique Expense ID - editable by user */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="unique_id"
                  className="text-sm font-medium text-gray-700"
                >
                  Payment Unique ID
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <p>A unique identifier used for payment processing</p>
                  </TooltipContent>
                </Tooltip>
                <span className="text-red-500 ml-1 text-sm">*</span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="unique_id"
                  name="unique_id"
                  type="text"
                  value={formData.unique_id || ""}
                  onChange={(e) =>
                    handleInputChange("unique_id", e.target.value)
                  }
                  required
                  aria-invalid={errors["unique_id"] ? "true" : "false"}
                  aria-describedby={
                    errors["unique_id"] ? "unique_id-error" : undefined
                  }
                  placeholder={
                    uniqueIdUnavailable
                      ? "Unique ID not available"
                      : "Enter payment unique ID"
                  }
                  className={`w-full border ${
                    errors["unique_id"]
                      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300"
                  } disabled:bg-gray-50 disabled:text-gray-700 disabled:border-gray-300 disabled:opacity-100`}
                  disabled={
                    !!prefilledUniqueId ||
                    (uniqueIdUnavailable && !formData.unique_id)
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  className="sm:w-40 cursor-pointer bg-gray-300"
                  onClick={() => {
                    // setBankSearchQuery(formData.unique_id || user?.email || "");
                    setBankSearchQuery("");
                    setUniqueIdModalOpen(true);
                  }}
                >
                  Search user
                </Button>
              </div>
              {errors["unique_id"] && (
                <p
                  className="text-red-500 text-sm mt-1"
                  role="alert"
                  id={`unique_id-error`}
                >
                  {errors["unique_id"]}
                </p>
              )}

              {uniqueIdUnavailable && !formData.unique_id && (
                <p className="text-xs px-2 py-0 text-gray-600">
                  Unique ID is not available for your login email. Please search
                  for a user.
                </p>
              )}

              {(selectedUniqueIdUser || prefilledUniqueId) && (
                <div className="bg-gray-50 px-2 py-0 text-sm text-gray-800">
                  <p className="mt-1 text-xs text-gray-600">
                    Pre-filled Payment Unique ID; allows searching and replacing
                    with another user’s Unique ID.
                  </p>
                </div>
              )}
            </div>

            <Dialog
              open={uniqueIdModalOpen}
              onOpenChange={setUniqueIdModalOpen}
            >
              <DialogContent className="max-w-xl">
                <DialogHeader>
                  <DialogTitle>Select a user</DialogTitle>
                  <DialogDescription>
                    Search by name, email, or Unique ID and click a row to
                    autofill the payment Unique ID.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                  <Input
                    autoFocus
                    value={bankSearchQuery}
                    onChange={(e) => setBankSearchQuery(e.target.value)}
                    placeholder="Search by name, email, or Unique ID"
                  />

                  {bankSearchError && (
                    <p className="text-sm text-red-600">{bankSearchError}</p>
                  )}

                  <div className="max-h-80 overflow-y-auto rounded-md border bg-gray-50">
                    {bankSearchLoading ? (
                      <div className="px-3 py-4">
                        {[...Array(5)].map((_, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between gap-3 py-3"
                          >
                            <div className="flex flex-col gap-2 w-2/3">
                              <Skeleton className="h-4 w-32" />
                              <Skeleton className="h-3 w-40" />
                            </div>
                            <div className="flex flex-col items-end gap-2 w-1/3">
                              <Skeleton className="h-4 w-20" />
                              <Skeleton className="h-3 w-24" />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : bankSearchResults.length === 0 &&
                      bankSearchQuery.trim() ? (
                      <p className="px-3 py-4 text-sm text-gray-600">
                        No matching users found.
                      </p>
                    ) : bankSearchResults.length === 0 ? (
                      <p className="px-3 py-4 text-sm text-gray-400">
                        Type to search users.
                      </p>
                    ) : (
                      <div className="divide-y">
                        {bankSearchResults.map((row) => (
                          <button
                            type="button"
                            key={row.id}
                            onClick={() => handleUniqueIdSelect(row)}
                            className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left hover:bg-white cursor-pointer"
                          >
                            <div>
                              <p className="text-sm font-semibold text-gray-900">
                                {row.account_holder || "Unnamed account"}
                              </p>
                              <p className="text-xs text-gray-600">
                                {row.email || "No email available"}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="font-mono text-sm text-gray-900">
                                {row.unique_id || "—"}
                              </p>
                              {row.bank_name && (
                                <p className="text-[11px] text-gray-500">
                                  {row.bank_name}
                                </p>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    onClick={() => setUniqueIdModalOpen(false)}
                    className="cursor-pointer"
                  >
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
                  <SelectValue placeholder="Select expense type (optional)" />
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
                    !["date", "dropdown", "expense_type", "number"].includes(
                      col.type
                    ) ||
                    !["date", "approver", "expense_type", "amount"].includes(
                      col.key
                    )
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
                            onChange={(e) =>
                              handleInputChange(col.key, e.target.value)
                            }
                            className={`w-full ${
                              errors[col.key]
                                ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                : ""
                            }`}
                            min={
                              selectedEvent
                                ? selectedEvent.start_date.split("T")[0]
                                : undefined
                            }
                            max={
                              selectedEvent
                                ? selectedEvent.end_date.split("T")[0]
                                : undefined
                            }
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
                          <p className="text-xs text-gray-600">
                            Reimbursement bill uploading date / vendor invoice date
                          </p>
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
                              className={`w-full ${
                                errors[col.key]
                                  ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                  : ""
                              }`}
                            >
                              <SelectValue placeholder="Please Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {col.options.map((option: any) => {
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
                              className={`w-full ${
                                errors[col.key]
                                  ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                  : ""
                              }`}
                            >
                              <SelectValue placeholder="Select expense type" />
                            </SelectTrigger>
                            <SelectContent>
                              {col.options.map((option: any) => {
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
                              handleInputChange(
                                col.key,
                                parseFloat(e.target.value)
                              )
                            }
                            className={`w-full ${
                              errors[col.key]
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
                      onChange={(e) =>
                        handleInputChange(col.key, e.target.value)
                      }
                      className={`w-full min-h-[75px] ${
                        errors[col.key]
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
                    <p className="text-xs text-gray-600">
                      Purpose of the expense, related activity/program, amount spent, number of people involved etc...
                    </p>
                  </div>
                );
              })}
              {/* Text and Number Fields (e.g., New, New One) */}
              {customFields.map((col) => {
                if (
                  !col.visible ||
                  ![
                    "text",
                    "number",
                    "date",
                    "textarea",
                    "dropdown",
                    "radio",
                    "checkbox",
                  ].includes(col.type)
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
                    {col.type === "text" && (
                      <Input
                        id={col.key}
                        name={col.key}
                        type={col.type}
                        value={formData[col.key] || ""}
                        onChange={(e) =>
                          handleInputChange(col.key, e.target.value)
                        }
                        className={`w-full ${
                          errors[col.key]
                            ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                            : ""
                        }`}
                        placeholder={`Enter ${col.label}`}
                      />
                    )}
                    {col.type === "number" && (
                      <Input
                        id={col.key}
                        name={col.key}
                        type={col.type}
                        value={formData[col.key] || ""}
                        onChange={(e) =>
                          handleInputChange(
                            col.key,
                            col.type === "number"
                              ? parseFloat(e.target.value)
                              : e.target.value
                          )
                        }
                        className={`w-full ${
                          errors[col.key]
                            ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                            : ""
                        }`}
                        placeholder={`Enter ${col.label}`}
                      />
                    )}
                    {col.type === "date" && (
                      <Input
                        id={col.key}
                        name={col.key}
                        type="date"
                        value={formData[col.key] || ""}
                        onChange={(e) =>
                          handleInputChange(col.key, e.target.value)
                        }
                        className={`w-full ${
                          errors[col.key]
                            ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                            : ""
                        }`}
                      />
                    )}
                    {col.type === "textarea" && (
                      <Textarea
                        id={col.key}
                        name={col.key}
                        value={formData[col.key] || ""}
                        onChange={(e) =>
                          handleInputChange(col.key, e.target.value)
                        }
                        className={`w-full min-h-[75px] ${
                          errors[col.key]
                            ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                            : ""
                        }`}
                        placeholder="Brief description of this expense report..."
                      />
                    )}
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
                            className={`w-full ${
                              errors[col.key]
                                ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                : ""
                            }`}
                          >
                            <SelectValue placeholder="Please Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {col.options.map((option: any) => {
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
                            })}
                          </SelectContent>
                        </Select>
                      </>
                    )}
                    {col.type === "radio" && col.options && (
                      <div className="space-y-1">
                        {col.options.map((option: any) => {
                          const value =
                            typeof option === "string" ? option : option.value;
                          const label =
                            typeof option === "string" ? option : option.label;
                          return (
                            <div
                              key={value}
                              className="flex items-center space-x-2"
                            >
                              <input
                                type="radio"
                                id={`${col.key}-${value}`}
                                name={col.key}
                                value={value}
                                checked={formData[col.key] === value}
                                onChange={() =>
                                  handleInputChange(col.key, value)
                                }
                                className="h-4 w-4 text-blue-600 border-gray-300"
                              />
                              <label
                                htmlFor={`${col.key}-${value}`}
                                className="text-sm text-gray-700"
                              >
                                {label}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {col.type === "checkbox" && col.options && (
                      <div className="space-y-2">
                        {col.options.map((option: any) => {
                          const value =
                            typeof option === "string" ? option : option.value;
                          const label =
                            typeof option === "string" ? option : option.label;

                          // Get current selected values (as an array)
                          const selectedValues: string[] =
                            formData[col.key] || [];

                          const isChecked = selectedValues.includes(value);

                          const handleCheckboxChange = (checked: boolean) => {
                            const updatedValues = checked
                              ? [...selectedValues, value]
                              : selectedValues.filter((v) => v !== value);

                            handleInputChange(col.key, updatedValues);
                          };

                          return (
                            <div
                              key={value}
                              className="flex items-center space-x-2"
                            >
                              <input
                                type="checkbox"
                                id={`${col.key}-${value}`}
                                name={`${col.key}-${value}`}
                                checked={isChecked}
                                onChange={(e) =>
                                  handleCheckboxChange(e.target.checked)
                                }
                                className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                              />
                              <label
                                htmlFor={`${col.key}-${value}`}
                                className="text-sm text-gray-700"
                              >
                                {label}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}
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
                return null;
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
                  selectedEvent={
                    selectedEvent
                      ? {
                          start_date: selectedEvent.start_date,
                          end_date: selectedEvent.end_date,
                        }
                      : undefined
                  }
                  errors={errors}
                />
              )}
            </div>

            {/* Expense Items Section */}
            {expenseItems.length > 0 && (
              <div className="space-y-6">
                {expenseItems.map((id, index) => (
                  <div key={id} className="border rounded-lg bg-white p-5">
                    <div className="flex justify-between items-center mb-3">
                      <h1 className="text-xl font-medium text-gray-700">
                        Expense {index + 2}
                      </h1>

                      <Button
                        type="button"
                        onClick={() => deleteItem(id)}
                        className="p-2 rounded-md bg-white-200 hover:bg-red-200 text-red-600 hover:text-red-700 shadow-sm transition duration-200 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    {/* Expense Type, Date, Amount */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {columns.map((col) => {
                        if (
                          !col.visible ||
                          !["dropdown", "date", "number"].includes(col.type) ||
                          col.key === "approver" ||
                          !defaultSystemFields.includes(col.key)
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
                                <span className="text-red-500 ml-1 text-sm">
                                  *
                                </span>
                              )}
                            </Label>

                            {/* Dropdown */}
                            {col.type === "dropdown" && col.options && (
                              <>
                                <Select
                                  value={
                                    getExpenseItemValue(id, "expense_type") !==
                                      undefined &&
                                    getExpenseItemValue(id, "expense_type") !==
                                      null
                                      ? String(
                                          getExpenseItemValue(
                                            id,
                                            "expense_type"
                                          )
                                        )
                                      : undefined
                                  }
                                  onValueChange={(value) =>
                                    handleExpenseItemChange(
                                      id,
                                      "expense_type",
                                      value
                                    )
                                  }
                                >
                                  <SelectTrigger
                                    id={col.key}
                                    className={`w-full ${
                                      errors[col.key]
                                        ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                        : ""
                                    }`}
                                  >
                                    <SelectValue placeholder="Select expense type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {col.options.map((option: any) => {
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
                                    })}
                                  </SelectContent>
                                </Select>
                                {errors[col.key] && (
                                  <p className="text-red-500 text-sm">
                                    {errors[col.key]}
                                  </p>
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
                                  value={getExpenseItemValue(id, "date")}
                                  onChange={(e) =>
                                    handleExpenseItemChange(
                                      id,
                                      "date",
                                      e.target.value
                                    )
                                  }
                                  className={`w-full ${
                                    errors[col.key]
                                      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                      : ""
                                  }`}
                                  min={
                                    selectedEvent
                                      ? selectedEvent.start_date.split("T")[0]
                                      : undefined
                                  }
                                  max={
                                    selectedEvent
                                      ? selectedEvent.end_date.split("T")[0]
                                      : undefined
                                  }
                                />
                                {errors[col.key] && (
                                  <p className="text-red-500 text-sm">
                                    {errors[col.key]}
                                  </p>
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
                                  value={getExpenseItemValue(id, "amount")}
                                  onChange={(e) =>
                                    handleExpenseItemChange(
                                      id,
                                      "amount",
                                      parseFloat(e.target.value)
                                    )
                                  }
                                  className={`w-full ${
                                    errors[col.key]
                                      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                      : ""
                                  }`}
                                />
                                {errors[col.key] && (
                                  <p className="text-red-500 text-sm">
                                    {errors[col.key]}
                                  </p>
                                )}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Description (full width) */}
                    {columns.map((col) => {
                      if (
                        !col.visible ||
                        col.type !== "textarea" ||
                        col.key === "approver" ||
                        !defaultSystemFields.includes(col.key)
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
                              <span className="text-red-500 ml-1 text-sm">
                                *
                              </span>
                            )}
                          </Label>
                          <Textarea
                            id={col.key}
                            name={col.key}
                            value={getExpenseItemValue(id, "description")}
                            onChange={(e) =>
                              handleExpenseItemChange(
                                id,
                                "description",
                                e.target.value
                              )
                            }
                            className={`w-full min-h-[50px] ${
                              errors[col.key]
                                ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                : ""
                            }`}
                            placeholder="Brief description of this expense report..."
                          />
                          {errors[col.key] && (
                            <p className="text-red-500 text-sm">
                              {errors[col.key]}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {/* Text and Number Fields (e.g., New, New One) */}
                    {customFields.map((col) => {
                      if (
                        !col.visible ||
                        ![
                          "text",
                          "number",
                          "date",
                          "textarea",
                          "dropdown",
                          "radio",
                          "checkbox",
                        ].includes(col.type)
                      )
                        return null;

                      return (
                        <div key={col.key} className="space-y-2 mt-5">
                          <Label
                            htmlFor={col.key}
                            className="text-sm font-medium text-gray-700"
                          >
                            {col.label}
                            {col.required && (
                              <span className="text-red-500 ml-1 text-sm">
                                *
                              </span>
                            )}
                          </Label>
                          {col.type === "text" && (
                            <Input
                              id={col.key}
                              name={col.key}
                              type={col.type}
                              value={
                                getExpenseItemValue(
                                  id,
                                  col.key as keyof ExpenseItemData
                                ) || ""
                              }
                              onChange={(e) =>
                                handleExpenseItemChange(
                                  id,
                                  col.key as keyof ExpenseItemData,
                                  e.target.value
                                )
                              }
                              className={`w-full ${
                                errors[col.key]
                                  ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                  : ""
                              }`}
                              placeholder={`Enter ${col.label}`}
                            />
                          )}
                          {col.type === "number" && (
                            <Input
                              id={col.key}
                              name={col.key}
                              type={col.type}
                              value={
                                getExpenseItemValue(
                                  id,
                                  col.key as keyof ExpenseItemData
                                ) || ""
                              }
                              onChange={(e) =>
                                handleExpenseItemChange(
                                  id,
                                  col.key as keyof ExpenseItemData,
                                  col.type === "number"
                                    ? parseFloat(e.target.value)
                                    : e.target.value
                                )
                              }
                              className={`w-full ${
                                errors[col.key]
                                  ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                  : ""
                              }`}
                              placeholder={`Enter ${col.label}`}
                            />
                          )}
                          {col.type === "date" && (
                            <Input
                              id={col.key}
                              name={col.key}
                              type="date"
                              value={
                                getExpenseItemValue(
                                  id,
                                  col.key as keyof ExpenseItemData
                                ) || ""
                              }
                              onChange={(e) =>
                                handleExpenseItemChange(
                                  id,
                                  col.key as keyof ExpenseItemData,
                                  e.target.value
                                )
                              }
                              className={`w-full ${
                                errors[col.key]
                                  ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                  : ""
                              }`}
                            />
                          )}
                          {col.type === "textarea" && (
                            <Textarea
                              id={col.key}
                              name={col.key}
                              value={
                                getExpenseItemValue(
                                  id,
                                  col.key as keyof ExpenseItemData
                                ) || ""
                              }
                              onChange={(e) =>
                                handleExpenseItemChange(
                                  id,
                                  col.key as keyof ExpenseItemData,
                                  e.target.value
                                )
                              }
                              className={`w-full min-h-[75px] ${
                                errors[col.key]
                                  ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                  : ""
                              }`}
                              placeholder="Brief description of this expense report..."
                            />
                          )}
                          {col.type === "dropdown" && col.options && (
                            <>
                              <Select
                                value={String(
                                  getExpenseItemValue(
                                    id,
                                    col.key as keyof ExpenseItemData
                                  ) || ""
                                )}
                                onValueChange={(value: string) =>
                                  handleExpenseItemChange(
                                    id,
                                    col.key as keyof ExpenseItemData,
                                    value
                                  )
                                }
                              >
                                <SelectTrigger
                                  id={col.key}
                                  className={`w-full ${
                                    errors[col.key]
                                      ? "border-red-500 focus:border-red-500 focus:ring-red-500"
                                      : ""
                                  }`}
                                >
                                  <SelectValue placeholder="Please Select" />
                                </SelectTrigger>
                                <SelectContent>
                                  {col.options.map((option: any) => {
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
                                  })}
                                </SelectContent>
                              </Select>
                            </>
                          )}

                          {col.type === "radio" && col.options && (
                            <div className="space-y-1">
                              {col.options.map((option: any) => {
                                const value =
                                  typeof option === "string"
                                    ? option
                                    : option.value;
                                const label =
                                  typeof option === "string"
                                    ? option
                                    : option.label;
                                const currentValue = getExpenseItemValue(
                                  id,
                                  col.key as keyof ExpenseItemData
                                );
                                const selectedRadioValue =
                                  typeof currentValue === "string" ||
                                  typeof currentValue === "number"
                                    ? String(currentValue)
                                    : "";
                                return (
                                  <div
                                    key={value}
                                    className="flex items-center space-x-2"
                                  >
                                    <input
                                      type="radio"
                                      id={`${col.key}-${value}-${id}`} // Include itemId in id for uniqueness
                                      name={`${col.key}-${id}`} // Include itemId in name to create separate radio groups
                                      value={value}
                                      checked={
                                        getExpenseItemValue(
                                          id,
                                          col.key as keyof ExpenseItemData
                                        ) === value
                                      }
                                      onChange={() =>
                                        handleExpenseItemChange(
                                          id,
                                          col.key as keyof ExpenseItemData,
                                          value
                                        )
                                      }
                                      className="h-4 w-4 text-blue-600 border-gray-300"
                                    />
                                    <label
                                      htmlFor={`${col.key}-${value}-${id}`}
                                      className="text-sm text-gray-700"
                                    >
                                      {label}
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {col.type === "checkbox" && col.options && (
                            <div className="space-y-2">
                              {col.options.map((option: any) => {
                                const value =
                                  typeof option === "string"
                                    ? option
                                    : option.value;
                                const label =
                                  typeof option === "string"
                                    ? option
                                    : option.label;

                                // Get current selected values (as an array)
                                const rawValue = getExpenseItemValue(
                                  id,
                                  col.key as keyof ExpenseItemData
                                );
                                const selectedValues: string[] = Array.isArray(
                                  rawValue
                                )
                                  ? rawValue
                                  : [];

                                const isChecked =
                                  selectedValues.includes(value);

                                const handleCheckboxChange = (
                                  checked: boolean
                                ) => {
                                  const updatedValues = checked
                                    ? [...selectedValues, value]
                                    : selectedValues.filter((v) => v !== value);

                                  handleExpenseItemChange(
                                    id,
                                    col.key as keyof ExpenseItemData,
                                    updatedValues
                                  );
                                };

                                return (
                                  <div
                                    key={value}
                                    className="flex items-center space-x-2"
                                  >
                                    <input
                                      type="checkbox"
                                      id={`${col.key}-${value}`}
                                      name={`${col.key}-${value}`}
                                      checked={isChecked}
                                      onChange={(e) =>
                                        handleCheckboxChange(e.target.checked)
                                      }
                                      className="h-4 w-4 text-blue-600 border-gray-300 rounded"
                                    />
                                    <label
                                      htmlFor={`${col.key}-${value}`}
                                      className="text-sm text-gray-700"
                                    >
                                      {label}
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                          )}
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
                      return null;
                    })}

                    {/* Receipt Upload */}
                    <div className="space-y-2 mt-5">
                      <Label className="text-sm font-medium text-gray-700">
                        Receipt
                      </Label>

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
                            checked={voucherModalOpenMap[id] || false}
                            className="cursor-pointer"
                            onCheckedChange={() => toggleVoucherModal(id)}
                            id={`voucher-switch-${id}`}
                          />
                        </div>

                        {!voucherModalOpenMap[id] && (
                          <div className="mt-4">
                            <Label
                              htmlFor="receipt"
                              className="text-sm font-medium text-gray-700"
                            >
                              Receipt{" "}
                              <span className="text-red-500 ml-0.5">*</span>
                            </Label>
                            <div className="mt-2">
                              <Input
                                id="receipt"
                                name="receipt"
                                type="file"
                                onChange={(e) => handleFileChanges(e, id)}
                                required={!voucherModalOpenMap[index]}
                                aria-invalid={
                                  errors["receipt"] ? "true" : "false"
                                }
                                aria-describedby={
                                  errors["receipt"]
                                    ? "receipt-error"
                                    : undefined
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
                                {receiptFiles[id] && receiptFiles[id].name
                                  ? receiptFiles[id].name
                                  : "No file chosen"}
                              </div>
                            </div>
                            {receiptPreviews[id] && (
                              <div className="mt-2">
                                {receiptPreviews[id].startsWith(
                                  "data:image"
                                ) ? (
                                  <img
                                    src={receiptPreviews[id]}
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

                      {voucherModalOpenMap[id] && (
                        <VoucherForm
                          formData={voucherDataMap[id] || {}}
                          onInputChange={(key, value) => {
                            setVoucherDataMap((prev) => ({
                              ...prev,
                              [id]: {
                                ...prev[id],
                                [key]: value,
                              },
                            }));
                            // Sync back to expense item if voucher date changes
                            if (key === "date") {
                              setExpenseItemsData((prev) => ({
                                ...prev,
                                [id]: {
                                  ...prev[id],
                                  date: value,
                                },
                              }));
                            }
                          }}
                          userRole={userRole}
                          savedUserSignature={savedUserSignature}
                          selectedEvent={
                            selectedEvent
                              ? {
                                  start_date: selectedEvent.start_date,
                                  end_date: selectedEvent.end_date,
                                }
                              : undefined
                          }
                          errors={errors}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              type="button"
              onClick={addItem}
              variant="neutral"
              className="cursor-pointer"
            >
              ➕ Add Another Expense Item
            </Button>

            {/* Expense Signature Section - Only shown when voucher is not open */}
            {(() => {
              // Only show the signature section if *none* of the vouchers are open (i.e., for the main expense form)
              const anyVoucherOpen =
                Object.values(voucherModalOpenMap).some(Boolean);
              if (!anyVoucherOpen) {
                return (
                  <div ref={creatorSigRef} className={`p-4 bg-gray-50/50 rounded-lg border space-y-4 ${creatorHighlight ? 'ring-2 ring-yellow-400 animate-pulse' : ''}`}>
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
                      formData.expense_signature_preview !==
                        savedUserSignature && (
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
