"use client";

import { useOrgStore } from "@/store/useOrgStore";
import { expenses } from "@/lib/db";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";

import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);

export default function FinanceReview({ onApproved }: { onApproved?: () => void }) {
  const { organization } = useOrgStore();
  const orgId = organization?.id;
  const router = useRouter();

  const [expenseList, setExpenseList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchExpenses() {
      if (!orgId) return;

      try {
        setLoading(true);
        const { data, error } = await expenses.getByOrg(orgId);
        if (error) throw error;

        const managerApprovedExpenses = (data || [])
          .filter((exp: any) => exp.status === "approved")
          .map((exp: any) => ({
            ...exp,
            expense_type: exp.category || exp.type || exp.expense_type || "—",
            approver_name: exp.approver?.full_name || "—",
            creator_name: exp.creator?.full_name || "—",
          }));

        setExpenseList(managerApprovedExpenses);
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

  const handleViewClick = (expense: any) => {
    if (!organization?.slug || !expense?.id) return;
    router.push(`/org/${organization.slug}/finance/${expense.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">Finance Review</h2>
      </div>

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
            ) : expenseList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-gray-500">
                  No expenses pending finance review
                </TableCell>
              </TableRow>
            ) : (
              expenseList.map((expense) => (
                <TableRow
                  key={expense.id}
                  className="hover:bg-gray-50 transition-all py-3"
                >
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
                    <Badge variant="success">Manager Approved</Badge>
                  </TableCell>
                  <TableCell className="text-center py-3">
                    <button
                      onClick={() => handleViewClick(expense)}
                      title="View Expense"
                      className="p-2 hover:text-black text-gray-700 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
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
