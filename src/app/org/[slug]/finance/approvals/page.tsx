"use client";

import { useOrgStore } from "@/store/useOrgStore";
import { expenses } from "@/lib/db";
import supabase from "@/lib/supabase";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, Filter } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  return Math.round(amount);
};

const toDateOnly = (value?: string | Date | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateForLabel = (dateValue: string) => {
  if (!dateValue) return "";
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) return dateValue;
  return parsedDate.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const isDateWithinRange = (
  value: string | Date | null | undefined,
  mode: string,
  startDate: string,
  endDate: string
) => {
  if (mode === "All Dates") return true;

  const dateValue = toDateOnly(value);
  if (!dateValue) return false;

  if (mode === "Single Date") {
    if (!startDate) return true;
    return dateValue === startDate;
  }

  if (mode === "Custom Date") {
    if (!startDate || !endDate) return false;
    return dateValue >= startDate && dateValue <= endDate;
  }

  return true;
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

  const [filterOpen, setFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState({
    expenseType: "",
    eventName: "",
    submittedBy: "",
    approvedBy: "",
    location: "",
    uniqueId: "",
    startDate: "",
  });
  const [filters, setFilters] = useState({
    expenseType: "All Expense Type",
    eventName: "All Events",
    submittedBy: "All Submitters",
    approvedBy: "All Approvers",
    location: "All Locations",
    uniqueId: "All Unique IDs",
    minAmount: "",
    maxAmount: "",
    minActualAmount: "",
    maxActualAmount: "",
    dateMode: "All Dates",
    startDate: "",
    endDate: "",
  });

  // so they are not lost when navigating back from an expense view
  const isMounted = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("finance-approvals-filters");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.filters) setFilters(parsed.filters);
          if (parsed.searchQuery) setSearchQuery(parsed.searchQuery);
          if (parsed.filterOpen !== undefined) setFilterOpen(parsed.filterOpen);
        } catch (e) {
          console.error("Failed to parse saved filters", e);
        }
      }
    }
    setTimeout(() => {
      isMounted.current = true;
    }, 0);
  }, []);

  // so they are not lost when navigating back from an expense view
  useEffect(() => {
    if (isMounted.current && typeof window !== "undefined") {
      sessionStorage.setItem(
        "finance-approvals-filters",
        JSON.stringify({ filters, searchQuery, filterOpen })
      );
    }
  }, [filters, searchQuery, filterOpen]);

  const expenseTypeOptions = useMemo(
    () => Array.from(new Set(expenseList.map((e) => e.expense_type).filter(Boolean))),
    [expenseList]
  );
  const eventNameOptions = useMemo(
    () => Array.from(new Set(expenseList.map((e) => e.event_title).filter(Boolean))),
    [expenseList]
  );
  const submittedByOptions = useMemo(
    () => Array.from(new Set(expenseList.map((e) => e.creator_name).filter(Boolean))),
    [expenseList]
  );
  const approvedByOptions = useMemo(
    () => Array.from(new Set(expenseList.map((e) => e.approver_name).filter(Boolean))),
    [expenseList]
  );
  const locationOptions = useMemo(
    () => Array.from(new Set(expenseList.map((e) => e.location).filter(Boolean))),
    [expenseList]
  );
  const uniqueIdOptions = useMemo(
    () => Array.from(new Set(expenseList.map((e) => e.unique_id).filter(Boolean))),
    [expenseList]
  );
  const singleDateOptions = useMemo(() => {
    const dates = Array.from(
      new Set(expenseList.map((e) => toDateOnly(e.date)).filter(Boolean))
    );

    return dates.sort((a, b) => a.localeCompare(b));
  }, [expenseList]);

  const filteredExpenseList = useMemo(() => {
    const getActualAmount = (expense: any) => {
      const tdsBaseAmount = expense.approved_amount ?? expense.amount ?? 0;
      const tdsAmount =
        expense.tds_deduction_amount ??
        (expense.tds_deduction_percentage
          ? calculateTdsAmount(tdsBaseAmount, expense.tds_deduction_percentage) ?? 0
          : 0);
      const securityDepositAmount = expense.security_deposit_amount ?? 0;
      const actualAmountBase = expense.amount ?? 0;
      return Math.round(actualAmountBase - tdsAmount - securityDepositAmount);
    };

    return expenseList.filter((expense) => {
      if (
        filters.expenseType !== "All Expense Type" &&
        expense.expense_type !== filters.expenseType
      ) {
        return false;
      }

      if (
        filters.eventName !== "All Events" &&
        (expense.event_title || "N/A") !== filters.eventName
      ) {
        return false;
      }

      if (
        filters.submittedBy !== "All Submitters" &&
        (expense.creator_name || "") !== filters.submittedBy
      ) {
        return false;
      }

      if (
        filters.approvedBy !== "All Approvers" &&
        (expense.approver_name || "") !== filters.approvedBy
      ) {
        return false;
      }

      if (
        filters.location !== "All Locations" &&
        (expense.location || "") !== filters.location
      ) {
        return false;
      }

      if (
        filters.uniqueId !== "All Unique IDs" &&
        (expense.unique_id || "") !== filters.uniqueId
      ) {
        return false;
      }

      const amount = Number(expense.amount ?? 0);
      if (filters.minAmount !== "" && amount < Number(filters.minAmount)) {
        return false;
      }
      if (filters.maxAmount !== "" && amount > Number(filters.maxAmount)) {
        return false;
      }

      const actualAmount = getActualAmount(expense);
      if (
        filters.minActualAmount !== "" &&
        actualAmount < Number(filters.minActualAmount)
      ) {
        return false;
      }
      if (
        filters.maxActualAmount !== "" &&
        actualAmount > Number(filters.maxActualAmount)
      ) {
        return false;
      }

      if (
        !isDateWithinRange(
          expense.date,
          filters.dateMode,
          filters.startDate,
          filters.endDate
        )
      ) {
        return false;
      }

      return true;
    });
  }, [expenseList, filters]);

  // Use pagination hook
  const pagination = usePagination(filteredExpenseList);

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
    if (!filteredExpenseList.length) return;

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
      const targetIndex = filteredExpenseList.findIndex((item) => item.id === highlightQuery);
      if (targetIndex !== -1) {
        const targetPage = Math.floor(targetIndex / PER_PAGE) + 1;
        if (targetPage !== pagination.currentPage) {
          pagination.setCurrentPage(targetPage);
        }
      }
    }
  }, [
    filteredExpenseList,
    highlightQuery,
    pageQuery,
    pagination.setCurrentPage,
    pagination.totalPages,
  ]);

  const handlePageChange = (nextPage: number) => {
    if (nextPage === pagination.currentPage) return;

    pagination.setCurrentPage(nextPage);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("tab", "approvals");
    nextParams.set("page", String(nextPage));
    nextParams.delete("expID");

    router.replace(`?${nextParams.toString()}`, { scroll: false });
  };

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
    if (!orgId || filteredExpenseList.length === 0) {
      toast.warning("No expenses to approve.");
      return;
    }

    try {
      setLoading(true);

      const results = await Promise.all(
        filteredExpenseList.map((expense) =>
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
          filteredExpenseList.map((expense) =>
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

  const clearFilters = () => {
    setFilters({
      expenseType: "All Expense Type",
      eventName: "All Events",
      submittedBy: "All Submitters",
      approvedBy: "All Approvers",
      location: "All Locations",
      uniqueId: "All Unique IDs",
      minAmount: "",
      maxAmount: "",
      minActualAmount: "",
      maxActualAmount: "",
      dateMode: "All Dates",
      startDate: "",
      endDate: "",
    });
    setSearchQuery({
      expenseType: "",
      eventName: "",
      submittedBy: "",
      approvedBy: "",
      location: "",
      uniqueId: "",
      startDate: "",
    });
  };

  const handleTdsChange = async (expenseId: string, value: string) => {
    const percentage = value ? Number.parseInt(value, 10) : null;
    const updatedExpenses = expenseList.map((exp) => {
      if (exp.id !== expenseId) return exp;
      const tdsBaseAmount = exp.approved_amount ?? exp.amount ?? 0;
      const tdsAmount = calculateTdsAmount(tdsBaseAmount, percentage);
      const securityDepositAmount = exp.security_deposit_amount ?? 0;
      const actualAmountBase = exp.amount ?? 0;
      const actualAmount = Math.round(actualAmountBase - (tdsAmount ?? 0) - securityDepositAmount);
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
    } else {
      toast.success("TDS deduction updated successfully", {
        style: { border: "1px solid #22c55e", background: "#f2faf5ff" },
        classNames: { icon: "text-[#22c55e]" }
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2 mb-1">
        {/* <h2 className="subsection-heading">Finance Review</h2> */}
        <Button variant="outline" onClick={() => setFilterOpen((s) => !s)}>
          <Filter className="mr-2 h-4 w-4" />
          Filters
        </Button>
        <Button
          onClick={() => setConfirmApproveAllOpen(true)}
          disabled={filteredExpenseList.length === 0 || loading}
        >
          Approve All
        </Button>
      </div>

      {filterOpen && (
        <div className="p-4 rounded-md border shadow-sm bg-white">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="text-sm font-medium">Unique ID</label>
              <Select
                value={filters.uniqueId || "All Unique IDs"}
                onValueChange={(v) =>
                  setFilters((prev) => ({ ...prev, uniqueId: v }))
                }
              >
                <SelectTrigger className="mt-1 w-full bg-white">
                  <SelectValue placeholder="All Unique IDs" />
                </SelectTrigger>
                <SelectContent
                  searchPlaceholder="Search unique ID..."
                  searchValue={searchQuery.uniqueId}
                  onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, uniqueId: v }))}
                >
                  <SelectItem value="All Unique IDs">All Unique IDs</SelectItem>
                  {uniqueIdOptions
                    .filter((opt) => String(opt).toLowerCase().includes(searchQuery.uniqueId.toLowerCase()))
                    .map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Expense Type</label>
              <Select
                value={filters.expenseType || "All Expense Type"}
                onValueChange={(v) =>
                  setFilters((prev) => ({ ...prev, expenseType: v }))
                }
              >
                <SelectTrigger className="mt-1 w-full bg-white">
                  <SelectValue placeholder="All Expense Type" />
                </SelectTrigger>
                <SelectContent
                  searchPlaceholder="Search expense type..."
                  searchValue={searchQuery.expenseType}
                  onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, expenseType: v }))}
                >
                  <SelectItem value="All Expense Type">All Expense Type</SelectItem>
                  {expenseTypeOptions
                    .filter((opt) => String(opt).toLowerCase().includes(searchQuery.expenseType.toLowerCase()))
                    .map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Event Name</label>
              <Select
                value={filters.eventName || "All Events"}
                onValueChange={(v) =>
                  setFilters((prev) => ({ ...prev, eventName: v }))
                }
              >
                <SelectTrigger className="mt-1 w-full bg-white">
                  <SelectValue placeholder="All Events" />
                </SelectTrigger>
                <SelectContent
                  searchPlaceholder="Search events..."
                  searchValue={searchQuery.eventName}
                  onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, eventName: v }))}
                >
                  <SelectItem value="All Events">All Events</SelectItem>
                  {eventNameOptions
                    .filter((opt) => String(opt).toLowerCase().includes(searchQuery.eventName.toLowerCase()))
                    .map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Project of Expense</label>
              <Select
                value={filters.location || "All Locations"}
                onValueChange={(v) =>
                  setFilters((prev) => ({ ...prev, location: v }))
                }
              >
                <SelectTrigger className="mt-1 w-full bg-white">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent
                  searchPlaceholder="Search projects..."
                  searchValue={searchQuery.location}
                  onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, location: v }))}
                >
                  <SelectItem value="All Locations">All Projects</SelectItem>
                  {locationOptions
                    .filter((opt) => String(opt).toLowerCase().includes(searchQuery.location.toLowerCase()))
                    .map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Amount Range</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder="Min"
                  className="w-full border rounded px-3 py-2 bg-white"
                  value={filters.minAmount}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, minAmount: e.target.value }))
                  }
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Max"
                  className="w-full border rounded px-3 py-2 bg-white"
                  value={filters.maxAmount}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, maxAmount: e.target.value }))
                  }
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Actual Amount Range</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder="Min"
                  className="w-full border rounded px-3 py-2 bg-white"
                  value={filters.minActualAmount}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, minActualAmount: e.target.value }))
                  }
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Max"
                  className="w-full border rounded px-3 py-2 bg-white"
                  value={filters.maxActualAmount}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, maxActualAmount: e.target.value }))
                  }
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Date</label>
              <Select
                value={filters.dateMode || "All Dates"}
                onValueChange={(v) =>
                  setFilters((prev) => {
                    const nextMode = v;
                    return {
                      ...prev,
                      dateMode: nextMode,
                      startDate: nextMode === "All Dates" ? "" : prev.startDate,
                      endDate: nextMode === "Custom Date" ? prev.endDate : "",
                    };
                  })
                }
              >
                <SelectTrigger className="mt-1 w-full bg-white">
                  <SelectValue placeholder="All Dates" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Dates">All Dates</SelectItem>
                  <SelectItem value="Single Date">
                    {filters.startDate
                      ? `Single Date (${formatDateForLabel(filters.startDate)})`
                      : "Single Date"}
                  </SelectItem>
                  <SelectItem value="Custom Date">Custom Date</SelectItem>
                </SelectContent>
              </Select>

              {filters.dateMode === "Single Date" && (
                <Select
                  value={filters.startDate || "none"}
                  onValueChange={(v) =>
                    setFilters((prev) => ({ ...prev, startDate: v === "none" ? "" : v }))
                  }
                >
                  <SelectTrigger className="mt-2 w-full bg-white">
                    <SelectValue placeholder="Select Date" />
                  </SelectTrigger>
                  <SelectContent
                    searchPlaceholder="Search date..."
                    searchValue={searchQuery.startDate}
                    onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, startDate: v }))}
                  >
                    <SelectItem value="none">Select Date</SelectItem>
                    {singleDateOptions
                      .filter((dateValue) => formatDateForLabel(dateValue).toLowerCase().includes(searchQuery.startDate.toLowerCase()))
                      .map((dateValue) => (
                        <SelectItem key={dateValue} value={dateValue}>
                          {formatDateForLabel(dateValue)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}

              {filters.dateMode === "Custom Date" && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2 bg-white"
                    value={filters.startDate}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, startDate: e.target.value }))
                    }
                  />
                  <input
                    type="date"
                    className="w-full border rounded px-3 py-2 bg-white"
                    value={filters.endDate}
                    onChange={(e) =>
                      setFilters((prev) => ({ ...prev, endDate: e.target.value }))
                    }
                  />
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium">Submitted By</label>
              <Select
                value={filters.submittedBy || "All Submitters"}
                onValueChange={(v) =>
                  setFilters((prev) => ({ ...prev, submittedBy: v }))
                }
              >
                <SelectTrigger className="mt-1 w-full bg-white">
                  <SelectValue placeholder="All Submitters" />
                </SelectTrigger>
                <SelectContent
                  searchPlaceholder="Search submitter..."
                  searchValue={searchQuery.submittedBy}
                  onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, submittedBy: v }))}
                >
                  <SelectItem value="All Submitters">All Submitters</SelectItem>
                  {submittedByOptions
                    .filter((opt) => String(opt).toLowerCase().includes(searchQuery.submittedBy.toLowerCase()))
                    .map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Approved By</label>
              <Select
                value={filters.approvedBy || "All Approvers"}
                onValueChange={(v) =>
                  setFilters((prev) => ({ ...prev, approvedBy: v }))
                }
              >
                <SelectTrigger className="mt-1 w-full bg-white">
                  <SelectValue placeholder="All Approvers" />
                </SelectTrigger>
                <SelectContent
                  searchPlaceholder="Search approver..."
                  searchValue={searchQuery.approvedBy}
                  onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, approvedBy: v }))}
                >
                  <SelectItem value="All Approvers">All Approvers</SelectItem>
                  {approvedByOptions
                    .filter((opt) => String(opt).toLowerCase().includes(searchQuery.approvedBy.toLowerCase()))
                    .map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFilterOpen(false)}>
              Close
            </Button>
            <Button variant="outline" onClick={clearFilters}>
              Clear Filters
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-md border shadow-sm bg-white max-h-[75vh] overflow-auto [&>div]:overflow-visible">
        <Table className="w-full text-sm">
          <TableHeader className="bg-gray-300 sticky top-0 z-10">
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
              <TableHead className="px-4 py-3 text-center">Project of Expense</TableHead>
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
            ) : filteredExpenseList.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={14}
                  className="text-start py-6 px-4 text-muted-foreground"
                >
                  {expenseList.length === 0
                    ? "Expenses are currently not available for finance review."
                    : "No expenses match selected filters."}
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
                    className={`hover:bg-gray-50 transition-colors ${isHighlighted ? "border-2 border-yellow-400 bg-yellow-50" : ""
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
                    <TableCell className="px-4 py-3 text-center text-sm">
                      {formatCurrency(
                        Math.round((expense.amount ?? 0) -
                          (expense.tds_deduction_amount ??
                            (expense.tds_deduction_percentage
                              ? calculateTdsAmount(
                                expense.approved_amount ?? expense.amount ?? 0,
                                expense.tds_deduction_percentage
                              ) ?? 0
                              : 0)) -
                          (expense.security_deposit_amount ?? 0))
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
                              className="p-1.5 rounded-md border border-transparent hover:border-gray-300 hover:bg-white transition-all cursor-pointer text-black hover:text-black"
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
      {filteredExpenseList.length > 0 && (
        <Pagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          onPageChange={handlePageChange}
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
