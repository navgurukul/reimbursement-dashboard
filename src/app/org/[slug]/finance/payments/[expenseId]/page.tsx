"use client";

import supabase from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  expenses,
  expenseEvents,
  expenseHistory,
  auth,
  profiles,
  vouchers,
  voucherAttachments,
} from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { ExpenseStatusBadge } from "@/components/ExpenseStatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Clock, Eye, EyeOff } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import ExpenseHistory from "../../../expenses/[id]/history/expense-history";
import { ExpenseComments } from "../../../expenses/[id]/history/expense-comments";

import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useOrgStore } from "@/store/useOrgStore";

export default function PaymentProcessingDetails() {
  const { expenseId } = useParams();
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const { organization } = useOrgStore();

  const [expense, setExpense] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hasVoucher, setHasVoucher] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [comment, setComment] = useState("");
  const [eventTitle, setEventTitle] = useState<string | null>(null);
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
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(
    null
  );
  const [isReceiptPaneOpen, setIsReceiptPaneOpen] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [isReceiptPdf, setIsReceiptPdf] = useState(false);

  useEffect(() => {
    const fetchExpense = async () => {
      if (!expenseId) return;
      const { data, error } = await expenses.getById(expenseId as string);
      if (error) toast.error("Failed to load expense details");
      else setExpense(data);

      // Fetch related event title if present
      if (data?.event_id) {
        try {
          const { data: ev } = await expenseEvents.getById(data.event_id);
          setEventTitle(ev?.title || null);
        } catch (e) {
          setEventTitle(null);
        }
      } else {
        setEventTitle(null);
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

      const expenseData = { ...data };
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
      setExpense(expenseData);
      setLoading(false);
    };
    fetchExpense();
  }, [expenseId]);

  // Load voucher preview
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
          expenseId as string
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

  // Load receipt preview
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

        // Detect if it's a PDF
        setIsReceiptPdf(url.toLowerCase().includes(".pdf"));
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

    if (expense) {
      loadReceiptPreview();
    }

    return () => {
      isCancelled = true;
    };
  }, [expense?.receipt?.path, expense]);

  const markExpensePaidWithTimestamp = async (id: string) => {
    const paidAt = new Date().toISOString();
    const attempts: { payload: Record<string, any>; allowRetry: boolean }[] = [
      { payload: { payment_status: "paid", paid_approval_time: paidAt }, allowRetry: true },
      { payload: { payment_status: "paid", paid_approval_time: paidAt }, allowRetry: false },
    ];

    let lastError: any = null;

    for (const attempt of attempts) {
      const { error } = await supabase
        .from("expense_new")
        .update(attempt.payload)
        .eq("id", id);

      if (!error) return paidAt;

      lastError = error;
      const message = (error?.message || "").toLowerCase();
      if (!attempt.allowRetry || !message.includes("paid_approval_time")) {
        break;
      }
    }

    throw lastError;
  };

  const handleViewReceipt = async () => {
    if (expense.receipt?.path) {
      try {
        const { url, error } = await expenses.getReceiptUrl(
          expense.receipt.path
        );
        if (error) {
          console.error("Error getting receipt URL:", error);
          toast.error("Failed to load receipt");
          return;
        }
        if (url) {
          window.open(url, "_blank");
        }
      } catch (err) {
        console.error("Error opening receipt:", err);
        toast.error("Failed to open receipt");
      }
    }
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
                status: "payment_not_processed",
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
      router.push(`/org/${slug}/finance?tab=payments`);
    }
    setProcessing(false);
  };

  const handleFinanceApprove = async () => {
    if (!expenseId) return;
    setProcessing(true);
    const { error } = await expenses.updateByFinance(
      expenseId as string,
      true,
      "Approved by Finance"
    );
    if (error) {
      toast.error("Approval failed");
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
      } catch (logErr) {
        console.error("Failed to log finance_approved entry:", logErr);
      }
      // Also mark as paid so it appears in Payment Records
      try {
        await markExpensePaidWithTimestamp(expenseId as string);
      } catch (err) {
        console.error("Error updating payment_status:", err);
      }
      // Send payment processed email notification (matches screenshot)
      try {
        if (expense?.user_id) {
          const { data: creatorProfile } = await profiles.getById(
            expense.user_id
          );
          // Resolve current finance user's display name
          const { data: userData } = await auth.getUser();
          const currentUserId = userData.user?.id || "";
          let approverName = userData.user?.email || "Finance Team";
          if (currentUserId) {
            const profRes = await profiles.getByUserId(currentUserId);
            const fullName = (profRes as any)?.data?.full_name as string | undefined;
            if (fullName) approverName = fullName;
          }
          if (creatorProfile?.email) {
            await fetch("/api/expenses/notify-creator", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                expenseId,
                creatorEmail: creatorProfile.email,
                creatorName: creatorProfile.full_name,
                approverName,
                orgName: organization?.name || null,
                slug,
                amount: expense.amount,
                approvedAmount: expense.approved_amount ?? expense.amount,
                expenseType: expense.expense_type,
                status: "payment_processed",
                decisionStage: "finance",
              }),
            });
          }
        }
      } catch (notifyErr) {
        console.error("Failed to send payment processed email:", notifyErr);
      }
      toast.success("Approved by Finance. Email notification has been sent to the expense creator.");
      router.push(`/org/${slug}/finance?tab=payments`);
    }
    setProcessing(false);
  };

  if (!loading && !expense) {
    return <div className="p-6 text-red-600">Expense not found</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center">
        <Button
          variant="outline"
          onClick={() =>
            router.push(`/org/${slug}/finance?tab=payments&highlight=${expenseId}`)
          }
          className="text-sm cursor-pointer"
          disabled={loading}
        >
          ← Back to Payment Processing
        </Button>
        {!loading && (
          <div className="flex gap-2 mt-2 md:mt-0">
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

      {/* Grid Layout */}
      <div className="grid md:grid-cols-3 gap-8">
        {/* Expense Details */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded shadow border">
            <h2 className="card-title mb-4">Expense Details</h2>
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
                    <TableHead>Payment Unique ID</TableHead>
                    <TableCell className="font-mono">
                      {expense.unique_id || expense.uniqueId || expense.id}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Location of Expense</TableHead>
                    <TableCell>{expense.location || "N/A"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Event Name</TableHead>
                    <TableCell>{eventTitle || "N/A"}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Expense Type</TableHead>
                    <TableCell>
                      {expense.expense_type || "Not Provided"}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Amount</TableHead>
                    <TableCell>₹{expense.amount}</TableCell>
                  </TableRow>
                  <TableRow>
                    <TableHead>Approved Amount</TableHead>
                    <TableCell>₹{expense.approved_amount}</TableCell>
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
                      {expense.receipt ? (
                        <Button
                          variant="outline"
                          onClick={handleViewReceipt}
                          className="flex items-center cursor-pointer"
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          View Receipt ({expense.receipt.filename || "Document"}
                          )
                        </Button>
                      ) : hasVoucher ? (
                        <Button
                          variant="outline"
                          className="flex items-center text-blue-600 cursor-pointer"
                          onClick={() =>
                            router.push(
                              `/org/${slug}/expenses/${expense.id}/voucher?from=payment-processing`
                            )
                          }
                        >
                          <FileText className="mr-2 h-4 w-4" />
                          View Voucher
                        </Button>
                      ) : (
                        <p className="text-muted-foreground">
                          No receipt or voucher available
                        </p>
                      )}
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
          {/* Receipt Preview */}
          {expense?.receipt && (
            <div className="bg-white p-6 rounded shadow border">
              <div className="border-b pb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-5 w-5 text-blue-600" />
                    <div>
                      <p className="text-base font-semibold">Receipt Preview</p>
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
                    </TooltipProvider>
                  </div>
                </div>
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

          {/* Voucher Preview */}
          {voucherDetails && (
            <div className="bg-white p-6 rounded shadow border">
              <div className="border-b pb-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-5 w-5 text-blue-600" />
                    <div>
                      <p className="text-base font-semibold">Voucher Preview</p>
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
                    </TooltipProvider>
                  </div>
                </div>
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
                            <p className="text-sm font-medium">Attachment</p>
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
                          <p className="text-sm font-medium">Attachment : </p>
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

        {/* Activity History */}
        <div className="space-y-4">
          <div className="md:col-span-3">
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
          </div>

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
        <Dialog open={showCommentBox} onOpenChange={setShowCommentBox}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rejection Comment</DialogTitle>
              <DialogDescription>
                Please provide a reason for rejecting this expense. This is
                required.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-2 border border-red-300 rounded p-3 space-y-2">
              <Textarea
                id="comment"
                rows={6}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Please write reason for rejection..."
              />
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
                className="cursor-pointer"
                onClick={handleFinanceReject}
              >
                Submit Rejection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
