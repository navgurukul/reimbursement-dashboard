"use client";

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
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
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
import ExpenseHistory from "../../expenses/[id]/history/expense-history";
import { ExpenseComments } from "../../expenses/[id]/history/expense-comments";

import supabase from "@/lib/supabase"; // Make sure this is correctly imported

export default function FinanceExpenseDetails() {
  const params = useParams();
  const { expenseId } = useParams();

  const slug = params.slug as string;
  const router = useRouter();

  const [expense, setExpense] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [comment, setComment] = useState("");
  const [hasVoucher, setHasVoucher] = useState(false);
  const [eventTitle, setEventTitle] = useState<string | null>(null);

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

      setExpense(expenseData);
      setLoading(false);
    };

    fetchExpense();
  }, [expenseId]);

  const handleFinanceApprove = async () => {
    setProcessing(true);
    const { error } = await expenses.updateByFinance(
      expenseId as string,
      true,
      "Approved by Finance"
    );
    if (error) toast.error("Approval failed");
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
      toast.success("Approved by Finance");
      router.push(`/org/${slug}/finance`);
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
      toast.success("Rejected by Finance");
      router.push(`/org/${slug}/finance`);
    }
    setProcessing(false);
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

  if (!loading && !expense) {
    return <div className="p-6 text-red-600">Expense not found</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => router.push(`/org/${slug}/finance`)}
          className="text-sm cursor-pointer"
          disabled={loading}
        >
          ← Back to Approval Queue
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

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-6">
        {/* Expense Details */}
        <div className="space-y-6 md:col-span-4">
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
                    <TableHead>Unique ID</TableHead>
                    <TableCell>{expense.unique_id || "N/A"}</TableCell>
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
                              `/org/${slug}/expenses/${expense.id}/voucher?from=approval-queue`
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
