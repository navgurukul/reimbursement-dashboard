"use client";

import { useOrgStore } from "@/store/useOrgStore";
import { expenses } from "@/lib/db";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "INR",
  }).format(amount);

export default function PaymentProcessingOnly() {
  const { organization } = useOrgStore();
  const orgId = organization?.id;
  const [processingExpenses, setProcessingExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const router = useRouter(); // ✅ Added

  useEffect(() => {
    async function fetchExpenses() {
      if (!orgId) return;

      try {
        setLoading(true);
        const { data, error } = await expenses.getByOrg(orgId);
        if (error) throw error;

        const paymentProcessingExpenses = (data || [])
          .filter((exp: any) => exp.status === "finance_approved")
          .map((exp: any) => ({
            ...exp,
            creator_name: exp.creator?.full_name || "—",
            approver_name: exp.approver?.full_name || "—",
            expense_type: exp.expense_type || "—",
          }));

        setProcessingExpenses(paymentProcessingExpenses);
      } catch (error: any) {
        toast.error("Failed to load expenses", {
          description: error.message,
        });
      } finally {
        setLoading(false);
      }
    }

    fetchExpenses();
  }, [orgId]);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-medium text-gray-800">Payment Processing</h3>
      <div className="rounded-md border shadow-sm bg-white overflow-x-auto">
        <Table className="w-full text-sm">
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="text-center py-3">Expense Type</TableHead>
              <TableHead className="text-center py-3">Amount</TableHead>
              <TableHead className="text-center py-3">Date</TableHead>
              <TableHead className="text-center py-3">Submitted By</TableHead>
              <TableHead className="text-center py-3">Approved By</TableHead>
              <TableHead className="text-center py-3">Status</TableHead>
              <TableHead className="text-center py-3">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6">
                  Loading...
                </TableCell>
              </TableRow>
            ) : processingExpenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-gray-500">
                  No expenses in payment processing.
                </TableCell>
              </TableRow>
            ) : (
              processingExpenses.map((expense) => (
                <TableRow key={expense.id} className="hover:bg-gray-50 transition py-3">
                  <TableCell className="text-center py-3">{expense.expense_type}</TableCell>
                  <TableCell className="text-center py-3 font-medium text-green-700">
                    {formatCurrency(expense.amount)}
                  </TableCell>
                  <TableCell className="text-center py-3 whitespace-nowrap">
                    {new Date(expense.date).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="text-center py-3">{expense.creator_name}</TableCell>
                  <TableCell className="text-center py-3">{expense.approver_name}</TableCell>
                  <TableCell className="text-center py-3">
                    <Badge className="bg-green-100 text-green-800 border border-green-300">
                      Finance Approved
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center py-3">
                    <button
                      onClick={() => router.push(`/org/${orgId}/finance/payments/${expense.id}`)}
                      title="View Expense"
                    >
                      <Eye className="w-4 h-4 text-gray-700" />
                    </button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
