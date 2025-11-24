"use client";

import { useOrgStore } from "@/store/useOrgStore";
import { expenses } from "@/lib/db";
import supabase from "@/lib/supabase";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);

export default function FinanceReview() {
  const { organization } = useOrgStore();
  const orgId = organization?.id;
  const router = useRouter();

  const [expenseList, setExpenseList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmApproveAllOpen, setConfirmApproveAllOpen] = useState(false);

  useEffect(() => {
    async function fetchExpenses() {
      if (!orgId) return;

      try {
        setLoading(true);
        const { data, error } = await expenses.getByOrg(orgId);
        if (error) throw error;

        let managerApprovedExpenses = (data || [])
          .filter((exp: any) => exp.status === "approved")
          .map((exp: any) => ({
            ...exp,
            expense_type: exp.category || exp.type || exp.expense_type || "—",
            approver_name: exp.approver?.full_name || "—",
            creator_name: exp.creator?.full_name || "—",
          }));

        // Bulk fetch event titles
        const eventIds = [
          ...new Set(
            managerApprovedExpenses
              .map((e: any) => e.event_id)
              .filter((id: any) => typeof id === "string" && id.length > 0)
          ),
        ];

        if (eventIds.length > 0) {
          const { data: eventsData, error: evErr } = await supabase
            .from("expense_events")
            .select("id,title")
            .in("id", eventIds);
          if (!evErr && eventsData) {
            const titleMap: Record<string, string> = {};
            eventsData.forEach((ev: { id: string; title: string }) => {
              titleMap[ev.id] = ev.title;
            });
            managerApprovedExpenses = managerApprovedExpenses.map((e: any) => ({
              ...e,
              event_title: e.event_id ? titleMap[e.event_id] || "N/A" : "N/A",
            }));
          } else {
            managerApprovedExpenses = managerApprovedExpenses.map((e: any) => ({
              ...e,
              event_title: "N/A",
            }));
          }
        } else {
          managerApprovedExpenses = managerApprovedExpenses.map((e: any) => ({
            ...e,
            event_title: "N/A",
          }));
        }

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

  const handleApproveAll = async () => {
    if (!orgId || expenseList.length === 0) {
      toast.warning("No expenses to approve.");
      return;
    }

    try {
      setLoading(true);

      const results = await Promise.all(
        expenseList.map((expense) =>
          expenses.updateByFinance(expense.id, true, "").catch((err) => ({ error: err }))
        )
      );

      const failed = results.filter((res: any) => res?.error);
      if (failed.length > 0) {
        toast.error(`${failed.length} approvals failed`);
      } else {
        toast.success("All expenses approved by Finance");
      }

      setExpenseList([]);
    } catch (err: any) {
      toast.error("Approval failed", { description: err.message });
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Finance Review</h2>
        <Button
          onClick={() => setConfirmApproveAllOpen(true)}
          className="bg-gray-600 hover:bg-gray-700 text-white cursor-pointer"
          disabled={expenseList.length === 0 || loading}
        >
          Approve All
        </Button>

      </div>

      <div className="rounded-md border shadow-sm bg-white overflow-x-auto">
        <Table className="w-full text-sm">
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="text-center py-3">S.No.</TableHead>
              <TableHead className="text-center py-3">Timestamp</TableHead>
              <TableHead className="text-center py-3">Expense Type</TableHead>
              <TableHead className="text-center py-3">Event Name</TableHead>
              <TableHead className="text-center py-3">Location</TableHead>
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
                <TableCell colSpan={11} className="text-center py-6">
                  Loading...
                </TableCell>
              </TableRow>
            ) : expenseList.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="text-center py-6 text-gray-500">
                  No expenses pending finance review
                </TableCell>
              </TableRow>
            ) : (
              expenseList.map((expense, index) => (
                <TableRow
                  key={expense.id}
                  className="hover:bg-gray-50 transition-all py-3"
                >
                  <TableCell className="text-center py-3">{index + 1}</TableCell>
                  <TableCell className="text-center py-3 whitespace-nowrap">{formatDateTime(expense.created_at)}</TableCell>
                  <TableCell className="text-center py-3">{expense.expense_type}</TableCell>
                  <TableCell className="text-center py-3">{expense.event_title || "N/A"}</TableCell>
                  <TableCell className="text-center py-3">{expense.location || "N/A"}</TableCell>
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
                      className="p-2 hover:text-black text-gray-700 transition-colors cursor-pointer"
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
      <Dialog open={confirmApproveAllOpen} onOpenChange={setConfirmApproveAllOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bulk Approval</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to approve all listed expenses?</p>
          <DialogFooter className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmApproveAllOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-gray-600 hover:bg-gray-700 text-white"
              onClick={async () => {
                setConfirmApproveAllOpen(false);
                await handleApproveAll(); // Call the actual approval logic
              }}
            >
              Yes, Approve All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
