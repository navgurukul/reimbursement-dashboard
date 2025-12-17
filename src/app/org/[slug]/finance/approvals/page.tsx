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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { ExpenseStatusBadge } from "@/components/ExpenseStatusBadge";
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
          expenses
            .updateByFinance(expense.id, true, "")
            .catch((err) => ({ error: err }))
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
      <div className="flex items-center justify-end">
        {/* <h2 className="subsection-heading">Finance Review</h2> */}
        <Button
          onClick={() => setConfirmApproveAllOpen(true)}
          disabled={expenseList.length === 0 || loading}
        >
          Approve All
        </Button>
      </div>

      <div className="rounded-md border shadow-sm bg-white overflow-x-auto">
        <Table className="w-full text-sm">
          <TableHeader className="bg-gray-300">
            <TableRow>
              <TableHead className="px-4 py-3 text-center">S.No.</TableHead>
              <TableHead className="px-4 py-3 text-center">Timestamp</TableHead>
              <TableHead className="px-4 py-3 text-center">Unique ID</TableHead>
              <TableHead className="px-4 py-3 text-center">
                Expense Type
              </TableHead>
              <TableHead className="px-4 py-3 text-center">
                Event Name
              </TableHead>
              <TableHead className="px-4 py-3 text-center">Location</TableHead>
              <TableHead className="px-4 py-3 text-center">Amount</TableHead>
              <TableHead className="px-4 py-3 text-center">Date</TableHead>
              <TableHead className="px-4 py-3 text-center">
                Submitted By
              </TableHead>
              <TableHead className="px-4 py-3 text-center">
                Approved By
              </TableHead>
              <TableHead className="px-4 py-3 text-center">Status</TableHead>
              <TableHead className="px-4 py-3 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableSkeleton colSpan={12} rows={5} />
            ) : expenseList.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={12}
                  className="text-center py-6 text-muted-foreground"
                >
                  No expenses pending finance review
                </TableCell>
              </TableRow>
            ) : (
              expenseList.map((expense, index) => (
                <TableRow
                  key={expense.id}
                  className="hover:bg-gray-50 transition-colors"
                >
                  <TableCell className="px-4 py-3 text-center">
                    {index + 1}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center whitespace-nowrap">
                    {formatDateTime(expense.created_at)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    <span className="font-mono">
                      {expense.unique_id || "N/A"}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {expense.expense_type}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {expense.event_title || "N/A"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {expense.location || "N/A"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center font-medium text-green-700">
                    {formatCurrency(expense.amount)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center whitespace-nowrap">
                    {new Date(expense.date).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {expense.creator_name}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {expense.approver_name}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    <ExpenseStatusBadge status="approved" />
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => handleViewClick(expense)}
                            className="hover:text-black text-gray-700 transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>View Expense</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Dialog
        open={confirmApproveAllOpen}
        onOpenChange={setConfirmApproveAllOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Bulk Approval</DialogTitle>
          </DialogHeader>
          <p>Are you sure you want to approve all listed expenses?</p>
          <DialogFooter className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmApproveAllOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="neutral"
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
