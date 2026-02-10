"use client";

import { useOrgStore } from "@/store/useOrgStore";
import { expenses } from "@/lib/db";
import supabase from "@/lib/supabase";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Pagination, PER_PAGE, usePagination } from "@/components/pagination";

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);

const calculateTdsAmount = (
  baseAmount: number | null | undefined,
  percentage: number | null | undefined
) => {
  if (!percentage || baseAmount === null || baseAmount === undefined) return null;
  const amount = (baseAmount * percentage) / 100;
  return Number(amount.toFixed(2));
};

export default function FinanceReview() {
  const { organization } = useOrgStore();
  const orgId = organization?.id;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [expenseList, setExpenseList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmApproveAllOpen, setConfirmApproveAllOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [hasAppliedHighlight, setHasAppliedHighlight] = useState(false);
  const highlightedRowRef = useRef<HTMLTableRowElement | null>(null);

  // Use pagination hook
  const pagination = usePagination(expenseList);

  const highlightQuery = searchParams.get("expID");
  const pageQuery = searchParams.get("page");

  useEffect(() => {
    setHighlightId(highlightQuery);
    setHasAppliedHighlight(false);
  }, [highlightQuery]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = window.setTimeout(() => setHighlightId(null), 10000);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

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
            tds_deduction_percentage: exp.tds_deduction_percentage ?? null,
            tds_deduction_amount: exp.tds_deduction_amount ?? null,
            actual_amount: exp.actual_amount ?? null,
          }));

        // Sort by manager_approve_time in ascending order (earliest first)
        if (managerApprovedExpenses.length > 0) {
          managerApprovedExpenses.sort((a: any, b: any) => {
            const timeA = a.manager_approve_time ? new Date(a.manager_approve_time).getTime() : 0;
            const timeB = b.manager_approve_time ? new Date(b.manager_approve_time).getTime() : 0;
            // Put null/undefined timestamps at the end
            if (!timeA && !timeB) return 0;
            if (!timeA) return 1;
            if (!timeB) return -1;
            return timeA - timeB;
          });
        }

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

  useEffect(() => {
    if (!expenseList.length) return;

    if (pageQuery) {
      const parsed = parseInt(pageQuery, 10);
      if (!Number.isNaN(parsed)) {
        const clamped = Math.min(Math.max(parsed, 1), pagination.totalPages);
        if (clamped !== pagination.currentPage) {
          pagination.setCurrentPage(clamped);
        }
      }
      return;
    }

    if (highlightQuery) {
      const targetIndex = expenseList.findIndex((item) => item.id === highlightQuery);
      if (targetIndex !== -1) {
        const targetPage = Math.floor(targetIndex / PER_PAGE) + 1;
        if (targetPage !== pagination.currentPage) {
          pagination.setCurrentPage(targetPage);
        }
      }
    }
  }, [
    expenseList,
    highlightQuery,
    pageQuery,
    pagination.currentPage,
    pagination.setCurrentPage,
    pagination.totalPages,
  ]);

  useEffect(() => {
    if (!highlightId || hasAppliedHighlight) return;

    const isVisible = pagination.paginatedData.some((item) => item.id === highlightId);
    if (!isVisible) return;

    const timer = window.setTimeout(() => {
      highlightedRowRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      setHasAppliedHighlight(true);
    }, 200);

    return () => window.clearTimeout(timer);
  }, [highlightId, hasAppliedHighlight, pagination.paginatedData]);

  const handleViewClick = (expense: any) => {
    if (!organization?.slug || !expense?.id) return;
    const params = new URLSearchParams();
    params.set("tab", "approvals");
    params.set("expID", expense.id);
    params.set("page", String(pagination.currentPage));
    router.push(`/org/${organization.slug}/finance/${expense.id}?${params.toString()}`);
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
        toast.success("All expenses have been approved by Finance. Email notification has been sent to the expense creator.");
        
        // Send email notifications to all expense creators
        await Promise.all(
          expenseList.map((expense) =>
            // Only send email if creator email exists
            (expense.creator?.email || expense.creator_email) ? 
            fetch("/api/expenses/notify-creator", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                expenseId: expense.id,
                creatorEmail: expense.creator?.email || expense.creator_email,
                creatorName: expense.creator_name,
                approverName: "Finance Team",
                orgName: organization?.name,
                slug: organization?.slug,
                amount: expense.amount,
                expenseType: expense.expense_type,
                status: "finance_approved",
                decisionStage: "finance",
              }),
            }).catch((err) => {
              console.error("Failed to send notification for expense:", expense.id, err);
            })
            : Promise.resolve()
          )
        );
      }

      setExpenseList([]);
    } catch (err: any) {
      toast.error("Approval failed", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleTdsChange = async (expenseId: string, value: string) => {
    const percentage = value ? Number.parseInt(value, 10) : null;
    const updatedExpenses = expenseList.map((exp) => {
      if (exp.id !== expenseId) return exp;
      const baseAmount = exp.approved_amount ?? exp.amount ?? 0;
      const tdsAmount = calculateTdsAmount(baseAmount, percentage);
      const actualAmount = baseAmount - (tdsAmount ?? 0);
      return {
        ...exp,
        tds_deduction_percentage: percentage,
        tds_deduction_amount: tdsAmount,
        actual_amount: actualAmount,
      };
    });

    setExpenseList(updatedExpenses);

    const expense = updatedExpenses.find((exp) => exp.id === expenseId);
    const tdsAmount = expense?.tds_deduction_amount ?? null;
    const actualAmount = expense?.actual_amount ?? null;

    const { error } = await supabase
      .from("expense_new")
      .update({
        tds_deduction_percentage: percentage,
        tds_deduction_amount: tdsAmount,
        actual_amount: actualAmount,
      })
      .eq("id", expenseId);

    if (error) {
      toast.error("Failed to update TDS deduction");
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
              <TableHead className="px-4 py-3 text-center">
                TDS Deduction
              </TableHead>
              <TableHead className="px-4 py-3 text-center">
                Actual Amount
              </TableHead>
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
              <TableSkeleton colSpan={14} rows={5} />
            ) : expenseList.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={14}
                  className="text-center py-6 text-muted-foreground"
                >
                  No expenses pending finance review
                </TableCell>
              </TableRow>
            ) : (
              pagination.paginatedData.map((expense, index) => {
                const isHighlighted = highlightId === expense.id;

                return (
                  <TableRow
                    key={expense.id}
                    ref={isHighlighted ? highlightedRowRef : null}
                    data-expense-row={expense.id}
                    className={`hover:bg-gray-50 transition-colors ${
                      isHighlighted ? "border-2 border-yellow-400 bg-yellow-50" : ""
                    }`}
                  >
                  <TableCell className="px-4 py-3 text-center">
                    {pagination.getItemNumber(index)}
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
                  <TableCell className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <select
                        className="border px-2 py-1 rounded bg-white text-sm"
                        value={
                          expense.tds_deduction_percentage
                            ? String(expense.tds_deduction_percentage)
                            : ""
                        }
                        onChange={(e) => handleTdsChange(expense.id, e.target.value)}
                      >
                        <option value="">Select %</option>
                        {Array.from({ length: 50 }, (_, idx) => idx + 1).map(
                          (percent) => (
                            <option key={percent} value={percent}>
                              {percent}%
                            </option>
                          )
                        )}
                      </select>
                      <span className="text-xs text-muted-foreground">
                        {expense.tds_deduction_percentage
                          ? formatCurrency(
                              expense.tds_deduction_amount ??
                                calculateTdsAmount(
                                  expense.approved_amount ?? expense.amount ??
                                    0,
                                  expense.tds_deduction_percentage
                                ) ??
                                0
                            )
                          : "—"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {formatCurrency(
                      (expense.approved_amount ?? expense.amount ?? 0) -
                        (expense.tds_deduction_amount ??
                          (expense.tds_deduction_percentage
                            ? calculateTdsAmount(
                                expense.approved_amount ?? expense.amount ?? 0,
                                expense.tds_deduction_percentage
                              ) ?? 0
                            : 0))
                    )}
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
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
      {expenseList.length > 0 && (
        <Pagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          onPageChange={pagination.setCurrentPage}
          isLoading={loading}
          itemLabel="Expenses"
        />
      )}
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
