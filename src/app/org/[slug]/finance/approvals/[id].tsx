"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { expenses } from "@/lib/db";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ExpenseStatusBadge } from "@/components/ExpenseStatusBadge";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
  TableHead,
} from "@/components/ui/table";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);

export default function FinanceExpenseDetail() {
  const router = useRouter();
  const { id, slug } = useParams();
  const [expense, setExpense] = useState<any>(null);
  const [comment, setComment] = useState("");
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchExpense = async () => {
      const { data, error } = await expenses.getById(id as string);

      if (error) {
        toast.error("Failed to load expense", { description: error.message });
        return;
      }

      setExpense(data);
      setLoading(false);
    };

    fetchExpense();
  }, [id]);

  const handleApprove = async () => {
    if (!expense) return;

    const { error } = await expenses.updateByFinance(expense.id, true, "");

    if (error) {
      toast.error("Failed to approve");
    } else {
      toast.success("Approved by Finance");
      router.push(`/org/${slug}/finance`);
    }
  };

  const handleReject = async () => {
    if (!comment.trim()) {
      toast.error("Please add a comment for rejection.");
      return;
    }

    const { error } = await expenses.updateByFinance(
      expense.id,
      false,
      comment
    );

    if (error) {
      toast.error("Failed to reject");
    } else {
      toast.success("Rejected and sent back");
      router.push(`/org/${slug}/finance`);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <h2 className="text-2xl font-semibold">Finance Expense Review</h2>
        {!loading && (
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => router.back()}>
              ← Back
            </Button>
            <Button onClick={handleApprove}>Approve</Button>
            <Button
              variant="destructive"
              onClick={() => setShowCommentBox(true)}
            >
              Reject
            </Button>
          </div>
        )}
      </div>

      {/* Expense Info Table */}
      <div className="overflow-x-auto border rounded bg-white shadow">
        {loading ? (
          <div className="p-6 space-y-3">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="flex gap-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
            ))}
          </div>
        ) : (
          <Table>
            <TableBody>
              <TableRow className="py-3">
                <TableHead>Expense Type</TableHead>
                <TableCell>{expense.category || "—"}</TableCell>
              </TableRow>
              <TableRow className="py-3">
                <TableHead>Amount</TableHead>
                <TableCell>{formatCurrency(expense.amount)}</TableCell>
              </TableRow>
              <TableRow className="py-3">
                <TableHead>Date</TableHead>
                <TableCell>
                  {new Date(expense.date).toLocaleDateString("en-IN")}
                </TableCell>
              </TableRow>
              <TableRow className="py-3">
                <TableHead>Description</TableHead>
                <TableCell>{expense.description || "—"}</TableCell>
              </TableRow>
              <TableRow className="py-3">
                <TableHead>Submitted by</TableHead>
                <TableCell>{expense.creator?.full_name || "—"}</TableCell>
              </TableRow>
              <TableRow className="py-3">
                <TableHead>Approved by</TableHead>
                <TableCell>{expense.approver?.full_name || "—"}</TableCell>
              </TableRow>
              <TableRow className="py-3">
                <TableHead>Status</TableHead>
                <TableCell>
                  <ExpenseStatusBadge status={expense.status} />
                </TableCell>
              </TableRow>
              {expense.hasVoucher && (
                <TableRow className="py-3">
                  <TableHead>Voucher</TableHead>
                  <TableCell>
                    <Button
                      variant="link"
                      className="text-blue-600 p-0"
                      onClick={() =>
                        router.push(
                          `/org/${slug}/expenses/${expense.id}/voucher`
                        )
                      }
                    >
                      📄 View Voucher
                    </Button>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Rejection Comment Box */}
      {!loading && showCommentBox && (
        <div className="space-y-2 border-t pt-4">
          <label htmlFor="comment" className="block font-medium">
            Rejection Comment (required)
          </label>
          <Textarea
            id="comment"
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Please write reason for rejection..."
          />
          <Button variant="destructive" onClick={handleReject}>
            Submit Rejection
          </Button>
        </div>
      )}
    </div>
  );
}
