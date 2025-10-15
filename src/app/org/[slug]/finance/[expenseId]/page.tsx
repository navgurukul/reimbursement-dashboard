"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { expenses, expenseEvents, expenseHistory, auth, profiles } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
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
import ExpenseHistory from "../../expenses/[id]/history/expense-history"

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
          const { data: ev } = await expenseEvents.getById(expenseData.event_id);
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
      // Log history
      try {
        const { data: userData } = await auth.getUser();
        const currentUserId = userData.user?.id || "";
        let userName = userData.user?.email || "Unknown User";
        if (currentUserId) {
          const profRes = await profiles.getByUserId(currentUserId);
          const fullName = (profRes as any)?.data?.full_name as string | undefined;
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
      toast.success("Approved by Finance");
      router.push(`/org/${expense.org_id}/finance`);
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
      // Log history
      try {
        const { data: userData } = await auth.getUser();
        const currentUserId = userData.user?.id || "";
        let userName = userData.user?.email || "Unknown User";
        if (currentUserId) {
          const profRes = await profiles.getByUserId(currentUserId);
          const fullName = (profRes as any)?.data?.full_name as string | undefined;
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
      } catch (logErr) {
        console.error("Failed to log finance_rejected entry:", logErr);
      }
      toast.success("Rejected by Finance");
      router.push(`/org/${expense.org_id}/finance`);
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

  if (loading) return <div className="p-6 text-gray-600">Loading...</div>;
  if (!expense) return <div className="p-6 text-red-600">Expense not found</div>;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <Button
          variant="outline"
          onClick={() => router.push(`/org/${expense.org_id}/finance`)}
          className="text-sm"
        >
          ← Back to Approval Queue
        </Button>
        <div className="flex gap-2">
          <Button
            onClick={handleFinanceApprove}
            disabled={processing}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            Approve
          </Button>
          <Button
            onClick={() => setShowCommentBox(true)}
            disabled={processing}
            variant="destructive"
          >
            Reject
          </Button>
        </div>
      </div>

      {/* Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-6">
        {/* Expense Details */}
        <div className="space-y-6 md:col-span-4">
          <div className="bg-white p-6 rounded shadow border">
            <h2 className="text-lg font-semibold mb-4">Expense Details</h2>
            <Table>
              <TableBody>
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
                  <TableCell>{expense.expense_type || "Not Provided"}</TableCell>
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
                    <Badge className="capitalize">{expense.status}</Badge>
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
                        className="flex items-center"
                      >
                        <FileText className="mr-2 h-4 w-4" />
                        View Receipt ({expense.receipt.filename || "Document"})
                      </Button>
                    ) : hasVoucher ? (
                      <Button
                        variant="outline"
                        className="flex items-center text-blue-600"
                        onClick={() =>
                          router.push(`/org/${slug}/expenses/${expense.id}/voucher`)
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
                  <TableCell>{expense.custom_fields?.description || "—"}</TableCell>

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
          </div>
        </div>
        {/* Activity History */}
        <div className="md:col-span-3">
          <Card>
            <CardHeader className="flex flex-row items-center">
              <Clock className="h-5 w-5 mr-2 text-muted-foreground" />
              <CardTitle>Activity History</CardTitle>
            </CardHeader>
            <CardContent className="max-h-[500px] overflow-auto">
              <ExpenseHistory expenseId={typeof expenseId === "string" ? expenseId : ""} />
            </CardContent>
          </Card>
        </div>
      </div>
      {/* Rejection comment box */}

      {showCommentBox && (
          <div className="w-full sm:max-w-[600px] md:max-w-[354px] lg:max-w-[374px] xl:max-w-[610px] 2xl:max-w-[847px] mt-2 space-y-4">
          <div className="bg-red-50 border border-red-300 rounded p-3 space-y-2">
            <label className="block font-medium text-red-800">
              Rejection Reason <span className="text-red-600">*</span>
            </label>
            <Textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Enter rejection reason..."
              className="w-full"
            />
            <div className="text-right">
              <Button
                variant="destructive"
                onClick={handleFinanceReject}
                disabled={processing}
              >
                Submit Rejection
              </Button>
            </div>
          </div>
        </div>

      )}
    </div>
  );
}
