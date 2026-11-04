"use client";

import supabase from "@/lib/supabase";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  expenses,
  expenseEvents,
  expenseHistory,
  auth,
  profiles,
} from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { ExpenseStatusBadge } from "@/components/ExpenseStatusBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Clock, ArrowLeft, } from "lucide-react";
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

import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { useOrgStore } from "@/store/useOrgStore";
import DownloadAllExpensesAsPdf from "@/components/DownloadAllExpensesAsPdf";

/** One label/value pair in the details grid. */
function DetailItem({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground break-words">{children}</dd>
    </div>
  );
}

export default function RecordsDetails() {
  const { expenseId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
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

      const expenseData = { 
        ...data, 
        event_title: eventTitleValue,
        hasVoucher: !voucherError && !!voucherData,
        voucherId: voucherData?.id || null
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
    return <div className="text-red-600">Expense not found</div>;
  }

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
              const currentTab = searchParams.get("tab") || "all";
              router.push(`/org/${slug}/advance-payment?tab=${currentTab}&expID=${expenseId}`);
            }}
          >
            <ArrowLeft />
            Back to advance payment
          </Button>
        }
        title="Advance Payment Details"
        actions={
          !loading && expense && organization && (
            <DownloadAllExpensesAsPdf
              expensesList={[expense]}
              organization={organization}
            />
          )
        }
      />

      {/* Grid Layout */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Expense Details */}
        <div className="min-w-0 space-y-6">
          <div className="rounded-xl border bg-card p-4 shadow-sm sm:p-6">
            <h2 className="card-title mb-4">Expense Details</h2>
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
                <DetailItem label="Paid Date">
                  {expense.paid_approval_time ? new Date(expense.paid_approval_time).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                </DetailItem>
                <DetailItem label="Payment Unique ID">
                  <span className="font-mono">
                    {expense.unique_id || expense.uniqueId || expense.id}
                  </span>
                </DetailItem>
                <DetailItem label="Project of Expense">
                  {expense.location || "N/A"}
                </DetailItem>
                <DetailItem label="Event Name">{eventTitle || "N/A"}</DetailItem>
                <DetailItem label="Expense Type">
                  {expense.expense_type || "Not Provided"}
                </DetailItem>
                <DetailItem label="Amount">₹{expense.amount}</DetailItem>
                <DetailItem label="Approved Amount">
                  ₹{expense.approved_amount}
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
                      className="h-16 max-w-full rounded-md border object-contain"
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
                      className="h-16 max-w-full rounded-md border object-contain"
                    />
                  ) : (
                    "Not Available"
                  )}
                </DetailItem>
              </dl>
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
        <div className="min-w-0 space-y-6">
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
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
