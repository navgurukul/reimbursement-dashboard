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
import ExpenseHistory from "../../../expenses/[id]/history/expense-history";
import { ExpenseComments } from "../../../expenses/[id]/history/expense-comments";
import ReceiptPreview from "@/components/ReceiptPreview";
import VoucherPreview from "@/components/VoucherPreview";

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
import DownloadAllExpensesAsPdf from "@/components/DownloadAllExpensesAsPdf";

export default function RecordsDetails() {
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
    return <div className="p-6 text-red-600">Expense not found</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-2">
        <Button
          variant="link"
          onClick={() =>
            router.push(`/org/${slug}/finance?tab=records&expID=${expenseId}`)
          }
          // className="text-sm cursor-pointer"
          // disabled={loading}
        >
          <ArrowLeft />
          Back to Records
        </Button>
        {!loading && expense && organization && (
          <DownloadAllExpensesAsPdf
            expensesList={[expense]}
            organization={organization}
          />
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
                    <TableHead>Paid Date</TableHead>
                    <TableCell>
                      {expense.paid_approval_time ? new Date(expense.paid_approval_time).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                    </TableCell>
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
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
