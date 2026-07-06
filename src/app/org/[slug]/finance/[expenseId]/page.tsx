"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  expenses,
  expenseEvents,
  expenseHistory,
  auth,
  profiles,
  organizations,
  orgSettings,
} from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { ExpenseStatusBadge } from "@/components/ExpenseStatusBadge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FileText, Clock, ArrowLeft, Pencil, Save } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { DetailTableSkeleton } from "@/components/ui/detail-table-skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import ExpenseHistory from "../../expenses/[id]/history/expense-history";
import { ExpenseComments } from "../../expenses/[id]/history/expense-comments";
import ReceiptPreview from "@/components/ReceiptPreview";
import VoucherPreview from "@/components/VoucherPreview";

import supabase from "@/lib/supabase"; // Make sure this is correctly imported

const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);
};

const calculateTdsAmount = (
  baseAmount: number | null | undefined,
  percentage: number | null | undefined
) => {
  if (!percentage || baseAmount === null || baseAmount === undefined) return null;
  const amount = (baseAmount * percentage) / 100;
  return Number(amount.toFixed(2));
};

const calculateActualAmount = (
  baseAmount: number | null | undefined,
  tdsAmount: number | null | undefined,
  securityDepositAmount: number | null | undefined
) => {
  if (baseAmount === null || baseAmount === undefined) return null;
  const amount =
    Number(baseAmount) - (tdsAmount ?? 0) - (securityDepositAmount ?? 0);
  return Number(amount.toFixed(2));
};

const normalizeCustomFieldKey = (key: string) =>
  key.toLowerCase().replace(/[\s_-]+/g, "");

const getCustomFieldValue = (
  customFields: unknown,
  targetKey: string
): string | null => {
  if (!customFields) return null;

  let parsedCustomFields: unknown = customFields;
  if (typeof parsedCustomFields === "string") {
    try {
      parsedCustomFields = JSON.parse(parsedCustomFields);
    } catch {
      return null;
    }
  }

  if (!parsedCustomFields || typeof parsedCustomFields !== "object") return null;

  const fields = parsedCustomFields as Record<string, unknown>;
  const normalizedTargetKey = normalizeCustomFieldKey(targetKey);

  for (const [key, value] of Object.entries(fields)) {
    if (normalizeCustomFieldKey(key) === normalizedTargetKey) {
      if (typeof value === "string") return value;
      if (value === null || value === undefined) return null;
      return String(value);
    }
  }

  return null;
};

const parseDropdownOptions = (options: unknown): string[] => {
  if (!Array.isArray(options) || options.length === 0) return [];

  if (typeof options[0] === "object" && options[0] !== null) {
    return (options as Array<{ label?: string; value?: string }>)
      .map((option) => String(option.label ?? option.value ?? "").trim())
      .filter(Boolean);
  }

  return options.map((option) => String(option ?? "").trim()).filter(Boolean);
};

const updateLocationCustomFields = (
  customFields: unknown,
  locationValue: string | null
) => {
  let parsedFields: Record<string, unknown> = {};

  if (customFields && typeof customFields === "object" && !Array.isArray(customFields)) {
    parsedFields = { ...(customFields as Record<string, unknown>) };
  } else if (typeof customFields === "string") {
    try {
      const parsed = JSON.parse(customFields);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        parsedFields = { ...(parsed as Record<string, unknown>) };
      }
    } catch {
      parsedFields = {};
    }
  }

  const locationKeyNorm = normalizeCustomFieldKey("location_of_expense");
  Object.keys(parsedFields).forEach((key) => {
    if (normalizeCustomFieldKey(key) === locationKeyNorm) {
      delete parsedFields[key];
    }
  });

  if (locationValue) {
    parsedFields["Location of Expense"] = locationValue;
  }

  return parsedFields;
};

export default function FinanceExpenseDetails() {
  const params = useParams();
  const { expenseId } = useParams();
  const searchParams = useSearchParams();

  const slug = params.slug as string;
  const router = useRouter();

  const [expense, setExpense] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [tdsUpdating, setTdsUpdating] = useState(false);
  const [securityDepositUpdating, setSecurityDepositUpdating] = useState(false);
  const [securityDepositInput, setSecurityDepositInput] = useState("");
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [comment, setComment] = useState("");
  const [hasVoucher, setHasVoucher] = useState(false);
  const [eventTitle, setEventTitle] = useState<string | null>(null);
  const [isEditingDetails, setIsEditingDetails] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [expenseTypeOptions, setExpenseTypeOptions] = useState<string[]>([]);
  const [eventOptions, setEventOptions] = useState<{ id: string; title: string }[]>(
    []
  );
  const [editForm, setEditForm] = useState({
    unique_id: "",
    location: "",
    event_id: "",
    expense_type: "",
    amount: "",
    approved_amount: "",
  });
  const highlightId =
    searchParams.get("expID") || (typeof expenseId === "string" ? expenseId : null);
  const pageParam = searchParams.get("page");

  const backToApprovalQueueUrl = (() => {
    const params = new URLSearchParams();
    params.set("tab", "approvals");
    if (highlightId) params.set("expID", highlightId);
    if (pageParam) params.set("page", pageParam);
    return `/org/${slug}/finance?${params.toString()}`;
  })();

  useEffect(() => {
    const fetchExpense = async () => {
      if (!expenseId) return;
      const { data, error } = await expenses.getById(expenseId as string);
      if (error || !data) {
        toast.error("Failed to load expense details");
        setLoading(false);
        return;
      }

      const expenseData = { ...data };

      // Fetch related event title if any
      if (expenseData.event_id) {
        try {
          const { data: ev } = await expenseEvents.getById(
            expenseData.event_id
          );
          setEventTitle(ev?.title || null);
        } catch (e) {
          setEventTitle(null);
        }
      } else {
        setEventTitle(null);
      }

      // Resolve creator signature
      const signaturePath = expenseData.signature_url;
      if (signaturePath && !signaturePath.startsWith("http")) {
        const { data: sigData } = supabase.storage
          .from("user-signatures")
          .getPublicUrl(signaturePath);
        if (sigData?.publicUrl) {
          expenseData.signature_url = sigData.publicUrl;
        }
      }

      // Resolve approver signature
      const approverSignaturePath = expenseData.approver_signature_url;
      if (approverSignaturePath && !approverSignaturePath.startsWith("http")) {
        const { data: approverSigData } = supabase.storage
          .from("user-signatures")
          .getPublicUrl(approverSignaturePath);
        if (approverSigData?.publicUrl) {
          expenseData.approver_signature_url = approverSigData.publicUrl;
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
      }

      try {
        const { data: orgData } = await organizations.getBySlug(slug);
        const orgId = orgData?.id;

        if (orgId) {
          const [settingsRes, eventsRes] = await Promise.all([
            orgSettings.getByOrgId(orgId),
            expenseEvents.getByOrg(orgId),
          ]);

          if (settingsRes.data?.expense_columns) {
            const columns = settingsRes.data.expense_columns as any[];

            const locationColumn = columns.find(
              (col: any) => col.key === "location" || col.key === "location_of_expense"
            );
            const expenseTypeColumn = columns.find(
              (col: any) => col.key === "expense_type"
            );

            setLocationOptions(parseDropdownOptions(locationColumn?.options));
            setExpenseTypeOptions(parseDropdownOptions(expenseTypeColumn?.options));
          }

          if (eventsRes.data) {
            const options = eventsRes.data.map((event) => ({
              id: event.id,
              title: event.title,
            }));
            setEventOptions(options);

            if (expenseData.event_id) {
              const selectedEvent = options.find(
                (event) => event.id === expenseData.event_id
              );
              if (selectedEvent) {
                setEventTitle(selectedEvent.title);
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to load edit dropdown options:", err);
      }

      setExpense(expenseData);
      setLoading(false);
    };

    fetchExpense();
  }, [expenseId, slug]);

  useEffect(() => {
    const amount = expense?.security_deposit_amount;
    if (amount === null || amount === undefined) {
      setSecurityDepositInput("");
      return;
    }

    setSecurityDepositInput(String(amount));
  }, [expense?.id, expense?.security_deposit_amount]);

  const handleStartEdit = () => {
    if (!expense) return;

    setEditForm({
      unique_id: expense.unique_id ?? "",
      location: expense.location ?? "",
      event_id: expense.event_id ?? "",
      expense_type: expense.expense_type ?? "",
      amount:
        expense.amount !== null && expense.amount !== undefined
          ? String(expense.amount)
          : "",
      approved_amount:
        expense.approved_amount !== null && expense.approved_amount !== undefined
          ? String(expense.approved_amount)
          : "",
    });
    setIsEditingDetails(true);
  };

  const handleEditFieldChange = (field: keyof typeof editForm, value: string) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveDetails = async () => {
    if (!expense || typeof expenseId !== "string") return;

    const amountValue = Number(editForm.amount);
    const approvedAmountValue =
      editForm.approved_amount.trim() === ""
        ? null
        : Number(editForm.approved_amount);

    if (editForm.amount.trim() === "" || !Number.isFinite(amountValue)) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (
      editForm.approved_amount.trim() !== "" &&
      !Number.isFinite(approvedAmountValue as number)
    ) {
      toast.error("Please enter a valid approved amount");
      return;
    }

    const baseAmountForCalculations = approvedAmountValue ?? amountValue;
    const tdsPercentageValue = expense.tds_deduction_percentage
      ? Number(expense.tds_deduction_percentage)
      : null;
    const existingTdsAmount =
      expense.tds_deduction_amount !== null &&
      expense.tds_deduction_amount !== undefined
        ? Number(expense.tds_deduction_amount)
        : null;
    const recalculatedTdsAmount = tdsPercentageValue
      ? calculateTdsAmount(baseAmountForCalculations, tdsPercentageValue)
      : existingTdsAmount;
    const securityDepositAmount =
      expense.security_deposit_amount !== null &&
      expense.security_deposit_amount !== undefined
        ? Number(expense.security_deposit_amount)
        : null;
    // Calculate TDS on approved amount (if available) but deduct it from the original expense amount.
    const recalculatedActualAmount = calculateActualAmount(
      amountValue,
      recalculatedTdsAmount,
      securityDepositAmount
    );
    const locationValue = editForm.location.trim() || null;
    const updatedCustomFields = updateLocationCustomFields(
      expense.custom_fields,
      locationValue
    );

    const payload = {
      unique_id: editForm.unique_id.trim() || null,
      location: locationValue,
      event_id: editForm.event_id || null,
      expense_type: editForm.expense_type.trim() || null,
      amount: amountValue,
      approved_amount: approvedAmountValue,
      tds_deduction_amount: recalculatedTdsAmount,
      actual_amount: recalculatedActualAmount,
      custom_fields: updatedCustomFields,
    };

    setSavingDetails(true);

    const { error } = await supabase
      .from("expense_new")
      .update(payload)
      .eq("id", expenseId);

    if (error) {
      toast.error("Failed to save expense details", {
        description: error.message,
      });
      setSavingDetails(false);
      return;
    }

    const updatedEventTitle = payload.event_id
      ? eventOptions.find((event) => event.id === payload.event_id)?.title || null
      : null;

    setExpense((prev: any) =>
      prev
        ? {
            ...prev,
            ...payload,
          }
        : prev
    );
    setEventTitle(updatedEventTitle);
    setIsEditingDetails(false);
    setSavingDetails(false);
    toast.success("Expense details updated");
  };

  const handleFinanceApprove = async () => {
    setProcessing(true);
    const { error } = await expenses.updateByFinance(
      expenseId as string,
      true,
      "Approved by Finance"
    );
    if (error) {
      toast.error(error.message || "Approval failed", {
        description: (error as any).details || undefined,
      });
    } else {
      // Log history and notify creator
      try {
        const { data: userData } = await auth.getUser();
        const currentUserId = userData.user?.id || "";
        let userName = userData.user?.email || "Unknown User";
        if (currentUserId) {
          const profRes = await profiles.getByUserId(currentUserId);
          const fullName = (profRes as any)?.data?.full_name as
            | string
            | undefined;
          if (fullName) userName = fullName;
        }
        await expenseHistory.addEntry(
          expenseId as string,
          currentUserId,
          userName,
          "finance_approved",
          null,
          "Approved by Finance"
        );

        if (expense?.user_id) {
          const { data: creatorProfile } = await profiles.getById(
            expense.user_id
          );
          const { data: financeProfile } = currentUserId
            ? await profiles.getById(currentUserId)
            : { data: null };
          if (creatorProfile?.email) {
            await fetch("/api/expenses/notify-creator", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                expenseId,
                creatorEmail: creatorProfile.email,
                creatorName: creatorProfile.full_name,
                approverName: financeProfile?.full_name || userName,
                orgName: null,
                slug,
                amount: expense.amount,
                approvedAmount: expense.approved_amount ?? expense.amount,
                expenseType: expense.expense_type,
                status: "finance_approved",
                decisionStage: "finance",
              }),
            });
          }
        }
      } catch (logErr) {
        console.error("Failed to log finance_approved entry:", logErr);
      }
      toast.success("Approved by Finance. Email notification has been sent to the expense creator.");
      router.push(`/org/${slug}/finance?tab=approvals`);
    }
    setProcessing(false);
  };

  const handleFinanceReject = async () => {
    if (!comment.trim()) {
      toast.error("Please add a comment for rejection.");
      return;
    }

    setProcessing(true);
    const { error } = await expenses.updateByFinance(
      expenseId as string,
      false,
      comment
    );
    if (error) toast.error("Rejection failed");
    else {
      // Log history and notify creator
      try {
        const { data: userData } = await auth.getUser();
        const currentUserId = userData.user?.id || "";
        let userName = userData.user?.email || "Unknown User";
        if (currentUserId) {
          const profRes = await profiles.getByUserId(currentUserId);
          const fullName = (profRes as any)?.data?.full_name as
            | string
            | undefined;
          if (fullName) userName = fullName;
        }
        await expenseHistory.addEntry(
          expenseId as string,
          currentUserId,
          userName,
          "finance_rejected",
          null,
          comment || "Rejected by Finance"
        );

        if (expense?.user_id) {
          const { data: creatorProfile } = await profiles.getById(
            expense.user_id
          );
          const { data: financeProfile } = currentUserId
            ? await profiles.getById(currentUserId)
            : { data: null };
          if (creatorProfile?.email) {
            await fetch("/api/expenses/notify-creator", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                expenseId,
                creatorEmail: creatorProfile.email,
                creatorName: creatorProfile.full_name,
                approverName: financeProfile?.full_name || userName,
                orgName: null,
                slug,
                amount: expense.amount,
                approvedAmount: expense.approved_amount ?? expense.amount,
                expenseType: expense.expense_type,
                status: "finance_rejected",
                rejectionReason: comment,
                decisionStage: "finance",
              }),
            });
          }
        }
      } catch (logErr) {
        console.error("Failed to log finance_rejected entry:", logErr);
      }
      toast.success("Expense has been rejected by Finance. Email notification has been sent to the expense creator.");
      router.push(`/org/${slug}/finance?tab=approvals`);
    }
    setProcessing(false);
  };

  const handleTdsChange = async (value: string) => {
    if (!expense || typeof expenseId !== "string") return;
    const percentage = value ? Number.parseInt(value, 10) : null;
    const baseAmount = expense.approved_amount ?? expense.amount ?? 0;
    const tdsAmount = calculateTdsAmount(baseAmount, percentage);
    const securityDepositAmount =
      expense.security_deposit_amount !== null &&
      expense.security_deposit_amount !== undefined
        ? Number(expense.security_deposit_amount)
        : null;
    // Use original expense amount as the base for actual amount deduction
    const actualAmount = calculateActualAmount(
      expense.amount ?? 0,
      tdsAmount,
      securityDepositAmount
    );

    const prevExpense = expense;
    const updatedExpense = {
      ...expense,
      tds_deduction_percentage: percentage,
      tds_deduction_amount: tdsAmount,
      actual_amount: actualAmount,
    };

    setExpense(updatedExpense);
    setTdsUpdating(true);

    const { error } = await supabase
      .from("expense_new")
      .update({
        tds_deduction_percentage: percentage,
        tds_deduction_amount: tdsAmount,
        actual_amount: actualAmount,
      })
      .eq("id", expenseId);

    if (error) {
      setExpense(prevExpense);
      toast.error("Failed to update TDS deduction");
    }

    setTdsUpdating(false);
  };

  const handleSecurityDepositSave = async () => {
    if (!expense || typeof expenseId !== "string") return;

    const trimmedValue = securityDepositInput.trim();
    let securityDepositAmount: number | null = null;

    if (trimmedValue !== "") {
      const parsedAmount = Number(trimmedValue);
      if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
        toast.error("Please enter a valid non-negative Security Deposit amount");
        return;
      }
      securityDepositAmount = Number(parsedAmount.toFixed(2));
    }

    const baseAmount = expense.approved_amount ?? expense.amount ?? 0;
    const derivedTdsAmount =
      expense.tds_deduction_amount ??
      calculateTdsAmount(baseAmount, expense.tds_deduction_percentage);
    // Actual amount deduction must use the original expense amount
    const recalculatedActualAmount = calculateActualAmount(
      expense.amount ?? baseAmount,
      derivedTdsAmount,
      securityDepositAmount
    );

    const prevExpense = expense;
    const updatedExpense = {
      ...expense,
      security_deposit_amount: securityDepositAmount,
      actual_amount: recalculatedActualAmount,
    };

    setExpense(updatedExpense);
    setSecurityDepositUpdating(true);

    const { error } = await supabase
      .from("expense_new")
      .update({
        security_deposit_amount: securityDepositAmount,
        actual_amount: recalculatedActualAmount,
      })
      .eq("id", expenseId);

    if (error) {
      setExpense(prevExpense);
      toast.error("Failed to update Security Deposit");
    }

    setSecurityDepositUpdating(false);
  };

  if (!loading && !expense) {
    return <div className="p-6 text-red-600">Expense not found</div>;
  }

  const tdsPercentage = expense?.tds_deduction_percentage ?? null;
  const isDirectPayment =
    String(expense?.unique_id || "")
      .trim()
      .toLowerCase()
      .includes("direct payment");
  const tdsBaseAmount = expense?.approved_amount ?? expense?.amount ?? null;
  const tdsAmount = tdsPercentage
    ? expense?.tds_deduction_amount ??
      calculateTdsAmount(tdsBaseAmount, tdsPercentage)
    : expense?.tds_deduction_amount ?? null;
  const securityDepositAmount =
    expense?.security_deposit_amount !== null &&
    expense?.security_deposit_amount !== undefined
      ? Number(expense.security_deposit_amount)
      : null;
  const actualAmount =
    expense?.actual_amount ??
    calculateActualAmount(expense?.approved_amount ?? tdsBaseAmount, tdsAmount, securityDepositAmount);
  const expenseCreditPerson =
    expense?.expense_credit_person ||
    getCustomFieldValue(expense?.custom_fields, "expense_credit_person") ||
    "N/A";
  const locationDropdownOptions = Array.from(
    new Set([
      ...locationOptions,
      ...(expense?.location ? [String(expense.location)] : []),
    ])
  ).filter(Boolean);
  const expenseTypeDropdownOptions = Array.from(
    new Set([
      ...expenseTypeOptions,
      ...(expense?.expense_type ? [String(expense.expense_type)] : []),
    ])
  ).filter(Boolean);
  const eventDropdownOptions = (() => {
    const allOptions = [...eventOptions];
    if (
      expense?.event_id &&
      !allOptions.some((event) => event.id === expense.event_id)
    ) {
      allOptions.unshift({
        id: expense.event_id,
        title: eventTitle || "Selected Event",
      });
    }
    return allOptions;
  })();

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Button
          variant="link"
          onClick={() => router.push(backToApprovalQueueUrl)}
          className="text-sm cursor-pointer"
          disabled={loading}
        >
          <ArrowLeft />
          Back to Approval Queue
        </Button>
        {!loading && (
          <div className="flex gap-2">
            <Button
              onClick={handleFinanceApprove}
              disabled={processing}
              variant="success"
              className="cursor-pointer"
            >
              Approve
            </Button>
            <Button
              onClick={() => setShowCommentBox(true)}
              disabled={processing}
              variant="destructive"
              className="cursor-pointer"
            >
              Reject
            </Button>
          </div>
        )}
      </div>

      {/* Show message if expense is created using Advance Unique ID */}
      {expense && expense.unique_id &&
        (expense.unique_id.toLowerCase().startsWith("advance_") ||
          expense.unique_id.startsWith("Advance_")) && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-sm text-black-800">
              ℹ️ This expense was created using Advance Unique ID: <span className="font-mono font-semibold">{expense.unique_id}</span>
            </p>
          </div>
        )}

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-6">
        {/* Expense Details */}
        <div className="space-y-6 md:col-span-4">
          <div className="bg-white p-6 rounded shadow border">
            <div className="mb-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <h2 className="card-title">Expense Details</h2>
                <div className="flex items-center gap-1 shrink-0">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleStartEdit}
                        disabled={
                          loading ||
                          processing ||
                          tdsUpdating ||
                          securityDepositUpdating ||
                          savingDetails ||
                          isEditingDetails
                        }
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Edit expense details</p>
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleSaveDetails}
                        disabled={
                          loading ||
                          processing ||
                          tdsUpdating ||
                          securityDepositUpdating ||
                          savingDetails ||
                          !isEditingDetails
                        }
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Save expense details</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Editable access - Click the edit icon to make changes and the save icon to update.
              </p>
            </div>
            {loading ? (
              <Table>
                <TableBody>
                  <DetailTableSkeleton rows={12} />
                </TableBody>
              </Table>
            ) : (
              <Table>
                <TableBody>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableCell>{formatDateTime(expense.created_at)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Unique ID</TableHead>
                    <TableCell>
                      {isEditingDetails ? (
                        <Input
                          value={editForm.unique_id}
                          onChange={(e) =>
                            handleEditFieldChange("unique_id", e.target.value)
                          }
                          placeholder="Enter unique ID"
                          disabled={savingDetails}
                          className="max-w-xs"
                        />
                      ) : (
                        expense.unique_id || "N/A"
                      )}
                    </TableCell>
                  </TableRow>
                  {isDirectPayment && (
                    <TableRow>
                      <TableHead>Expense Credit Person</TableHead>
                      <TableCell>{expenseCreditPerson}</TableCell>
                    </TableRow>
                  )}
                  <TableRow>
                    <TableHead>Project of Expense</TableHead>
                    <TableCell>
                      {isEditingDetails ? (
                        <select
                          className="border px-2 py-1 rounded bg-white text-sm max-w-xs"
                          value={editForm.location}
                          onChange={(e) =>
                            handleEditFieldChange("location", e.target.value)
                          }
                          disabled={savingDetails}
                        >
                          <option value="">Select location</option>
                          {locationDropdownOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        expense.location || "N/A"
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Event Name</TableHead>
                    <TableCell>
                      {isEditingDetails ? (
                        <select
                          className="border px-2 py-1 rounded bg-white text-sm max-w-xs"
                          value={editForm.event_id}
                          onChange={(e) =>
                            handleEditFieldChange("event_id", e.target.value)
                          }
                          disabled={savingDetails}
                        >
                          <option value="">Select event</option>
                          {eventDropdownOptions.map((event) => (
                            <option key={event.id} value={event.id}>
                              {event.title}
                            </option>
                          ))}
                        </select>
                      ) : (
                        eventTitle || "N/A"
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Expense Type</TableHead>
                    <TableCell>
                      {isEditingDetails ? (
                        <select
                          className="border px-2 py-1 rounded bg-white text-sm max-w-xs"
                          value={editForm.expense_type}
                          onChange={(e) =>
                            handleEditFieldChange("expense_type", e.target.value)
                          }
                          disabled={savingDetails}
                        >
                          <option value="">Select expense type</option>
                          {expenseTypeDropdownOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        expense.expense_type || "Not Provided"
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Invoice Amount</TableHead>
                    <TableCell>
                      {isEditingDetails ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editForm.amount}
                          onChange={(e) =>
                            handleEditFieldChange("amount", e.target.value)
                          }
                          disabled={savingDetails}
                          className="max-w-xs"
                        />
                      ) : (
                        `₹${expense.amount}`
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Approved Amount</TableHead>
                    <TableCell>
                      {isEditingDetails ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={editForm.approved_amount}
                          onChange={(e) =>
                            handleEditFieldChange("approved_amount", e.target.value)
                          }
                          disabled={savingDetails}
                          className="max-w-xs"
                        />
                      ) : (
                        formatCurrency(expense.approved_amount)
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>TDS Applicable Amount</TableHead>
                    <TableCell>
                      {tdsPercentage || (tdsAmount !== null && tdsAmount !== undefined)
                        ? formatCurrency(tdsBaseAmount)
                        : "N/A"}
                    </TableCell>
                  </TableRow>

                  <TableRow>
                    <TableHead>TDS Deduction</TableHead>
                    <TableCell>
                      <div className="flex flex-col items-start gap-2">
                        <Select
                          value={tdsPercentage ? String(tdsPercentage) : "none"}
                          onValueChange={(value) =>
                            handleTdsChange(value === "none" ? "" : value)
                          }
                          disabled={tdsUpdating || securityDepositUpdating || processing}
                        >
                          <SelectTrigger className="w-[110px] h-8 text-sm bg-white">
                            <SelectValue placeholder="Select %" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Select %</SelectItem>
                            {Array.from({ length: 50 }, (_, idx) => idx + 1).map(
                              (percent) => (
                                <SelectItem key={percent} value={String(percent)}>
                                  {percent}%
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground">
                          {tdsPercentage
                            ? `${tdsPercentage}% (${formatCurrency(tdsAmount)})`
                            : tdsAmount
                              ? formatCurrency(tdsAmount)
                              : "N/A"}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Security Deposit Deduction</TableHead>
                    <TableCell>
                      <div className="flex flex-col items-start gap-2">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            className="max-w-[140px]"
                            value={securityDepositInput}
                            onChange={(e) => setSecurityDepositInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleSecurityDepositSave();
                              }
                            }}
                            disabled={processing || tdsUpdating || securityDepositUpdating}
                            placeholder="Enter amount"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleSecurityDepositSave}
                            disabled={processing || tdsUpdating || securityDepositUpdating}
                          >
                            {securityDepositUpdating ? (
                              <Spinner size="sm" className="mr-2" />
                            ) : null}
                            Save
                          </Button>
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {securityDepositAmount !== null
                            ? formatCurrency(securityDepositAmount)
                            : "N/A"}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Net Payable Amount</TableHead>
                    <TableCell>{formatCurrency(actualAmount)}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableCell>
                      {new Date(expense.date).toLocaleDateString("en-IN")}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableCell>
                      <ExpenseStatusBadge status={expense.status} />
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Approver</TableHead>
                    <TableCell>{expense.approver?.full_name || "—"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Receipt/Voucher</TableHead>
                    <TableCell>
                      {hasVoucher
                        ? "Voucher Preview Below"
                        : expense?.receipt
                          ? "Receipt Preview Below"
                          : "N/A"}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableCell>
                      {expense.custom_fields?.description || "—"}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Signature</TableHead>
                    <TableCell>
                      {expense.signature_url ? (
                        <img
                          src={expense.signature_url}
                          alt="Signature"
                          className="h-16 object-contain border"
                        />
                      ) : (
                        "Not Available"
                      )}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Approver Signature</TableHead>
                    <TableCell>
                      {expense.approver_signature_url ? (
                        <img
                          src={expense.approver_signature_url}
                          alt="Approver Signature"
                          className="h-16 object-contain border"
                        />
                      ) : (
                        "Not Available"
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </div>

          {/* Receipt Preview (component) */}
          {expense?.receipt && <ReceiptPreview expense={expense} />}

          {/* Voucher Preview (component) */}
          {hasVoucher && (
            <VoucherPreview expense={expense} expenseId={typeof expenseId === "string" ? expenseId : ""} />
          )}
        </div>
        {/* Activity History */}
        <div className="md:col-span-3 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center">
              <Clock className="h-5 w-5 mr-2 text-muted-foreground" />
              <CardTitle>Activity History</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[500px] overflow-auto">
              {loading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-3/4" />
                    </div>
                  ))}
                </div>
              ) : (
                <ExpenseHistory
                  expenseId={typeof expenseId === "string" ? expenseId : ""}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-32 mb-4" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : (
                <ExpenseComments
                  expenseId={typeof expenseId === "string" ? expenseId : ""}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showCommentBox} onOpenChange={setShowCommentBox}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejection Reason</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this expense.
            </DialogDescription>
          </DialogHeader>

          <div className="w-full mt-2">
            <div className="border border-red-300 rounded p-3 space-y-2">
              <label className="block font-medium"></label>
              <Textarea
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Enter rejection reason..."
                className="w-full"
              />
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              className="cursor-pointer"
              onClick={() => setShowCommentBox(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleFinanceReject}
              disabled={processing}
              className="cursor-pointer"
            >
              Submit Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
