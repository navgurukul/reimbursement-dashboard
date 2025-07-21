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

const formatCurrency = (amount: number) => {
  if (isNaN(amount) || amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);
};

export default function PaymentProcessingOnly() {
  const { organization } = useOrgStore();
  const orgId = organization?.id;
  const [processingExpenses, setProcessingExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const router = useRouter();

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
            email: exp.creator?.email || "—",
            creator_name: exp.creator?.full_name || "—",
            approver_name: exp.approver?.full_name || "—",
            payment_type: exp.payment_type || "NEFT",
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
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-800">Payment Processing</h3>
      </div>

      <div className="rounded-md border shadow-sm bg-white overflow-x-auto">
        <Table className="w-full text-sm">
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="text-center py-3">Created By</TableHead>
              <TableHead className="text-center py-3">Email</TableHead>
              <TableHead className="text-center py-3">Approved By</TableHead>
              <TableHead className="text-center py-3">Beneficiary Name</TableHead>
              <TableHead className="text-center py-3">Account Number</TableHead>
              <TableHead className="text-center py-3">IFSC</TableHead>
              <TableHead className="text-center py-3">Payment Type</TableHead>
              <TableHead className="text-center py-3">Debit Account</TableHead>
              <TableHead className="text-center py-3">Transaction Date</TableHead>
              <TableHead className="text-center py-3">Amount</TableHead>
              <TableHead className="text-center py-3">Currency</TableHead>
              <TableHead className="text-center py-3">Remarks</TableHead>
              <TableHead className="text-center py-3">Unique ID</TableHead>
              <TableHead className="text-center py-3">Status</TableHead>
              <TableHead className="text-center py-3">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={15} className="text-center py-6">
                  Loading...
                </TableCell>
              </TableRow>
            ) : processingExpenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={15} className="text-center py-6 text-gray-500">
                  No expenses in payment processing.
                </TableCell>
              </TableRow>
            ) : (
              processingExpenses.map((expense) => (
                <TableRow key={expense.id} className="hover:bg-gray-50 transition py-3">
                  <TableCell className="text-center py-3">{expense.creator_name}</TableCell>
                  <TableCell className="text-center py-3">{expense.email}</TableCell>
                  <TableCell className="text-center py-3">{expense.approver_name}</TableCell>
                  <TableCell className="text-center py-3">{expense.beneficiary_name || "—"}</TableCell>
                  <TableCell className="text-center py-3">{expense.account_number || "—"}</TableCell>
                  <TableCell className="text-center py-3">{expense.ifsc || "—"}</TableCell>
                  <TableCell className="text-center py-3">
                    <select
                      className="border px-2 py-1 rounded bg-white text-sm"
                      value={expense.payment_type}
                      onChange={(e) => {
                        const updated = processingExpenses.map((exp) =>
                          exp.id === expense.id
                            ? { ...exp, payment_type: e.target.value }
                            : exp
                        );
                        setProcessingExpenses(updated);
                      }}
                    >
                      <option value="IFT">IFT - Within Bank Payment</option>
                      <option value="NEFT">NEFT - Inter-Bank(NEFT) Payment</option>
                      <option value="RTGS">RTGS - Inter-Bank(RTGS) Payment</option>
                    </select>
                  </TableCell>
                  <TableCell className="text-center py-3">{expense.debit_account || "—"}</TableCell>
                  <TableCell className="text-center py-3">
                    <input
                      type="date"
                      className="border px-2 py-1 rounded text-sm"
                      value={
                        expense.value_date
                          ? new Date(expense.value_date).toISOString().split("T")[0]
                          : ""
                      }
                      onChange={(e) => {
                        const updated = processingExpenses.map((exp) =>
                          exp.id === expense.id
                            ? { ...exp, value_date: e.target.value }
                            : exp
                        );
                        setProcessingExpenses(updated);
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-center py-3">
                    {formatCurrency(expense.amount)}
                  </TableCell>
                  <TableCell className="text-center py-3">{expense.currency || "INR"}</TableCell>
                  <TableCell className="text-center py-3">{expense.remarks || "—"}</TableCell>
                  <TableCell className="text-center py-3">{expense.unique_id || "—"}</TableCell>
                  <TableCell className="text-center py-3">
                    <Badge className="bg-green-100 text-green-800 border border-green-300">
                      Finance Approved
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center py-3">
                    <button
                      onClick={() =>
                        router.push(`/org/${orgId}/finance/payments/${expense.id}`)
                      }
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
