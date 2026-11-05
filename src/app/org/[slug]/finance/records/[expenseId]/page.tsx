"use client";

import supabase from "@/lib/supabase";
import { useParams, useRouter, useSearchParams } from "next/navigation";
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
import { FileText, Clock, ArrowLeft, Pencil, Loader2 } from "lucide-react";
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
import DownloadAllExpensesAsPdf from "@/components/DownloadAllExpensesAsPdf";

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

export default function RecordsDetails() {
  const { expenseId } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const { organization } = useOrgStore();

  const bankTabParam = searchParams.get("activeTab");
  const activeTab =
    bankTabParam === "ngidfc" ||
      bankTabParam === "fcidfc" ||
      bankTabParam === "kotak"
      ? bankTabParam
      : "all";

  const [expense, setExpense] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hasVoucher, setHasVoucher] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [comment, setComment] = useState("");
  const [eventTitle, setEventTitle] = useState<string | null>(null);
  const [isNavigatingToEdit, setIsNavigatingToEdit] = useState(false);

  useEffect(() => {
    const fetchExpense = async () => {
      if (!expenseId) return;
      const { data, error } = await expenses.getById(expenseId as string);
      if (error) toast.error("Failed to load expense details");
      else setExpense(data);

      // Fetch related event title if present
      let eventTitleValue: string | null = null;
      if (data?.event_id) {
        try {
          const { data: ev } = await expenseEvents.getById(data.event_id);
          eventTitleValue = ev?.title || null;
          setEventTitle(eventTitleValue);
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

      const sNoParam = searchParams.get("sNo");
      const expenseData = {
        ...data,
        event_title: eventTitleValue,
        hasVoucher: !voucherError && !!voucherData,
        voucherId: voucherData?.id || null,
        s_no: sNoParam || "S.No"
      } as any;
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

  if (!loading && !expense) {
    return <div className="text-sm text-red-600">Expense not found</div>;
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
    Number(((tdsBaseAmount || 0) * tdsPercentage / 100).toFixed(2))
    : expense?.tds_deduction_amount ?? null;
  const securityDepositAmount =
    expense?.security_deposit_amount !== null &&
      expense?.security_deposit_amount !== undefined
      ? Number(expense.security_deposit_amount)
      : null;
  const actualAmount =
    expense?.actual_amount ??
    (tdsBaseAmount !== null && tdsBaseAmount !== undefined
      ? Number(
        (Number(tdsBaseAmount) -
          (tdsAmount ?? 0) -
          (securityDepositAmount ?? 0)).toFixed(2)
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
            onClick={() => {
              const query = new URLSearchParams();
              query.set("tab", "records");
              query.set("activeTab", activeTab);
              const page = searchParams.get("page");
              if (page) query.set("page", page);
              if (expenseId) query.set("expID", expenseId as string);
              router.push(`/org/${slug}/finance?${query.toString()}`);
            }}
          >
            <ArrowLeft />
            Back to Records
          </Button>
        }
        title="Record Details"
        description="Paid expense, its deductions and activity."
        actions={
          <>
            {!loading && expense && (
              <Button
                variant="ghost"
                disabled={isNavigatingToEdit}
                onClick={() => {
                  setIsNavigatingToEdit(true);
                  const query = new URLSearchParams();
                  query.set("activeTab", activeTab);
                  const page = searchParams.get("page");
                  if (page) query.set("page", page);
                  const sNo = searchParams.get("sNo");
                  if (sNo) query.set("sNo", sNo);
                  router.push(
                    `/org/${slug}/finance/records/${expenseId}/edit?${query.toString()}`
                  );
                }}
                className={`flex items-center gap-1.5 h-8 px-2 text-xs transition-opacity cursor-pointer ${
                  isNavigatingToEdit
                    ? "opacity-100 text-black"
                    : "text-white hover:text-black opacity-20 hover:opacity-100"
                }`}
              >
                {isNavigatingToEdit ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Pencil className="w-4 h-4" />
                )}
                Edit Expense
              </Button>
            )}
            {!loading && expense && organization && (
              <DownloadAllExpensesAsPdf
                expensesList={[expense]}
                organization={organization}
              />
            )}
          </>
        }
      />

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
                  <DetailItem label="Timestamp">{formatDateTime(expense.created_at)}</DetailItem>
                  <DetailItem label="Paid Date">
                    {expense.paid_approval_time ? new Date(expense.paid_approval_time).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  </DetailItem>
                  <DetailItem label="Payment Unique ID">
                    <span className="font-mono">
                      {expense.unique_id || expense.uniqueId || expense.id}
                    </span>
                  </DetailItem>
                  {isDirectPayment && (
                    <DetailItem label="Expense Credit Person">{expenseCreditPerson}</DetailItem>
                  )}
                  <DetailItem label="Project of Expense">{expense.location || "N/A"}</DetailItem>
                  <DetailItem label="Event Name">{eventTitle || "N/A"}</DetailItem>
                  <DetailItem label="Expense Type">
                    {expense.expense_type || "Not Provided"}
                  </DetailItem>
                  <DetailItem label="Invoice Amount">₹{expense.amount}</DetailItem>
                  <DetailItem label="Approved Amount">₹{expense.approved_amount}</DetailItem>
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
                  <DetailItem label="Approver">{expense.approver?.full_name || "—"}</DetailItem>
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

            <div className="mt-2 border border-red-300 rounded p-3 space-y-2">
              <Textarea
                id="comment"
                rows={6}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Please write reason for rejection..."
              />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
