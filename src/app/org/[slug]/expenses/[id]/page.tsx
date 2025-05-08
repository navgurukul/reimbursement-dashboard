"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { expenses } from "@/lib/db";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Check, X, FileText } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import supabase from "@/lib/supabase";

export default function ViewExpensePage() {
  const router = useRouter();
  const params = useParams();
  const { organization, userRole } = useOrgStore();
  const orgId = organization?.id!;
  const expenseId = params.id as string;
  const slug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [expense, setExpense] = useState<any>(null);
  const [hasVoucher, setHasVoucher] = useState(false);

  useEffect(() => {
    async function fetchExpense() {
      try {
        // Fetch the expense details
        const { data, error } = await expenses.getById(expenseId);
        if (error) {
          toast.error("Failed to load expense", {
            description: error.message,
          });
          router.push(`/org/${slug}/expenses`);
          return;
        }

        setExpense(data);

        // Check if this expense has a voucher
        const { data: voucherData, error: voucherError } = await supabase
          .from("vouchers")
          .select("id")
          .eq("expense_id", expenseId)
          .maybeSingle();

        if (!voucherError && voucherData) {
          console.log("Voucher found for expense:", voucherData);
          setHasVoucher(true);
        } else {
          console.log("No voucher found for this expense");
          setHasVoucher(false);
        }
      } catch (error) {
        console.error("Error fetching expense:", error);
        toast.error("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchExpense();
  }, [expenseId, router, slug]);

  const handleApprove = async () => {
    try {
      const { error } = await expenses.update(expenseId, {
        status: "approved",
      });
      if (error) throw error;
      toast.success("Expense approved successfully");
      router.push(`/org/${slug}/expenses`);
    } catch (error: any) {
      toast.error("Failed to approve expense", {
        description: error.message,
      });
    }
  };

  const handleReject = async () => {
    try {
      const { error } = await expenses.update(expenseId, {
        status: "rejected",
      });
      if (error) throw error;
      toast.success("Expense rejected successfully");
      router.push(`/org/${slug}/expenses`);
    } catch (error: any) {
      toast.error("Failed to reject expense", {
        description: error.message,
      });
    }
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!expense) {
    return null;
  }

  // Helper function to format field names
  const formatFieldName = (name: string) => {
    return name
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => router.push(`/org/${slug}/expenses`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Expenses
        </Button>
        {userRole !== "member" && expense.status === "submitted" && (
          <div className="flex space-x-2">
            <Button variant="outline" onClick={handleReject}>
              <X className="mr-2 h-4 w-4" />
              Reject
            </Button>
            <Button onClick={handleApprove}>
              <Check className="mr-2 h-4 w-4" />
              Approve
            </Button>
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Expense Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Expense Type
              </p>
              <p>{expense.expense_type}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Amount
              </p>
              <p>
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: "USD",
                }).format(expense.amount)}
              </p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Date</p>
              <p>{new Date(expense.date).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Status
              </p>
              <p
                className={`${
                  expense.status === "approved"
                    ? "text-green-600"
                    : expense.status === "rejected"
                    ? "text-red-600"
                    : "text-amber-600"
                }`}
              >
                {expense.status.charAt(0).toUpperCase() +
                  expense.status.slice(1)}
              </p>
            </div>

            {expense.approver && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Approver
                </p>
                <p>{expense.approver.full_name || "—"}</p>
              </div>
            )}
          </div>

          {/* Receipt section with View Receipt button */}
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">
              Receipt
            </p>
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
          </div>

          {/* Custom fields section */}
          <div className="grid grid-cols-2 gap-4 mt-4">
            {expense.custom_fields &&
              Object.entries(expense.custom_fields).map(([key, value]) => (
                <div key={key}>
                  <p className="text-sm font-medium text-muted-foreground">
                    {formatFieldName(key)}
                  </p>
                  <p>{(value as string) || "—"}</p>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
