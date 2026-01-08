"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import {
  expenses,
  expenseHistory,
  profiles,
  vouchers,
  expenseEvents,
  voucherAttachments,
} from "@/lib/db";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  Check,
  X,
  FileText,
  AlertCircle,
  Pencil,
  Clock,
  Copy,
  Share2,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Download,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { PolicyAlert } from "@/components/policy-alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import supabase from "@/lib/supabase";
import ExpenseHistory from "./history/expense-history";
import { ExpenseComments } from "./history/expense-comments";
import SignaturePad from "@/components/SignatureCanvas";
import { getUserSignatureUrl, saveUserSignature } from "@/lib/utils";
import { generateVoucherPdf } from "@/app/actions/generateVoucherPdf";
import { useAuthStore } from "@/store/useAuthStore";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate } from "@/lib/utils";
import { ExpenseStatusBadge } from "@/components/ExpenseStatusBadge";

// Utility function to convert image URL to base64
async function convertImageUrlToBase64(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.crossOrigin = "Anonymous";
    img.onload = function () {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context not available"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      try {
        const dataURL = canvas.toDataURL("image/png");
        resolve(dataURL.replace(/^data:image\/(png|jpg);base64,/, ""));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = function (err) {
      reject(err);
    };
    img.src = url;
  });
}

// Add type augmentation for jsPDF
declare module "jspdf" {
  interface jsPDF {
    autoTable: typeof autoTable;
    lastAutoTable: {
      finalY: number;
    };
  }
}

// Import Policy type but use Supabase directly for policies
interface Policy {
  id: string;
  org_id: string;
  expense_type: string;
  per_unit_cost: string | null;
  upper_limit: number | null;
  eligibility: string | null;
  conditions: string | null;
  created_at: string;
  updated_at: string;
}

// Helper function to get signature URL from different buckets
async function getSignatureUrl(path: string): Promise<string | null> {
  if (!path) return null;

  // Try voucher-signatures bucket first
  try {
    const { data, error } = await supabase.storage
      .from("voucher-signatures")
      .createSignedUrl(path, 3600);

    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  } catch (e) {
    console.log("Error in voucher-signatures bucket:", e);
  }

  // Then try user-signatures bucket
  try {
    const { data, error } = await supabase.storage
      .from("user-signatures")
      .createSignedUrl(path, 3600);

    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  } catch (e) {
    console.log("Error in user-signatures bucket:", e);
  }

  return null;
}

export default function ViewExpensePage() {
  const router = useRouter();
  const params = useParams();
  const { organization, userRole } = useOrgStore();
  const { user } = useAuthStore();
  const orgId = organization?.id!;
  const expenseId = params.id as string;
  const slug = params.slug as string;
  const searchParams = useSearchParams();
  const eventIdFromQuery = searchParams.get("eventId");
  const fromTab = searchParams.get("fromTab");
  const nextId = searchParams.get("nextId"); // Next pending expense ID for sequential approval

  const [loading, setLoading] = useState(true);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [expense, setExpense] = useState<any>(null);
  const [hasVoucher, setHasVoucher] = useState(false);
  const [relevantPolicy, setRelevantPolicy] = useState<Policy | null>(null);
  const [isOverPolicy, setIsOverPolicy] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [customAmount, setCustomAmount] = useState<string>("");
  const [showCustomAmountInput, setShowCustomAmountInput] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [approverSignatureUrl, setApproverSignatureUrl] = useState<
    string | null
  >(null);
  const [loadingSignature, setLoadingSignature] = useState(true);
  const [savedUserSignature, setSavedUserSignature] = useState<string | null>(
    null
  );
  const [expenseSignature, setExpenseSignature] = useState<string | undefined>(
    undefined
  );
  const [eventTitle, setEventTitle] = useState<string | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({
    event_id: eventIdFromQuery || "",
  });
  const [customFields, setCustomFields] = useState<any[]>([]);
  const [descriptionText, setDescriptionText] = useState<string>("");
  const [savingDescription, setSavingDescription] = useState<boolean>(false);
  const [descriptionEditing, setDescriptionEditing] = useState<boolean>(false);
  const [shareLink, setShareLink] = useState<string>("");
  const [sharingReceipt, setSharingReceipt] = useState(false);
  const [sharingVoucher, setSharingVoucher] = useState(false);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(
    null
  );
  const [isReceiptPaneOpen, setIsReceiptPaneOpen] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [voucherDetails, setVoucherDetails] = useState<any | null>(null);
  const [voucherSignatureUrl, setVoucherSignatureUrl] = useState<string | null>(
    null
  );
  const [voucherAttachmentUrl, setVoucherAttachmentUrl] = useState<
    string | null
  >(null);
  const [voucherAttachmentFilename, setVoucherAttachmentFilename] = useState<
    string | null
  >(null);
  const [voucherPreviewLoading, setVoucherPreviewLoading] = useState(false);
  const [isVoucherPaneOpen, setIsVoucherPaneOpen] = useState(false);

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

  useEffect(() => {
    async function fetchOrgSettings() {
      const { data, error } = await supabase
        .from("org_settings")
        .select("expense_columns")
        .eq("org_id", organization?.id)
        .single();

      if (error) {
        console.error("Error fetching custom fields:", error);
        return;
      }

      if (data?.expense_columns) {
        setCustomFields(data.expense_columns);
      }
    }

    if (organization?.id) {
      fetchOrgSettings();
    }
  }, [organization?.id]);

  // Fetch the current user ID when the component mounts
  useEffect(() => {
    async function getCurrentUser() {
      const userID = JSON.parse(localStorage.getItem("auth-storage") || "{}")
        .state?.user?.id;

      const { data: userData, error } = await profiles.getById(userID);
      if (error) {
        console.error("Error fetching user:", error);
        return;
      }

      const url = await getSignatureUrl(userData.signature_url);
      setApproverSignatureUrl(url);

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUserId(session.user.id);
      }
    }

    getCurrentUser();
  }, []);

  useEffect(() => {
    async function fetchExpense() {
      try {
        // Fetch the expense
        const { data, error } = await expenses.getById(expenseId);
        if (error) {
          toast.error("Failed to load expense", {
            description: error.message,
          });
          router.push(`/org/${slug}/expenses`);
          return;
        }

        setExpense(data);
        // initialize editable description state
        const d: any = data;
        const desc =
          (d.custom_fields && d.custom_fields.description) ||
          d.description ||
          "";
        setDescriptionText(desc);

        // Fetch related event title if linked
        if (data.event_id) {
          try {
            const { data: eventData } = await expenseEvents.getById(
              data.event_id
            );
            if (eventData?.title) {
              setEventTitle(eventData.title);
            }
          } catch (e) {
            console.warn("Failed to fetch event for expense", e);
          }
        } else {
          setEventTitle(null);
        }

        // Fetch approver signature URL if approver_id exists
        if (data.approver_id) {
          const { data: approverProfile, error: approverError } =
            await profiles.getById(data.approver_id);
          if (!approverError && approverProfile?.signature_url) {
            const url = await getSignatureUrl(approverProfile.signature_url);
            if (url) {
              setApproverSignatureUrl(url);
            }
          }
        }

        // If expense has signature_url, try to get the signature
        if (data.signature_url) {
          const url = await getSignatureUrl(data.signature_url);
          if (url) {
            setSignatureUrl(url);
          }
        }

        // Fetch all policies for the organization using Supabase directly
        const { data: policiesData, error: policiesError } = await supabase
          .from("policies")
          .select("*")
          .eq("org_id", orgId)
          .order("created_at", { ascending: true });

        if (!policiesError && policiesData) {
          // Find the policy that matches this expense type
          const matchingPolicy = policiesData.find(
            (p) => p.expense_type === data.expense_type
          );

          if (matchingPolicy) {
            setRelevantPolicy(matchingPolicy);

            // Check if expense exceeds policy limit
            if (
              matchingPolicy.upper_limit &&
              data.amount > matchingPolicy.upper_limit
            ) {
              setIsOverPolicy(true);
            }
          }
        }

        // Check if this expense has a voucher
        const { data: voucherData, error: voucherError } = await supabase
          .from("vouchers")
          .select("id, signature_url")
          .eq("expense_id", expenseId)
          .maybeSingle();

        if (!voucherError && voucherData) {
          setHasVoucher(true);

          // If no signature yet and voucher has signature_url, try to get it
          if (!signatureUrl && voucherData.signature_url) {
            const url = await getSignatureUrl(voucherData.signature_url);
            if (url) {
              setSignatureUrl(url);
            }
          }
        } else {
          setHasVoucher(false);
        }
      } catch (error) {
        console.error("Error fetching expense:", error);
        toast.error("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchExpense();
  }, [expenseId, router, slug, orgId]);

  useEffect(() => {
    let cancelled = false;

    const loadVoucherPreview = async () => {
      if (!hasVoucher) {
        setVoucherDetails(null);
        setVoucherSignatureUrl(null);
        setVoucherAttachmentUrl(null);
        setVoucherAttachmentFilename(null);
        setIsVoucherPaneOpen(false);
        return;
      }

      try {
        setVoucherPreviewLoading(true);
        const { data: voucherData, error } = await vouchers.getByExpenseId(
          expenseId
        );
        if (error || !voucherData) {
          if (!cancelled) {
            setVoucherDetails(null);
            setIsVoucherPaneOpen(false);
          }
          return;
        }

        if (cancelled) return;

        setVoucherDetails(voucherData);
        setIsVoucherPaneOpen(true); // open by default

        if (voucherData.signature_url) {
          const { url } = await vouchers.getSignatureUrl(
            voucherData.signature_url
          );
          if (!cancelled) setVoucherSignatureUrl(url || null);
        }

        if (
          (voucherData as any).attachment_url ||
          (voucherData as any).attachment
        ) {
          const attachmentValue =
            (voucherData as any).attachment_url ||
            (voucherData as any).attachment;
          const [filename, filePath] = String(attachmentValue).split(",");
          if (filePath) {
            const { url, error } = await voucherAttachments.getUrl(filePath);
            if (!cancelled) {
              setVoucherAttachmentUrl(!error ? url || null : null);
              setVoucherAttachmentFilename(filename || null);
            }
          }
        } else {
          if (!cancelled) {
            setVoucherAttachmentFilename(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Voucher preview load error:", err);
          setVoucherDetails(null);
          setIsVoucherPaneOpen(false);
        }
      } finally {
        if (!cancelled) {
          setVoucherPreviewLoading(false);
        }
      }
    };

    loadVoucherPreview();

    return () => {
      cancelled = true;
    };
  }, [hasVoucher, expenseId]);

  useEffect(() => {
    let isCancelled = false;

    const loadReceiptPreview = async () => {
      if (!expense?.receipt?.path) {
        setReceiptPreviewUrl(null);
        setIsReceiptPaneOpen(false);
        return;
      }

      try {
        setReceiptLoading(true);
        const { url, error } = await expenses.getReceiptUrl(
          expense.receipt.path
        );

        if (isCancelled) return;

        if (error || !url) {
          console.error("Error loading receipt preview:", error);
          setReceiptPreviewUrl(null);
          setIsReceiptPaneOpen(false);
          return;
        }

        setReceiptPreviewUrl(url);
        setIsReceiptPaneOpen(true); // open by default for quick access
      } catch (err) {
        if (!isCancelled) {
          console.error("Receipt preview error:", err);
          setReceiptPreviewUrl(null);
          setIsReceiptPaneOpen(false);
        }
      } finally {
        if (!isCancelled) {
          setReceiptLoading(false);
        }
      }
    };

    loadReceiptPreview();

    return () => {
      isCancelled = true;
    };
  }, [expense?.receipt?.path]);

  // Check if current user is the assigned approver
  const isAssignedApprover =
    expense?.approver_id && currentUserId
      ? expense.approver_id === currentUserId
      : false;

  // Handle custom amount approval
  const handleApproveCustomAmount = async () => {
    try {
      setUpdateLoading(true);

      // Check if user is the assigned approver
      if (!isAssignedApprover) {
        toast.error("You are not the assigned approver for this expense.");
        setUpdateLoading(false);
        return;
      }

      if (!customAmount || isNaN(Number(customAmount))) {
        toast.error("Please enter a valid amount");
        setUpdateLoading(false);
        return;
      }

      // Get current user ID
      if (!currentUserId) {
        throw new Error("User ID not found. Please log in again.");
      }

      const approvedAmount = parseFloat(customAmount);

      // Prepare update data
      const updateData = {
        status: "approved",
        approver_id: currentUserId,
        approved_amount: approvedAmount,
        manager_approve_time: new Date().toISOString(),
      };

      // Update with Supabase
      const { data, error } = await supabase
        .from("expense_new")
        .update(updateData)
        .eq("id", expenseId)
        .select()
        .single();

      if (error) {
        console.error("Error updating expense:", error);
        throw error;
      }

      // Save approver signature URL
      const { data: profileData, error: profileError } = await profiles.getById(
        currentUserId
      );
      if (!profileError && profileData?.signature_url) {
        await supabase
          .from("expense_new")
          .update({ approver_signature_url: profileData.signature_url })
          .eq("id", expenseId)
          .select()
          .single();
      }

      // Save approver signature to vouchers table
      const { data: voucher } = await supabase
        .from("vouchers")
        .select("id")
        .eq("expense_id", expenseId)
        .maybeSingle();

      if (voucher) {
        await supabase
          .from("vouchers")
          .update({ manager_signature_url: profileData.signature_url })
          .eq("id", voucher.id);
      }

      // Log the custom approval to history with improved username extraction
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

        await expenseHistory.addEntry(
          expenseId,
          currentUserId,
          userName,
          "approved",
          expense.status,
          `Approved with custom amount: ${approvedAmount}`
        );
      } catch (logError) {
        console.error("Error logging custom approval:", logError);
        // Fallback with unknown user
        await expenseHistory.addEntry(
          expenseId,
          currentUserId,
          "Unknown User",
          "approved",
          expense.status,
          `Approved with custom amount: ${approvedAmount}`
        );
      }

      // Notify expense creator via email
      try {
        const { data: creatorProfile } = await profiles.getById(
          expense.user_id
        );
        const { data: approverProfile } = await profiles.getById(
          currentUserId
        );
        if (creatorProfile?.email) {
          await fetch("/api/expenses/notify-creator", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expenseId,
              creatorEmail: creatorProfile.email,
              creatorName: creatorProfile.full_name,
              approverName: approverProfile?.full_name,
              orgName: organization?.name,
              slug,
              amount: expense.amount,
              approvedAmount,
              expenseType: expense.expense_type,
              status: "approved",
            }),
          });
        }
      } catch (e) {
        console.warn("Failed to send creator notification (custom)", e);
      }

      // Update local state
      setExpense({
        ...expense,
        status: "approved",
        approver_id: currentUserId,
        approved_amount: approvedAmount,
      });

      toast.success(
        `Expense has been approved with a custom amount of ${new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
        }).format(approvedAmount)}.
        Email notification has been sent to the expense creator.`
      );

      // Navigate back after a short delay
      setTimeout(() => {
        const tab = fromTab || "my";
        // Streamlined approval flow: if nextId exists and we're in pending tab, go to next expense
        if (tab === "pending" && nextId) {
          router.push(`/org/${slug}/expenses/${nextId}?fromTab=${tab}`);
        } else {
          router.push(`/org/${slug}/expenses?tab=${tab}`);
        }
      }, 1000);
    } catch (error: any) {
      console.error("Approval error:", error);
      toast.error("Failed to approve expense", {
        description: error.message,
      });
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleSaveDescription = async () => {
    try {
      if (!currentUserId) {
        toast.error("User not found. Please sign in again.");
        return;
      }

      if (currentUserId !== expense.user_id) {
        toast.error("Only the expense creator can edit the description.");
        return;
      }

      // Do not allow saving once finance approved
      if (expense.status === "finance_approved") {
        toast.error("Cannot edit description after finance approval.");
        return;
      }

      setSavingDescription(true);

      // Merge into custom_fields if present otherwise update description
            const newCustomFields = {
              ...(expense.custom_fields || {}),
              description: descriptionText,
            };
      
            const { data, error } = await expenses.update(expense.id, {
              custom_fields: newCustomFields,
            });

      if (error || !data) {
        console.error("Failed to save description:", error);
        toast.error("Failed to save description");
        return;
      }

      setExpense(data);
      toast.success("Description saved");
      setDescriptionEditing(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save description");
    } finally {
      setSavingDescription(false);
    }
  };
  // Main approve function with different approval types
  const handleApprove = async (approvalType?: "full" | "policy" | "custom") => {
    try {
      setUpdateLoading(true);

      if (approvalType === "custom") {
        // Just show the custom amount input
        setShowCustomAmountInput(true);
        setUpdateLoading(false);
        return;
      }

      // Get current user ID
      if (!currentUserId) {
        throw new Error("User ID not found. Please log in again.");
      }

      // Check if user is the assigned approver
      if (!isAssignedApprover) {
        toast.error("You are not the assigned approver for this expense.");
        setUpdateLoading(false);
        return;
      }

      // Not approving their own expense
      if (expense.user_id === currentUserId) {
        toast.error("You cannot approve your own expense.");
        setUpdateLoading(false);
        return;
      }

      if (!orgId) {
        toast.error("Organization ID is missing");
        return;
      }

      // Prepare update data
      let updateData: any = {
        status: "approved",
        approver_id: currentUserId,
        manager_approve_time: new Date().toISOString(),
      };

      // Set the approved_amount based on approval type
      if (approvalType === "policy" && relevantPolicy?.upper_limit) {
        updateData.approved_amount = relevantPolicy.upper_limit;
      } else if (approvalType === "full") {
        updateData.approved_amount = expense.amount;
      } else {
        // Default case - full approval
        updateData.approved_amount = expense.amount;
      }

      // Update with Supabase
      const { data, error } = await supabase
        .from("expense_new")
        .update(updateData)
        .eq("id", expenseId)
        .select()
        .single();

      if (error) {
        console.error("Error updating expense:", error);
        throw error;
      }

      // Save approver signature URL to the expense if available
      const authRaw = localStorage.getItem("auth-storage") || "{}";
      const authStorage = JSON.parse(authRaw);
      const approverId = authStorage?.state?.user?.id;

      if (approverId) {
        const { data: profileData, error: profileError } =
          await profiles.getById(approverId);

        if (!profileError && profileData?.signature_url) {
          await supabase
            .from("expense_new")
            .update({ approver_signature_url: profileData.signature_url })
            .eq("id", expenseId)
            .select()
            .single();
        }

        // Save approver signature to vouchers table
        const { data: voucher } = await supabase
          .from("vouchers")
          .select("id")
          .eq("expense_id", expenseId)
          .maybeSingle();

        if (voucher) {
          await supabase
            .from("vouchers")
            .update({ manager_signature_url: profileData.signature_url })
            .eq("id", voucher.id);
        }
      }

      // Log the approval to history with improved username extraction
      try {
        const authRaw = localStorage.getItem("auth-storage");
        // console.log("Auth raw:", authRaw);
        const authStorage = JSON.parse(authRaw || "{}");

        // Log all possible paths to help debug
        // console.log("Full auth storage object:", authStorage);
        // console.log("State:", authStorage.state);
        // console.log("User:", authStorage.state?.user);
        // console.log("Profile direct:", authStorage.state?.user?.profile);

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

        const noteText =
          approvalType === "policy"
            ? "Approved as per policy limit"
            : approvalType === "full"
            ? "Approved with full amount"
            : "Expense approved";

        await expenseHistory.addEntry(
          expenseId,
          currentUserId,
          userName,
          "approved",
          expense.status,
          noteText
        );
      } catch (logError) {
        console.error("Error logging approval:", logError);
        // Fallback with unknown user
        await expenseHistory.addEntry(
          expenseId,
          currentUserId,
          "Unknown User",
          "approved",
          expense.status,
          approvalType === "policy"
            ? "Approved as per policy limit"
            : approvalType === "full"
            ? "Approved with full amount"
            : "Expense approved"
        );
      }

      // Notify expense creator via email
      try {
        const { data: creatorProfile } = await profiles.getById(
          expense.user_id
        );
        const { data: approverProfile } = await profiles.getById(
          currentUserId
        );
        if (creatorProfile?.email) {
          await fetch("/api/expenses/notify-creator", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expenseId,
              creatorEmail: creatorProfile.email,
              creatorName: creatorProfile.full_name,
              approverName: approverProfile?.full_name,
              orgName: organization?.name,
              slug,
              amount: expense.amount,
              approvedAmount: updateData.approved_amount,
              expenseType: expense.expense_type,
              status: "approved",
            }),
          });
        }
      } catch (e) {
        console.warn("Failed to send creator notification (approve)", e);
      }

      // Update local state
      setExpense({
        ...expense,
        status: "approved",
        approver_id: currentUserId,
        approved_amount: updateData.approved_amount,
      });

      toast.success(
        approvalType === "policy"
          ? "Expense has been approved as per the policy limit. Email notification has been sent to the expense creator."
          : approvalType === "full"
            ? "Expense has been approved for the full amount. Email notification has been sent to the expense creator."
            : "Expense has been approved successfully."
      );

      // Navigate back after a short delay
      setTimeout(() => {
        const tab = fromTab || "my";
        // Streamlined approval flow: if nextId exists and we're in pending tab, go to next expense
        if (tab === "pending" && nextId) {
          router.push(`/org/${slug}/expenses/${nextId}?fromTab=${tab}`);
        } else {
          router.push(`/org/${slug}/expenses?tab=${tab}`);
        }
      }, 1000);
    } catch (error: any) {
      console.error("Approval error:", error);
      toast.error("Failed to approve expense", {
        description: error.message,
      });
    } finally {
      setUpdateLoading(false);
    }
  };
  // Handle rejection
  const handleReject = async () => {
    try {
      setUpdateLoading(true);

      // Get current user ID
      if (!currentUserId) {
        throw new Error("User ID not found. Please log in again.");
      }

      // Check if user is the assigned approver
      if (!isAssignedApprover) {
        toast.error("You are not the assigned approver for this expense.");
        setUpdateLoading(false);
        return;
      }

      if (expense.user_id === currentUserId) {
        toast.error("You cannot reject your own expense.");
        setUpdateLoading(false);
        return;
      }

      // Prepare update data
      const updateData = {
        status: "rejected",
        approver_id: currentUserId,
      };

      // Directly update with Supabase to bypass any permission issues
      const { data, error } = await supabase
        .from("expense_new")
        .update(updateData)
        .eq("id", expenseId)
        .select()
        .single();

      if (error) {
        console.error("Error rejecting expense:", error);
        throw error;
      }

      // Log the rejection to history with improved username extraction
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

        await expenseHistory.addEntry(
          expenseId,
          currentUserId,
          userName,
          "rejected",
          expense.status,
          "rejected"
        );
      } catch (logError) {
        console.error("Error logging rejection:", logError);
        // Fallback with unknown user
        await expenseHistory.addEntry(
          expenseId,
          currentUserId,
          "Unknown User",
          "rejected",
          expense.status,
          "rejected"
        );
      }

      // Notify expense creator via email (rejected)
      try {
        const { data: creatorProfile } = await profiles.getById(
          expense.user_id
        );
        const { data: approverProfile } = await profiles.getById(
          currentUserId
        );
        if (creatorProfile?.email) {
          await fetch("/api/expenses/notify-creator", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              expenseId,
              creatorEmail: creatorProfile.email,
              creatorName: creatorProfile.full_name,
              approverName: approverProfile?.full_name,
              orgName: organization?.name,
              slug,
              amount: expense.amount,
              expenseType: expense.expense_type,
              status: "rejected",
            }),
          });
        }
      } catch (e) {
        console.warn("Failed to send creator notification (reject)", e);
      }

      // Update local state
      setExpense({
        ...expense,
        status: "rejected",
        approver_id: currentUserId,
      });

      toast.success("Expense has been rejected successfully. Email notification has been sent to the expense creator.");

      // Navigate back after a short delay
      setTimeout(() => {
        const tab = fromTab || "my";
        // For rejection, always go back to list (no sequential flow)
        router.push(`/org/${slug}/expenses?tab=${tab}`);
      }, 1000);
    } catch (error: any) {
      console.error("Rejection error:", error);
      toast.error("Failed to reject expense", {
        description: error.message,
      });
    } finally {
      setUpdateLoading(false);
    }
  };
  const handleViewReceipt = async () => {
    if (expense.receipt?.path) {
      try {
        if (receiptPreviewUrl) {
          window.open(receiptPreviewUrl, "_blank");
          return;
        }

        setReceiptLoading(true);
        const { url, error } = await expenses.getReceiptUrl(
          expense.receipt.path
        );
        if (error) {
          console.error("Error getting receipt URL:", error);
          toast.error("Failed to load receipt");
          return;
        }
        if (url) {
          setReceiptPreviewUrl(url);
          window.open(url, "_blank");
        }
      } catch (err) {
        console.error("Error opening receipt:", err);
        toast.error("Failed to open receipt");
      } finally {
        setReceiptLoading(false);
      }
    }
  };

  const handleSaveSignature = async (dataUrl: string) => {
    // Only save to profile if this is a new signature (not the saved one)
    try {
      if (!user?.id || !organization?.id) {
        toast.error("Missing user or organization ID");
        return;
      }

      // Use the comprehensive function that handles both upload and profile update
      const { success, path, error } = await saveUserSignature(
        dataUrl,
        user?.id,
        organization?.id
      );

      if (error || !success) {
        console.error("Error saving signature:", error);
        toast.error("Could not save your signature for future use");
        return;
      }

      toast.success("Your signature has been saved for future use");

      // Refresh the saved signature URL
      const { url } = await getUserSignatureUrl(user?.id);
      if (url) {
        setApproverSignatureUrl(url);
      }
    } catch (error) {
      console.error("Unexpected error saving signature:", error);
      toast.error("An error occurred while saving your signature");
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

  const receiptFileName = expense.receipt?.filename || expense.receipt?.path;
  const isReceiptPdf =
    typeof receiptFileName === "string" &&
    receiptFileName.toLowerCase().endsWith(".pdf");

  // Helper function to format field names
  const formatFieldName = (name: string) => {
    return name
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  // Get expense title for display
  const getExpenseTitle = () => {
    if (expense.custom_fields && expense.custom_fields.title) {
      return expense.custom_fields.title;
    }
    return expense.creator?.full_name
      ? `Expense Details ${expense.creator.full_name}`
      : "Expense Details";
  };

  // Format checkbox or multi-select values safely
  const formatFieldValue = (val: any): string => {
    if (val === undefined || val === null) return "—";

    // Array case: ["option 1", "option 2"]
    if (Array.isArray(val)) {
      return val.sort().join(", ");
    }

    // String case: "box 1box 2box 3" or "option1option2"
    if (typeof val === "string") {
      const matches = val.match(/(box\s*\d+|option\s*\d+)/gi);
      if (matches) {
        return matches.sort().join(", ");
      }
      return val; // fallback for normal text
    }

    return String(val);
  };

  // Receipt share function
  const handleShareReceipt = async () => {
    setShareLink("");
    setSharingReceipt(true);
    if (expense.receipt?.path) {
      try {
        const { url, error } = await expenses.getReceiptUrl(
          expense.receipt.path
        );
        if (error || !url) {
          toast.error("Failed to generate shareable link");
          return;
        }
        setShareLink(url); // input box me dikhane ke liye
        toast.success(
          "Receipt link generated. Copy the link below and share it."
        );
      } catch (err) {
        console.error("Receipt share error:", err);
        toast.error("Failed to generate shareable link");
      } finally {
        setSharingReceipt(false);
      }
    }
  };

  // Voucher share function
  const handleShareVoucher = async () => {
    setShareLink("");
    setSharingVoucher(true);
    try {
      // 1) Get voucher for this expense
      const { data: voucherRow, error: voucherErr } =
        await vouchers.getByExpenseId(expense.id);

      if (voucherErr || !voucherRow) {
        toast.error("Voucher not found for this expense");
        return;
      }

      let pdfPath = voucherRow.pdf_path as string | null | undefined;

      // 2) If PDF not generated yet, trigger server action
      if (!pdfPath) {
        try {
          const result = await generateVoucherPdf(voucherRow.id);
          if (!result.success) {
            throw new Error(result.error || "Failed to generate voucher PDF");
          }
          if (result.url) {
            setShareLink(result.url);
            toast.success(
              "Voucher link generated. Copy the link below and share it."
            );
            return;
          }
          pdfPath = result.path;
        } catch (e) {
          console.error("Generate PDF error:", e);
          toast.error("Failed to generate voucher PDF");
          return;
        }
      }

      if (!pdfPath) {
        toast.error("Voucher PDF path not available");
        return;
      }

      // 3) Create a signed URL from voucher-pdfs bucket
      const { url, error: urlErr } = await vouchers.getPdfUrl(pdfPath);
      if (urlErr || !url) {
        toast.error("Failed to create voucher share link");
        return;
      }

      setShareLink(url);
      toast.success(
        "Voucher link generated. Copy the link below and share it."
      );
    } catch (err) {
      console.error("Voucher share error:", err);
      toast.error("Something went wrong while sharing voucher");
    } finally {
      setSharingVoucher(false);
    }
  };

  const handleDownloadPDF = async () => {
    try {
      // Fetch voucher data first
      const { data: voucher, error: voucherError } =
        await vouchers.getByExpenseId(expenseId);

      if (voucherError || !voucher) {
        toast.error("Voucher not found for this expense");
        return;
      }

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const margin = 20; // outer margin
      const padding = 10; // inner padding inside border

      // ===== Outer rounded border (card) =====
      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      doc.roundedRect(
        margin,
        margin,
        pageWidth - margin * 2,
        pageHeight - margin * 2,
        0,
        0
      );

      // ===== Header =====
      let y = margin + padding;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(0, 0, 0);
      doc.text("EXPENSE VOUCHER", pageWidth / 2, y, { align: "center" });

      y += 8;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(15);
      doc.setTextColor(80, 80, 80);
      doc.text(
        `Organization: ${organization?.name || "Navgurukul"}`,
        pageWidth / 2,
        y,
        { align: "center" }
      );

      // Voucher ID (left) + Created At (right) in same row
      y += 10;
      doc.setFont("helvetica", "bolditalic");
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);

      // Left aligned (Voucher ID)
      doc.text(`Voucher ID: ${voucher.id}`, margin + padding, y);

      // Right aligned (Created At)
      doc.text(
        `Created At: ${formatDate(voucher.created_at)}`,
        pageWidth - margin - padding,
        y,
        { align: "right" }
      );

      // Divider (full width black line)
      y += 6;
      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageWidth - margin, y);

      // ===== Table =====
      const startY = y + 8;
      const amountString = `INR ${Number(voucher.amount || 0).toFixed(2)}`;
      const body = [
        ["Name", voucher.your_name || "—"],
        ["Amount", amountString],
        ["Date", formatDate(expense.date)],
        ["Credit Person", voucher.credit_person || "—"],
        ["Approver", expense.approver?.full_name || "—"],
        ["Purpose", voucher.purpose || "—"],
        [
          "Signature",
          signatureUrl ? "Digital signature attached below" : "Not available",
        ],
      ];

      autoTable(doc, {
        startY,
        head: [["Details", "Information"]],
        body,
        margin: { left: margin + padding, right: margin + padding },
        styles: {
          fontSize: 11,
          cellPadding: 4,
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
          textColor: [30, 30, 30],
        },
        headStyles: {
          fillColor: [45, 45, 45],
          textColor: 255,
          fontStyle: "bold",
          halign: "left",
        },
        alternateRowStyles: { fillColor: [246, 246, 246] },
        columnStyles: {
          0: { cellWidth: 60, fontStyle: "bold" },
          1: { cellWidth: pageWidth - (margin + padding) * 2 - 60 },
        },
        // Amount in green + bold
        didParseCell: (d) => {
          if (
            d.section === "body" &&
            d.row.index === 1 &&
            d.column.index === 1
          ) {
            d.cell.styles.textColor = [0, 0, 0];
            d.cell.styles.fontStyle = "bold";
          }
        },
      });

      y = (doc as any).lastAutoTable.finalY + 15;

      // ===== Signature Section =====
      // Divider above DIGITAL SIGNATURE:
      doc.setDrawColor(0);
      doc.setLineWidth(0.2);
      doc.line(margin + padding, y, pageWidth - margin - padding, y);

      y += 8;

      // Section title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text("DIGITAL SIGNATURE:", margin + padding, y);

      y += 6;

      if (signatureUrl) {
        try {
          const base64 = await convertImageUrlToBase64(signatureUrl);

          // Desired max size
          const maxW = 80; // signature max width
          const maxH = 15; // signature max height

          // Add image with preserved aspect ratio
          doc.addImage(base64, "PNG", margin + padding + 4, y + 4, maxW, maxH);

          // Dashed box that wraps the signature (just bigger than image)
          const boxW = maxW + 8;
          const boxH = maxH + 8;
          doc.setLineWidth(0.3);
          doc.setDrawColor(150);
          (doc as any).setLineDash?.([2, 2], 0);
          doc.rect(margin + padding, y, boxW, boxH);
          (doc as any).setLineDash?.([]);
        } catch {
          // If image fails → show dashed placeholder with text
          const boxW = 120;
          const boxH = 30;
          doc.setLineWidth(0.3);
          doc.setDrawColor(150);
          (doc as any).setLineDash?.([2, 2], 0);
          doc.rect(margin + padding, y, boxW, boxH);
          (doc as any).setLineDash?.([]);

          doc.setFont("helvetica", "italic");
          doc.setFontSize(10);
          doc.setTextColor(150, 150, 150);
          doc.text("Signature unavailable", margin + padding + 6, y + 15);
        }
      } else {
        // No signature at all → placeholder box with text
        const boxW = 120;
        const boxH = 30;
        doc.setLineWidth(0.3);
        doc.setDrawColor(150);
        (doc as any).setLineDash?.([2, 2], 0);
        doc.rect(margin + padding, y, boxW, boxH);
        (doc as any).setLineDash?.([]);

        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        doc.text("Signature Not Available", margin + padding + 6, y + 15);
      }

      // ===== Footer Note (always at bottom inside border) =====
      const bottomFooterY = pageHeight - margin - 14;
      // Divider line
      doc.setDrawColor(120);
      doc.setLineWidth(0.2);
      doc.line(
        margin + padding,
        bottomFooterY,
        pageWidth - margin - padding,
        bottomFooterY
      );

      doc.setFont("helvetica", "italic");
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);

      doc.text(
        "This is a computer-generated voucher and is valid without physical signature.",
        pageWidth / 2,
        pageHeight - margin - 6, // always just above bottom border
        { align: "center" }
      );

      // Save file
      doc.save(`voucher_${voucher.id}.pdf`);
      toast.success("PDF downloaded successfully");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to download PDF");
    }
  };

  return (
    <div className="container mx-auto py-6">
      <div className="mb-4">
        <Button
          variant="link"
          onClick={() => router.push(`/org/${slug}/expenses`)}
        >
          <ArrowLeft />
          Back to Expenses
        </Button>
      </div>

      {/* Added more margin to the policy alert banner */}
      {isOverPolicy && relevantPolicy && (
        <div className="mb-6">
          <PolicyAlert expense={expense} policy={relevantPolicy} />
        </div>
      )}

      {userRole !== "member" && expense.status === "submitted" && (
        <div className="flex items-center space-x-2 mb-6 px-1">
          {!isAssignedApprover && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-md">
              <p className="text-sm text-amber-800">
                ⚠️ You are not the assigned approver for this expense. Only the
                assigned approver can approve or reject this request.
              </p>
            </div>
          )}
          {showCustomAmountInput ? (
            <div className="flex items-center space-x-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2">
                  ₹
                </span>
                <Input
                  type="number"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  className="pl-8 pr-3 py-2"
                  placeholder="Enter amount"
                />
              </div>
              <Button
                onClick={handleApproveCustomAmount}
                className="bg-[#0353a4] hover:bg-[#02458b] text-white"
                disabled={updateLoading || !customAmount || !isAssignedApprover}
              >
                {updateLoading ? (
                  <Spinner size="sm" className="mr-2" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Confirm
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowCustomAmountInput(false)}
                disabled={updateLoading}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={updateLoading || !isAssignedApprover}
                size="sm"
              >
                {updateLoading ? <Spinner size="sm" className="mr-2" /> : <X />}
                Reject
              </Button>

              {isOverPolicy ? (
                <>
                  <Button
                    onClick={() => handleApprove("policy")}
                    variant="success"
                    disabled={updateLoading || !isAssignedApprover}
                  >
                    {updateLoading ? (
                      <Spinner size="sm" className="mr-2" />
                    ) : (
                      <Check />
                    )}
                    Approve as per policy
                  </Button>

                  <Button
                    onClick={() => handleApprove("full")}
                    variant="warning"
                    disabled={updateLoading || !isAssignedApprover}
                  >
                    {updateLoading ? (
                      <Spinner size="sm" className="mr-2" />
                    ) : (
                      <Check />
                    )}
                    Approve full amount
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleApprove("custom")}
                    disabled={updateLoading || !isAssignedApprover}
                    size="sm"
                  >
                    {updateLoading ? (
                      <Spinner size="sm" className="mr-2" />
                    ) : (
                      <Pencil />
                    )}
                    Custom amount
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    onClick={() => handleApprove("full")}
                    variant="default"
                    disabled={updateLoading || !isAssignedApprover}
                    size="sm"
                  >
                    {updateLoading ? (
                      <Spinner size="sm" className="mr-2" />
                    ) : (
                      <Check />
                    )}
                    Approve
                  </Button>
                  <Button
                    onClick={() => handleApprove("custom")}
                    variant="secondary"
                    disabled={updateLoading || !isAssignedApprover}
                  >
                    {updateLoading ? (
                      <Spinner size="sm" className="mr-2" />
                    ) : (
                      <Pencil />
                    )}
                    Custom amount
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Adjusted grid - added gap-6 to create more space between card */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Main content - takes slightly more than 3/4 of the space */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle>Expense Details </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Expense Type
                  </p>
                  <p>{expense.expense_type}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Event Name
                  </p>
                  <p>{eventTitle || "N/A"}</p>
                </div>
                {/* ✅ Add this block to show Location */}
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Location
                  </p>
                  <p>{expense.location || "N/A"}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Unique ID
                  </p>
                  <div className="flex items-center space-x-2">
                    <p className="font-mono">{expense.unique_id || "N/A"}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Amount
                  </p>
                  <p className={isOverPolicy ? "text-red-600 font-medium" : ""}>
                    {new Intl.NumberFormat("en-IN", {
                      style: "currency",
                      currency: "INR",
                    }).format(expense.amount)}
                    {isOverPolicy && (
                      <span className="ml-2 text-sm text-red-600">
                        (Exceeds policy)
                      </span>
                    )}
                  </p>
                </div>

                {/* Show approved amount if it exists */}
                {expense.approved_amount !== null &&
                  expense.approved_amount !== undefined && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Approved Amount
                      </p>
                      <p className="text-green-600 font-medium">
                        {new Intl.NumberFormat("en-IN", {
                          style: "currency",
                          currency: "INR",
                        }).format(expense.approved_amount)}
                      </p>
                    </div>
                  )}

                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Date
                  </p>
                  <p>{new Date(expense.date).toLocaleDateString("en-GB")}</p>
                </div>

                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Status
                  </p>
                  <p
                    className={`${
                      expense.status === "approved"
                        ? "text-green-600"
                        : expense.status === "rejected"
                        ? "text-red-600"
                        : "text-amber-600"
                    }`}
                  >
                    {expense.status.charAt(0).toUpperCase() +
                      expense.status.slice(1)}
                  </p>
                </div>

                {expense.approver && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Approver
                    </p>
                    <p>{expense.approver.full_name || "—"}</p>
                  </div>
                )}

                {relevantPolicy && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Policy Limit
                    </p>
                    <p>
                      {new Intl.NumberFormat("en-IN", {
                        style: "currency",
                        currency: "INR",
                      }).format(relevantPolicy.upper_limit || 0)}
                    </p>
                  </div>
                )}
              </div>
              {/* Finance Rejected Comment */}
              {expense.status === "finance_rejected" &&
                expense.finance_comment && (
                  <div className="mt-1 text-sm">
                    <span className="block font-medium text-muted-foreground">
                      Finance Comment
                    </span>
                    <span>{expense.finance_comment}</span>
                  </div>
                )}

              {/* Receipt section with View Receipt button */}
              <div>
                {!expense.receipt && !hasVoucher && (
                  <p className="text-muted-foreground">
                    No receipt or voucher available
                  </p>
                )}

                {expense.receipt && (
                  <div className="mt-4 rounded-lg border border-gray-200 bg-white">
                    <div className="border-b px-4 py-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <FileText className="mt-0.5 h-5 w-5 text-blue-600" />
                          <div>
                            <p className="text-base font-semibold">
                              Receipt Preview
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Opens by default for quick review
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="cursor-pointer"
                                  onClick={() =>
                                    setIsReceiptPaneOpen((prev) => !prev)
                                  }
                                  aria-label={
                                    isReceiptPaneOpen
                                      ? "Hide receipt preview"
                                      : "Show receipt preview"
                                  }
                                >
                                  {isReceiptPaneOpen ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>
                                  {isReceiptPaneOpen
                                    ? "Hide receipt preview"
                                    : "Show receipt preview"}
                                </p>
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="cursor-pointer"
                                  onClick={handleShareReceipt}
                                  aria-label="Share receipt"
                                  disabled={sharingReceipt}
                                >
                                  {sharingReceipt ? (
                                    <Spinner size="sm" className="h-4 w-4" />
                                  ) : (
                                    <Share2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>Share receipt</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>

                      {/* Share link section for receipt */}
                      {shareLink && (
                        <div className="flex items-center space-x-2 mt-3">
                          <Input
                            value={shareLink}
                            readOnly
                            className="flex-1"
                          />
                          <Button
                            className="cursor-pointer"
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              navigator.clipboard.writeText(shareLink);
                              toast.success("Link copied to clipboard");
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            className="cursor-pointer"
                            variant="outline"
                            size="icon"
                            onClick={() => setShareLink("")}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {isReceiptPaneOpen && (
                      <div className="p-4">
                        {receiptLoading ? (
                          <div className="flex h-64 items-center justify-center">
                            <Spinner size="lg" />
                          </div>
                        ) : receiptPreviewUrl ? (
                          isReceiptPdf ? (
                            <div
                              className="rounded-md border bg-white overflow-hidden"
                              style={{ height: "500px" }}
                            >
                              <iframe
                                src={`${receiptPreviewUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                                className="h-full w-full border-none"
                                title="Receipt PDF Preview"
                              />
                            </div>
                          ) : (
                            <div
                              className="overflow-y-auto rounded-md border bg-muted"
                              style={{ height: "auto" }}
                            >
                              <img
                                src={receiptPreviewUrl}
                                alt={
                                  expense.receipt.filename || "Receipt preview"
                                }
                                className="w-full object-contain"
                              />
                            </div>
                          )
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Receipt preview not available right now.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {voucherDetails && (
                  <div className="mt-4 rounded-lg border border-gray-200 bg-white">
                    <div className="border-b px-4 py-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <FileText className="mt-0.5 h-5 w-5 text-blue-600" />
                          <div>
                            <p className="text-base font-semibold">
                              Voucher Preview
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Opens by default for quick review
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="cursor-pointer"
                                  onClick={() =>
                                    setIsVoucherPaneOpen((prev) => !prev)
                                  }
                                  aria-label={
                                    isVoucherPaneOpen
                                      ? "Hide voucher preview"
                                      : "Show voucher preview"
                                  }
                                >
                                  {isVoucherPaneOpen ? (
                                    <EyeOff className="h-4 w-4" />
                                  ) : (
                                    <Eye className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>
                                  {isVoucherPaneOpen
                                    ? "Hide voucher preview"
                                    : "Show voucher preview"}
                                </p>
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="cursor-pointer"
                                  onClick={handleShareVoucher}
                                  aria-label="Share voucher"
                                  disabled={sharingVoucher}
                                >
                                  {sharingVoucher ? (
                                    <Spinner size="sm" className="h-4 w-4" />
                                  ) : (
                                    <Share2 className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>Share voucher</p>
                              </TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="cursor-pointer"
                                  onClick={handleDownloadPDF}
                                  aria-label="Download voucher as PDF"
                                >
                                  <Download className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>Download voucher as PDF</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>

                      {/* Share link section - shows below the header when share is clicked */}
                      {shareLink && (
                        <div className="flex items-center space-x-2 mt-3">
                          <Input
                            value={shareLink}
                            readOnly
                            className="flex-1"
                          />
                          <Button
                            className="cursor-pointer"
                            variant="outline"
                            size="icon"
                            onClick={() => {
                              navigator.clipboard.writeText(shareLink);
                              toast.success("Link copied to clipboard");
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            className="cursor-pointer"
                            variant="outline"
                            size="icon"
                            onClick={() => setShareLink("")}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {isVoucherPaneOpen && (
                      <div className="space-y-4 p-4">
                        {voucherPreviewLoading ? (
                          <div className="flex h-64 items-center justify-center">
                            <Spinner size="lg" />
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <p className="text-sm text-muted-foreground">
                                  Your Name
                                </p>
                                <p className="font-medium">
                                  {voucherDetails.your_name ||
                                    expense.creator?.full_name ||
                                    "—"}
                                </p>
                              </div>
                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-sm text-muted-foreground">
                                    Amount
                                  </p>
                                  <ExpenseStatusBadge status={expense.status} />
                                </div>
                                <p className="font-medium">
                                  {new Intl.NumberFormat("en-IN", {
                                    style: "currency",
                                    currency: "INR",
                                  }).format(
                                    voucherDetails.amount || expense.amount
                                  )}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">
                                  Date
                                </p>
                                <p className="font-medium">
                                  {new Date(expense.date).toLocaleDateString(
                                    "en-GB"
                                  )}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">
                                  Credit Person
                                </p>
                                <p className="font-medium">
                                  {voucherDetails.credit_person || "—"}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm text-muted-foreground">
                                  Approver
                                </p>
                                <p className="font-medium">
                                  {expense.approver?.full_name || "—"}
                                </p>
                              </div>
                              <div className="md:col-span-2">
                                <p className="text-sm text-muted-foreground">
                                  Purpose
                                </p>
                                <div className="mt-1 rounded-md border bg-gray-50 px-3 py-2 text-sm">
                                  {voucherDetails.purpose || "—"}
                                </div>
                              </div>
                            </div>

                            <div>
                              <p className="text-sm text-muted-foreground mb-2">
                                Signature
                              </p>
                              {voucherSignatureUrl ? (
                                <div className="border rounded-md p-3 bg-white">
                                  <img
                                    src={voucherSignatureUrl}
                                    alt="Voucher signature"
                                    className="max-h-28 mx-auto"
                                  />
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">
                                  Signature not available
                                </p>
                              )}
                            </div>

                            {voucherAttachmentUrl && (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-sm font-medium">
                                    Attachment
                                  </p>
                                </div>
                                {voucherAttachmentFilename &&
                                voucherAttachmentFilename
                                  .toLowerCase()
                                  .endsWith(".pdf") ? (
                                  <div
                                    className="rounded-md border bg-white overflow-hidden"
                                    style={{ height: "500px" }}
                                  >
                                    <iframe
                                      src={`${voucherAttachmentUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                                      className="h-full w-full border-none"
                                      title="Attachment PDF Preview"
                                    />
                                  </div>
                                ) : (
                                  <div className="rounded-md border bg-muted">
                                    <img
                                      src={voucherAttachmentUrl}
                                      alt="Voucher attachment preview"
                                      className="max-h-[500px] w-full object-contain"
                                    />
                                  </div>
                                )}
                              </div>
                            )}

                            {!voucherAttachmentUrl && (
                              <div className="flex gap-1">
                                <p className="text-sm font-medium">
                                  Attachment :{" "}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Not Available
                                </p>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Signature Section - Add this section to show the signature */}
              {signatureUrl && (
                <div className="mt-6">
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    Signature
                  </p>
                  <div className="border rounded-md p-4 bg-white">
                    <img
                      src={signatureUrl}
                      alt="Signature"
                      className="max-h-24 mx-auto"
                    />
                  </div>
                </div>
              )}

              {/* Show approver signature section only if current user is the approver */}
              {currentUserId === expense.approver_id && (
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
                      Approver Signature <span className="text-red-500">*</span>
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
              )}

              {/* Custom fields section */}
              {/* Description: editable by creator until finance approves */}
              <div className="mt-4">
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  Description
                </p>
                {(() => {
                  const canEdit =
                    currentUserId === expense.user_id &&
                    expense.status !== "finance_approved";

                  if (canEdit) {
                    if (descriptionEditing) {
                      return (
                        <div className="space-y-2">
                          <Textarea
                            value={descriptionText}
                            onChange={(e) => setDescriptionText(e.target.value)}
                            placeholder="Add a description..."
                            className="w-full"
                            rows={4}
                          />
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={handleSaveDescription}
                              disabled={savingDescription}
                            >
                              {savingDescription ? (
                                <Spinner size="sm" className="mr-2" />
                              ) : (
                                "Save"
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setDescriptionText(
                                  (expense.custom_fields && expense.custom_fields.description) || expense.description || ""
                                );
                                setDescriptionEditing(false);
                              }}
                              disabled={savingDescription}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="mt-1 rounded-md border bg-gray-50 px-3 py-2 text-sm flex items-start justify-between">
                        <div className="flex-1 pr-2">{descriptionText || "—"}</div>
                        <div>
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="cursor-pointer"
                                  onClick={() => setDescriptionEditing(true)}
                                  aria-label="Edit description"
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>Edit description</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="mt-1 rounded-md border bg-gray-50 px-3 py-2 text-sm">
                      {descriptionText || "—"}
                    </div>
                  );
                })()}
                <p className="text-sm text-muted-foreground">
                  Allow the description to be editable before Finance approves the expense.
                </p>
              </div>
              {expense.custom_fields &&
                Object.keys(expense.custom_fields).length > 0 &&
                customFields.length > 0 && ( // make sure customFields are loaded
                  <div className="grid grid-cols-2 gap-4 mt-4 break-words">
                    {Object.entries(expense.custom_fields)
                          .filter(([key]) =>
                            key !== "location_of_expense" &&
                            key !== "Location of Expense" &&
                            key.toLowerCase() !== "location_of_expense" &&
                            key.toLowerCase() !== "description"
                          ) // Exclude Location Of Expense and description
                      .map(([key, value]) => {
                        const matchedField = customFields.find(
                          (field) => field.key === key
                        );
                        return (
                          <div key={key}>
                            <p className="text-sm font-medium text-muted-foreground">
                              {matchedField?.label || formatFieldName(key)}
                            </p>
                            <p>
                              {value !== undefined && value !== ""
                                ? formatFieldValue(value)
                                : "—"}
                            </p>
                          </div>
                        );
                      })}
                  </div>
                )}
            </CardContent>
          </Card>

        </div>

        {/* Activity History - Takes 2 columns of the 5-column grid to be wider */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center">
              <Clock className="h-5 w-5 mr-2 text-muted-foreground" />
              <CardTitle>Activity History</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[500px] overflow-auto">
              <ExpenseHistory expenseId={expenseId} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <ExpenseComments expenseId={expense.id} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
