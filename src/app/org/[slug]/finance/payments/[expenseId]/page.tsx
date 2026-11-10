"use client";

import React from "react";
import supabase from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  expenses,
  expenseEvents,
  expenseHistory,
  auth,
  profiles,
} from "@/lib/db";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import { ExpenseStatusBadge } from "@/components/ExpenseStatusBadge";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Clock, ArrowLeft } from "lucide-react";
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
import ReceiptPreview from "@/components/ReceiptPreview";
import VoucherPreview from "@/components/VoucherPreview";

import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useOrgStore } from "@/store/useOrgStore";

import { sendExpenseNotification } from "@/lib/notify";
/** One label/value pair in the expense details list. */
function DetailItem({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground break-words">{children}</dd>
    </div>
  );
}

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
            await sendExpenseNotification("creator", {
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
            await sendExpenseNotification("creator", {
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
    return <div className="text-sm text-destructive">Expense not found</div>;
  }

  const tdsPercentage = expense?.tds_deduction_percentage ?? null;
  const isDirectPayment =
    String(expense?.unique_id || expense?.uniqueId || "")
      .trim()
      .toLowerCase()
      .includes("direct payment");
  const expenseCreditPerson =
    expense?.expense_credit_person ||
    getCustomFieldValue(expense?.custom_fields, "expense_credit_person") ||
    "N/A";
  const tdsBaseAmount = expense?.approved_amount ?? expense?.amount ?? 0;
  const tdsAmount = tdsPercentage
    ? expense?.tds_deduction_amount ??
    Math.round(((tdsBaseAmount || 0) * tdsPercentage) / 100)
    : expense?.tds_deduction_amount ?? null;
  const securityDepositAmount =
    expense?.security_deposit_amount !== null &&
      expense?.security_deposit_amount !== undefined
      ? Number(expense.security_deposit_amount)
      : null;
  const actualAmount =
    expense?.actual_amount ??
    (tdsBaseAmount !== null && tdsBaseAmount !== undefined
      ? Math.round(
        Number(tdsBaseAmount) -
        (tdsAmount ?? 0) -
        (securityDepositAmount ?? 0)
      )
      : null);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        leading={
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 w-fit"
            onClick={() =>
              router.push(`/org/${slug}/finance?tab=payments&expID=${expenseId}`)
            }
          >
            <ArrowLeft />
            Back to Payment Processing
          </Button>
        }
        title="Payment Details"
        description="Review the expense and its payment breakdown."
        actions={
          !loading && (
            <>
              <Button
                // onClick={handleFinanceApprove}
                // disabled={processing}
                // className="cursor-pointer"
                variant="success"
                onClick={() => toast.warning("You can't approve expenses here. Back to Payment Processing tab and use Mark All as Paid or click the Mark as Paid in the Actions column.", { duration: 10000, style: { background: '#f7ea76ff', color: '#040404ff', border: 'none' } })}
                className="flex-1 opacity-50 !cursor-not-allowed sm:flex-none"
              >
                Approve
              </Button>
              <Button
                onClick={() => setShowCommentBox(true)}
                disabled={processing}
                variant="destructive"
                className="flex-1 sm:flex-none"
              >
                Reject
              </Button>
            </>
          )
        }
      />

      {/* Show message if expense is created using Advance Unique ID */}
      {expense && expense.unique_id &&
        (expense.unique_id.toLowerCase().startsWith("advance_") ||
          expense.unique_id.startsWith("Advance_")) && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-sm text-yellow-900 break-words">
              ℹ️ This expense was created using Advance Unique ID: <span className="font-mono font-semibold">{expense.unique_id}</span>
            </p>
          </div>
        )}

      {/* Grid Layout */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Expense Details */}
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <h2 className="card-title">Expense Details</h2>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Table>
                  <TableBody>
                    <DetailTableSkeleton rows={12} />
                  </TableBody>
                </Table>
              ) : (
                <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  <DetailItem label="Timestamp">
                    {formatDateTime(expense.created_at)}
                  </DetailItem>
                  <DetailItem label="Payment Unique ID">
                    <span className="font-mono">
                      {expense.unique_id || expense.uniqueId || expense.id}
                    </span>
                  </DetailItem>
                  {isDirectPayment && (
                    <DetailItem label="Expense Credit Person">
                      {expenseCreditPerson}
                    </DetailItem>
                  )}
                  <DetailItem label="Project of Expense">
                    {expense.location || "N/A"}
                  </DetailItem>
                  <DetailItem label="Event Name">
                    {eventTitle || "N/A"}
                  </DetailItem>
                  <DetailItem label="Expense Type">
                    {expense.expense_type || "Not Provided"}
                  </DetailItem>
                  <DetailItem label="Invoice Amount">
                    ₹{expense.amount}
                  </DetailItem>
                  <DetailItem label="Approved Amount">
                    ₹{expense.approved_amount}
                  </DetailItem>
                  <DetailItem label="TDS Applicable Amount">
                    {tdsPercentage || (tdsAmount !== null && tdsAmount !== undefined)
                      ? `₹${expense.approved_amount}`
                      : "N/A"}
                  </DetailItem>
                  <DetailItem label="TDS Deduction">
                    {tdsPercentage ? (
                      <span className="text-amber-700 font-medium">
                        {expense?.tds_round_off_amount != null
                          ? `${tdsPercentage}% (TDS amount: ${formatCurrency(tdsAmount ?? 0)}) | Round off: ₹${expense.tds_round_off_amount}`
                          : `${tdsPercentage}% (TDS amount: ${formatCurrency(tdsAmount ?? 0)})`}
                      </span>
                    ) : tdsAmount !== null && tdsAmount !== undefined ? (
                      <span className="text-amber-700 font-medium">
                        {expense?.tds_round_off_amount != null
                          ? `TDS amount: ${formatCurrency(tdsAmount)} | Round off: ₹${expense.tds_round_off_amount}`
                          : `TDS amount: ${formatCurrency(tdsAmount)}`}
                      </span>
                    ) : (
                      "N/A"
                    )}
                  </DetailItem>
                  <DetailItem label="Security Deposit Deduction">
                    {securityDepositAmount !== null
                      ? formatCurrency(securityDepositAmount)
                      : "N/A"}
                  </DetailItem>
                  <DetailItem label="Net Payable Amount">
                    {actualAmount !== null && actualAmount !== undefined
                      ? formatCurrency(Number(actualAmount))
                      : "—"}
                  </DetailItem>
                  <DetailItem label="Date">
                    {new Date(expense.date).toLocaleDateString("en-IN")}
                  </DetailItem>
                  <DetailItem label="Status">
                    <ExpenseStatusBadge status={expense.status} />
                  </DetailItem>
                  <DetailItem label="Approver">
                    {expense.approver?.full_name || "—"}
                  </DetailItem>
                  <DetailItem label="Receipt/Voucher">
                    {hasVoucher
                      ? "Voucher Preview Below"
                      : expense?.receipt
                        ? "Receipt Preview Below"
                        : "N/A"}
                  </DetailItem>
                  <DetailItem label="Description" className="sm:col-span-2">
                    {expense.custom_fields?.description || "—"}
                  </DetailItem>
                  <DetailItem label="Signature">
                    {expense.signature_url ? (
                      <img
                        src={expense.signature_url}
                        alt="Signature"
                        className="h-16 max-w-full rounded-md border bg-white object-contain"
                      />
                    ) : (
                      "Not Available"
                    )}
                  </DetailItem>
                  <DetailItem label="Approver Signature">
                    {expense.approver_signature_url ? (
                      <img
                        src={expense.approver_signature_url}
                        alt="Approver Signature"
                        className="h-16 max-w-full rounded-md border bg-white object-contain"
                      />
                    ) : (
                      "Not Available"
                    )}
                  </DetailItem>
                </dl>
              )}
            </CardContent>
          </Card>
          {/* Receipt Preview (component) */}
          {expense?.receipt && <ReceiptPreview expense={expense} />}

          {/* Voucher Preview (component) */}
          {hasVoucher && (
            <VoucherPreview expense={expense} expenseId={typeof expenseId === "string" ? expenseId : ""} />
          )}
        </div>

        {/* Activity History */}
        <div className="grid min-w-0 content-start gap-6 md:grid-cols-2 xl:grid-cols-1">
          <div className="min-w-0">
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

          <Card className="min-w-0">
            <CardContent>
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

            <div className="space-y-2">
              <Textarea
                id="comment"
                rows={6}
                aria-label="Reason for rejection"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Please write reason for rejection..."
              />
            </div>

            <DialogFooter>
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
