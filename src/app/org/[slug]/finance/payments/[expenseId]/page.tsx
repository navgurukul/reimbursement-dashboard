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
import { FileText, Clock } from "lucide-react";
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
