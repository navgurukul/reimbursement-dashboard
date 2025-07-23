"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { expenses } from "@/lib/db";
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
import  supabase  from "@/lib/supabase"; // Make sure this is correctly imported

export default function FinanceExpenseDetails() {
  const { expenseId } = useParams();
  const router = useRouter();

  const [expense, setExpense] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [comment, setComment] = useState("");

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
      toast.success("Rejected by Finance");
      router.push(`/org/${expense.org_id}/finance`);
    }
    setProcessing(false);
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
      <div className="grid md:grid-cols-3 gap-8">
        {/* Expense Details */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded shadow border">
            <h2 className="text-lg font-semibold mb-4">Expense Details</h2>
            <Table>
              <TableBody>
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
                  <TableCell>₹{expense.amount}</TableCell>
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
                  <TableHead>Receipt</TableHead>
                  <TableCell>
                    {expense.voucherId ? (
                      <Button
                        size="sm"
                        variant="link"
                        onClick={() =>
                          router.push(`/org/${expense.org_id}/expenses/${expense.id}/voucher`)
                        }
                      >
                        View Receipt ({expense.voucher_filename || "Voucher"})
                      </Button>
                    ) : (
                      "No Voucher"
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

          {/* Rejection comment box */}
          {showCommentBox && (
            <div className="bg-red-50 border border-red-300 rounded p-4 space-y-3">
              <label className="font-medium text-red-800">
                Rejection Reason (required)
              </label>
              <Textarea
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Enter rejection reason..."
              />
              <Button
                variant="destructive"
                onClick={handleFinanceReject}
                disabled={processing}
              >
                Submit Rejection
              </Button>
            </div>
          )}
        </div>

        {/* Activity History */}
        <div>
          <div className="bg-white p-6 rounded shadow border">
            <h2 className="text-lg font-semibold mb-4">Activity History</h2>
            <div className="space-y-4 text-sm text-gray-700">
              {expense.history?.length > 0 ? (
                expense.history.map((entry: any, i: number) => (
                  <div key={i} className="flex items-start gap-2">
                    <div
                      className={`w-2 h-2 mt-1 rounded-full ${
                        entry.action === "Approved" ? "bg-green-600" : "bg-blue-500"
                      }`}
                    />
                    <div>
                      <div className="font-semibold">{entry.action}</div>
                      <div className="text-xs text-gray-500">
                        {entry.user} · {new Date(entry.timestamp).toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <>
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 mt-1 rounded-full bg-green-600" />
                    <div>
                      <div className="font-semibold">Approved</div>
                      <div className="text-xs text-gray-500">
                        {expense.approver?.full_name || "—"} ·{" "}
                        {new Date().toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-2 h-2 mt-1 rounded-full bg-blue-500" />
                    <div>
                      <div className="font-semibold">Created</div>
                      <div className="text-xs text-gray-500">
                        {expense.creator?.full_name || "—"} ·{" "}
                        {new Date(expense.date).toLocaleString("en-IN")}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
