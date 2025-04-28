"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { expenses } from "@/lib/db";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Check, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

export default function ViewExpensePage() {
  const router = useRouter();
  const params = useParams();
  const { organization, userRole } = useOrgStore();
  const orgId = organization?.id!;
  const expenseId = params.id as string;
  const slug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [expense, setExpense] = useState<any>(null);

  useEffect(() => {
    async function fetchExpense() {
      try {
        const { data, error } = await expenses.getById(expenseId);
        if (error) {
          toast.error("Failed to load expense", {
            description: error.message,
          });
          router.push(`/org/${slug}/expenses`);
          return;
        }
        setExpense(data);
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
          </div>

          {expense.receipt && (
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                Receipt
              </p>
              <img
                src={expense.receipt.url}
                alt="Receipt"
                className="max-h-80 rounded-md"
              />
            </div>
          )}

          {Object.entries(expense.custom_fields).map(([key, value]) => (
            <div key={key}>
              <p className="text-sm font-medium text-muted-foreground">{key}</p>
              <p>{value as string}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
