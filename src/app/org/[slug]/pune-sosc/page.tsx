"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import { toast } from "sonner";
import supabase from "@/lib/supabase";
import { ExpenseStatusBadge } from "@/components/ExpenseStatusBadge";
import { Pagination, usePagination, PER_PAGE } from "@/components/pagination";
import {
  WhereTheMoneyGoesChart,
  MonthlyTrendChart,
  ApprovalPipelineChart,
  SpendingPatternChart,
  TopSpendersChart,
} from "@/components/DashboardCharts";
import {
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Download,
  IndianRupee,
  LayoutGrid,
  PieChart,
  Users,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
 

type QuickRangeValue = "7d" | "30d" | "90d" | "ytd" | "all";
type DashboardTab = "overview" | "categories" | "people" | "timeline" | "approvals";

export default function PuneSoSCDashboard() {
  const { slug } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { organization, userRole } = useOrgStore();

  const [expensesData, setExpensesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedTick, setLastUpdatedTick] = useState(Date.now());
  const [quickRange, setQuickRange] = useState<QuickRangeValue>("all");
  const [filters, setFilters] = useState({
    expenseType: "ALL",
    status: "ALL",
    date: "ALL",
    month: "ALL",
    user: "ALL",
    uniqueId: "ALL",
    timeRange: "day",
  });
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [highlightedExpenseId, setHighlightedExpenseId] = useState<string | null>(null);
  const [isExpensesOpen, setIsExpensesOpen] = useState(false);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);
  const hasReturnNavigationParams =
    Number(searchParams.get("page")) > 0 || Boolean(searchParams.get("expID"));
  const isRestoringViewedExpenseRef = useRef(hasReturnNavigationParams);

  const orgId = organization?.id;

  useEffect(() => {
    async function fetchData() {
      if (!orgId) return;
      setLoading(true);

      try {
        // Fetch only for location = 'CP Pune-SoSC'
        let query = supabase
          .from("expense_new")
          .select("*, creator:profiles!user_id(full_name, email)")
          .eq("org_id", orgId)
          .eq("location", "CP Pune-SoSC");

        const { data, error } = await query;

        if (error) throw error;

        const approverIds = Array.from(
          new Set((data || []).map((exp: any) => exp.approver_id).filter(Boolean))
        );

        let approverMap: Record<string, string> = {};
        if (approverIds.length > 0) {
          const { data: approvers } = await supabase
            .from("profiles")
            .select("user_id, full_name, email")
            .in("user_id", approverIds);

          approverMap = (approvers || []).reduce((acc: Record<string, string>, approver: any) => {
            acc[approver.user_id] = approver.full_name || approver.email || approver.user_id;
            return acc;
          }, {});
        }

        // Format the data to match expected structure
        const formattedData = (data || []).map((exp: any) => ({
          ...exp,
          creator_name: exp.creator?.full_name || exp.creator?.email || exp.user_id,
          approver_name: exp.approver_id ? approverMap[exp.approver_id] || exp.approver_id : "—",
        }));

        // Sort by timestamp ascending (oldest first)
        formattedData.sort((a: any, b: any) => {
          const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
          return ta - tb;
        });

        setExpensesData(formattedData);
      } catch (error: any) {
        toast.error("Failed to load dashboard data", { description: error.message });
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [orgId]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setLastUpdatedTick(Date.now());
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  // Handle expID from URL parameter
  useEffect(() => {
    const expID = searchParams.get("expID");
    if (expID) {
      setHighlightedExpenseId(expID);
    }
  }, [searchParams]);

  // Clear highlighted ID after 10 seconds
  useEffect(() => {
    if (!highlightedExpenseId) return;

    const timer = window.setTimeout(() => {
      setHighlightedExpenseId(null);
    }, 10000);

    return () => window.clearTimeout(timer);
  }, [highlightedExpenseId]);

  // Update ref on navigation state changes
  useEffect(() => {
    isRestoringViewedExpenseRef.current = hasReturnNavigationParams;
  }, [hasReturnNavigationParams]);

  const timeRangeFilteredData = useMemo(() => {
    if (quickRange === "all") {
      return expensesData;
    }

    const now = new Date();
    const nowMs = now.getTime();

    return expensesData.filter((expense) => {
      const rawDate = expense.date || expense.created_at;
      if (!rawDate) return false;

      const expenseDate = new Date(rawDate);
      if (Number.isNaN(expenseDate.getTime())) return false;

      if (quickRange === "ytd") {
        const yearStart = new Date(now.getFullYear(), 0, 1);
        return expenseDate >= yearStart && expenseDate <= now;
      }

      const days = quickRange === "7d" ? 7 : quickRange === "30d" ? 30 : 90;
      const diffMs = nowMs - expenseDate.getTime();
      return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000;
    });
  }, [expensesData, quickRange]);

  // Apply filters
  const filteredData = useMemo(() => {
    return timeRangeFilteredData.filter((e) => {
      if (filters.expenseType !== "ALL" && e.expense_type !== filters.expenseType) return false;
      if (filters.status !== "ALL" && e.status !== filters.status) return false;
      if (filters.user !== "ALL" && e.creator_name !== filters.user) return false;
      if (filters.uniqueId !== "ALL" && (e.unique_id || e.uniqueId || "") !== filters.uniqueId) return false;

      if (filters.date !== "ALL" && e.date) {
        const selectedDate = filters.date;
        const expDate = new Date(e.date).toISOString().split('T')[0];
        if (expDate !== selectedDate) return false;
      }

      if (filters.month !== "ALL" && e.date) {
        const selectedMonth = filters.month;
        const date = new Date(e.date);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const expMonth = `${year}-${month}`;
        if (expMonth !== selectedMonth) return false;
      }

      return true;
    });
  }, [timeRangeFilteredData, filters]);

  // Chart data for categories: respect time range and other filters but NOT the expenseType filter.
  const categoryChartData = useMemo(() => {
    return timeRangeFilteredData.filter((e) => {
      if (filters.status !== "ALL" && e.status !== filters.status) return false;
      if (filters.user !== "ALL" && e.creator_name !== filters.user) return false;
      if (filters.uniqueId !== "ALL" && (e.unique_id || e.uniqueId || "") !== filters.uniqueId) return false;
      if (filters.date !== "ALL" && e.date) {
        const selectedDate = filters.date;
        const expDate = new Date(e.date).toISOString().split('T')[0];
        if (expDate !== selectedDate) return false;
      }
      if (filters.month !== "ALL" && e.date) {
        const selectedMonth = filters.month;
        const date = new Date(e.date);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const expMonth = `${year}-${month}`;
        if (expMonth !== selectedMonth) return false;
      }

      return true;
    });
  }, [timeRangeFilteredData, filters.status, filters.user, filters.uniqueId, filters.date, filters.month]);

  // Chart data for top spenders: respect time range and other filters but NOT the user filter.
  const topSpendersChartData = useMemo(() => {
    return timeRangeFilteredData.filter((e) => {
      if (filters.expenseType !== "ALL" && e.expense_type !== filters.expenseType) return false;
      if (filters.status !== "ALL" && e.status !== filters.status) return false;
      if (filters.uniqueId !== "ALL" && (e.unique_id || e.uniqueId || "") !== filters.uniqueId) return false;

      if (filters.date !== "ALL" && e.date) {
        const selectedDate = filters.date;
        const expDate = new Date(e.date).toISOString().split('T')[0];
        if (expDate !== selectedDate) return false;
      }

      if (filters.month !== "ALL" && e.date) {
        const selectedMonth = filters.month;
        const date = new Date(e.date);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const expMonth = `${year}-${month}`;
        if (expMonth !== selectedMonth) return false;
      }

      return true;
    });
  }, [timeRangeFilteredData, filters.expenseType, filters.status, filters.uniqueId, filters.date, filters.month]);

  // Calculate high-level metrics
  const totalAmount = useMemo(() => {
    return filteredData.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  }, [filteredData]);

  const uniquePeopleCount = useMemo(() => {
    const people = new Set(
      filteredData
        .map((exp) => exp.creator_name || exp.user_id)
        .filter(Boolean)
    );

    return people.size;
  }, [filteredData]);

  const reportingPeriod = useMemo(() => {
    const expenseDates = filteredData
      .map((expense) => expense.date || expense.created_at)
      .filter(Boolean)
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    if (expenseDates.length === 0) {
      return "—";
    }

    const startDate = expenseDates[0];
    const endDate = expenseDates[expenseDates.length - 1];

    const startLabel = startDate.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: startDate.getFullYear() === endDate.getFullYear() ? undefined : "numeric",
    });

    const endLabel = endDate.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    return `${startLabel} → ${endLabel}`;
  }, [filteredData]);

  const pagination = usePagination(filteredData);

  // Reset page when filters change (but not when restoring from detail view)
  useEffect(() => {
    if (!isRestoringViewedExpenseRef.current) {
      pagination.resetPage();
    }
  }, [filters]);

  // Handle page parameter from URL
  useEffect(() => {
    const pageParam = Number(searchParams.get("page"));
    if (Number.isInteger(pageParam) && pageParam > 0) {
      pagination.setCurrentPage(Math.min(pageParam, pagination.totalPages));
    }
  }, [searchParams, pagination.totalPages, pagination.setCurrentPage]);

  // Move to the page containing the highlighted row
  useEffect(() => {
    const hasRequestedPage = Number(searchParams.get("page")) > 0;

    if (highlightedExpenseId && filteredData.length > 0 && !hasRequestedPage) {
      const recordIndex = filteredData.findIndex(r => r.id === highlightedExpenseId);
      if (recordIndex !== -1) {
        const pageNumber = Math.floor(recordIndex / PER_PAGE) + 1;
        pagination.setCurrentPage(pageNumber);
      }
    }
  }, [highlightedExpenseId, filteredData, searchParams, pagination.setCurrentPage]);

  // Scroll to highlighted row after the target page renders
  useEffect(() => {
    if (!highlightedExpenseId || !highlightedRowRef.current) return;

    const timer = window.setTimeout(() => {
      highlightedRowRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });

      if (hasReturnNavigationParams) {
        isRestoringViewedExpenseRef.current = false;
        const params = new URLSearchParams(searchParams.toString());
        params.delete("page");
        params.delete("expID");
        router.replace(`?${params.toString()}`, { scroll: false });
      }
    }, 200);

    return () => window.clearTimeout(timer);
  }, [highlightedExpenseId, pagination.currentPage, pagination.paginatedData, hasReturnNavigationParams, searchParams, router]);

  const summaryCards = useMemo(() => {
    const now = new Date();
    const formatAmount = (value: number) => `₹${value.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
    const getExpenseDate = (expense: any) => {
      const rawDate = expense.date || expense.created_at;
      if (!rawDate) return null;

      const parsed = new Date(rawDate);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    };

    const getRangeWindowDays = () => {
      if (quickRange === "7d") return 7;
      if (quickRange === "30d") return 30;
      if (quickRange === "90d") return 90;
      if (quickRange === "ytd") {
        const yearStart = new Date(now.getFullYear(), 0, 1);
        return Math.max(1, Math.ceil((now.getTime() - yearStart.getTime()) / (24 * 60 * 60 * 1000)) + 1);
      }

      return 30;
    };

    const normalizedStatus = (status: string) => String(status || "").trim().toLowerCase();
    const pendingStatuses = new Set([
      "pending",
      "submitted",
      "awaiting approval",
      "under review",
      "in review",
      "approval pending",
    ]);

    const pendingItems = filteredData.filter((expense) => pendingStatuses.has(normalizedStatus(expense.status)));
    const pendingAmount = pendingItems.reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);
    const oldestPendingAgeDays = pendingItems.reduce((maxAge, expense) => {
      const date = getExpenseDate(expense);
      if (!date) return maxAge;

      const age = Math.max(0, Math.floor((now.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)));
      return Math.max(maxAge, age);
    }, 0);

    const categoryTotals = filteredData.reduce((acc: Record<string, { amount: number; count: number }>, expense) => {
      const key = expense.expense_type || "Uncategorized";
      const amount = Number(expense.amount) || 0;
      if (!acc[key]) acc[key] = { amount: 0, count: 0 };
      acc[key].amount += amount;
      acc[key].count += 1;
      return acc;
    }, {});

    const largestCategoryEntry = Object.entries(categoryTotals).sort(([, a], [, b]) => b.amount - a.amount)[0];
    const largestCategoryName = largestCategoryEntry?.[0] ?? "—";
    const largestCategoryAmount = largestCategoryEntry?.[1].amount ?? 0;
    const largestCategoryCount = largestCategoryEntry?.[1].count ?? 0;
    const largestCategoryShare = totalAmount > 0 ? (largestCategoryAmount / totalAmount) * 100 : 0;

    const dailyTotals = filteredData.reduce((acc: Record<string, number>, expense) => {
      const date = getExpenseDate(expense);
      if (!date) return acc;

      const key = date.toISOString().split("T")[0];
      acc[key] = (acc[key] || 0) + (Number(expense.amount) || 0);
      return acc;
    }, {});

    const currentWindowDays = getRangeWindowDays();
    const currentWindowStart = new Date(now);
    currentWindowStart.setDate(now.getDate() - currentWindowDays);
    const previousWindowStart = new Date(currentWindowStart);
    previousWindowStart.setDate(currentWindowStart.getDate() - currentWindowDays);

    const currentWindowTotal = filteredData
      .filter((expense) => {
        const date = getExpenseDate(expense);
        return date ? date >= currentWindowStart && date <= now : false;
      })
      .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

    const previousWindowTotal = filteredData
      .filter((expense) => {
        const date = getExpenseDate(expense);
        return date ? date >= previousWindowStart && date < currentWindowStart : false;
      })
      .reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0);

    const totalChangePct = previousWindowTotal > 0 ? ((currentWindowTotal - previousWindowTotal) / previousWindowTotal) * 100 : null;
    const totalChangeDirection = totalChangePct == null ? "neutral" : totalChangePct > 0 ? "up" : totalChangePct < 0 ? "down" : "neutral";

    const sparkline = Object.entries(dailyTotals)
      .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
      .slice(-14)
      .map(([, amount]) => amount);

    const sparklinePoints =
      sparkline.length > 1
        ? sparkline.map((value, index) => {
          const x = (index / Math.max(1, sparkline.length - 1)) * 100;
          const max = Math.max(...sparkline, 1);
          const y = 30 - (value / max) * 22;
          return { x, y };
        })
        : [];

    const sparklineLinePath =
      sparklinePoints.length > 1
        ? sparklinePoints.reduce((path, point, index) => {
          if (index === 0) return `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;

          const prev = sparklinePoints[index - 1];
          const midX = ((prev.x + point.x) / 2).toFixed(2);
          return `${path} Q ${midX} ${prev.y.toFixed(2)} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
        }, "")
        : "";

    const sparklineAreaPath = sparklineLinePath ? `${sparklineLinePath} L 100 30 L 0 30 Z` : "";

    const outlierDays = Object.entries(dailyTotals)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 2)
      .map(([date, amount]) => ({
        date,
        amount,
      }));

    const totalChangeAmount = currentWindowTotal - previousWindowTotal;
    const windowLabel = quickRange === "ytd" ? "vs previous period" : quickRange === "all" ? `vs last 30 days` : `vs last ${currentWindowDays} days`;

    return {
      totalAmount,
      pendingAmount,
      pendingCount: pendingItems.length,
      oldestPendingAgeDays,
      largestCategoryName,
      largestCategoryAmount,
      largestCategoryCount,
      largestCategoryShare,
      currentWindowTotal,
      previousWindowTotal,
      totalChangeAmount,
      totalChangePct,
      totalChangeDirection,
      windowLabel,
      sparkline,
      sparklineLinePath,
      sparklineAreaPath,
      outlierDays,
      formatAmount,
    };
  }, [filteredData, totalAmount, quickRange]);

  // Compute unique filter options from data
  const filterOptions = useMemo(() => {
    const types = Array.from(new Set(timeRangeFilteredData.map((e) => e.expense_type).filter((v): v is string => !!v))).sort();
    const statuses = Array.from(new Set(timeRangeFilteredData.map((e) => e.status).filter((v): v is string => !!v))).sort();
    const users = Array.from(new Set(timeRangeFilteredData.map((e) => e.creator_name).filter((v): v is string => !!v))).sort();
    const uniqueIds = Array.from(new Set(timeRangeFilteredData.map((e) => e.unique_id || e.uniqueId).filter((v): v is string => !!v))).sort();
    const dates = Array.from(
      new Set(
        timeRangeFilteredData
          .map((e): string | null => {
            if (!e.date) return null;
            const d = new Date(e.date);
            return Number.isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
          })
          .filter((v): v is string => v != null)
      )
    ).sort();
    const months = Array.from(
      new Set(
        timeRangeFilteredData
          .map((e): string | null => {
            if (!e.date) return null;
            const d = new Date(e.date);
            if (Number.isNaN(d.getTime())) return null;
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          })
          .filter((v): v is string => v != null)
      )
    ).sort();

    return { types, statuses, users, uniqueIds, dates, months };
  }, [timeRangeFilteredData]);

  const formatMonthLabel = (ym: string) => {
    const [year, month] = ym.split("-");
    const d = new Date(Number(year), Number(month) - 1);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  };

  const formatDateLabel = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const exportToCSV = () => {
    if (filteredData.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = ["Date", "Name", "Category", "Amount", "Status", "Unique ID"];
    const rows = filteredData.map((e) => [
      e.date ? new Date(e.date).toLocaleDateString("en-US") : e.created_at ? new Date(e.created_at).toLocaleDateString("en-US") : "",
      e.creator_name || "",
      e.expense_type || "",
      e.amount || 0,
      e.status || "",
      e.unique_id || e.uniqueId || "",
    ]);
    const csvContent = [headers, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `pune-sosc-expenses-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredData.length} records`);
  };

  const activeFilterCount = [
    filters.expenseType !== "ALL",
    filters.status !== "ALL",
    filters.user !== "ALL",
    filters.date !== "ALL",
    filters.month !== "ALL",
  ].filter(Boolean).length;

  const isOverviewTab = activeTab === "overview";
  const showCategoriesTab = isOverviewTab || activeTab === "categories";
  const showPeopleTab = isOverviewTab || activeTab === "people";
  const showTimelineTab = isOverviewTab || activeTab === "timeline";
  const showApprovalsTab = isOverviewTab || activeTab === "approvals";

  return (
    <div className="space-y-6 bg-[#f4f6f8] min-h-screen -m-6 p-6 overflow-x-hidden">
      <div className="flex w-full flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Pune SoSC Dashboard Overview</h1>
          <p className="text-base text-muted-foreground">
            {filteredData.length} expenses across {uniquePeopleCount} people
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={exportToCSV}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
          <div className="flex flex-wrap items-center rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            {(["7d", "30d", "90d", "ytd", "all"] as QuickRangeValue[]).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setQuickRange(range)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  quickRange === range
                    ? "bg-slate-900 text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {range === "all" ? "All time" : range === "ytd" ? "YTD" : range.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={filters.expenseType}
          onValueChange={(value) => setFilters((f) => ({ ...f, expenseType: value }))}
        >
          <SelectTrigger className="w-[170px] rounded-lg border-slate-200 bg-white text-sm shadow-sm">
            <span className="text-slate-400 mr-1">Type:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All types</SelectItem>
            {filterOptions.types.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.status}
          onValueChange={(value) => setFilters((f) => ({ ...f, status: value }))}
        >
          <SelectTrigger className="w-[180px] rounded-lg border-slate-200 bg-white text-sm shadow-sm">
            <span className="text-slate-400 mr-1">Status:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {filterOptions.statuses.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.user}
          onValueChange={(value) => setFilters((f) => ({ ...f, user: value }))}
        >
          <SelectTrigger className="w-[180px] rounded-lg border-slate-200 bg-white text-sm shadow-sm">
            <span className="text-slate-400 mr-1">User:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All users</SelectItem>
            {filterOptions.users.map((u) => (
              <SelectItem key={u} value={u}>{u}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.date}
          onValueChange={(value) => setFilters((f) => ({ ...f, date: value }))}
        >
          <SelectTrigger className="w-[190px] rounded-lg border-slate-200 bg-white text-sm shadow-sm">
            <span className="text-slate-400 mr-1">Date:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All dates</SelectItem>
            {filterOptions.dates.map((d) => (
              <SelectItem key={d} value={d}>{formatDateLabel(d)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.month}
          onValueChange={(value) => setFilters((f) => ({ ...f, month: value }))}
        >
          <SelectTrigger className="w-[180px] rounded-lg border-slate-200 bg-white text-sm shadow-sm">
            <span className="text-slate-400 mr-1">Month:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All months</SelectItem>
            {filterOptions.months.map((m) => (
              <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() =>
              setFilters({
                expenseType: "ALL",
                status: "ALL",
                date: "ALL",
                month: "ALL",
                user: "ALL",
                uniqueId: "ALL",
                timeRange: "day",
              })
            }
            className="text-sm font-medium text-slate-500 hover:text-slate-900 underline underline-offset-2 transition-colors"
          >
            Clear filters ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Tabs*/}
      <div className="w-full overflow-x-auto">
        <div className="inline-flex min-w-max items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors cursor-pointer ${activeTab === "overview"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
          >
            <LayoutGrid className="h-4 w-4" />
            Overview
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("categories")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors cursor-pointer ${activeTab === "categories"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
          >
            <PieChart className="h-4 w-4" />
            Categories
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("people")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors cursor-pointer ${activeTab === "people"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
          >
            <Users className="h-4 w-4" />
            People
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("timeline")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors cursor-pointer ${activeTab === "timeline"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
          >
            <Calendar className="h-4 w-4" />
            Timeline
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("approvals")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors cursor-pointer ${activeTab === "approvals"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
          >
            <CheckCircle className="h-4 w-4" />
            Approvals
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Total Spent Card */}
        <Card className="rounded-2xl border-0 overflow-hidden bg-gradient-to-br from-[#5c7afc] via-[#7b7efb] to-[#9d83f8] text-white">
          <CardContent className="p-8 flex flex-col h-full">
            <div>
              <p className="text-[13px] font-bold tracking-widest text-white/80 uppercase mb-3">Total spent</p>
              <div className="text-5xl font-bold text-white tracking-tight leading-none mb-1">
                {summaryCards.formatAmount(summaryCards.totalAmount)}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-3">
              <div className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-[13px] font-semibold backdrop-blur-md">
                {summaryCards.totalChangePct != null ? (
                  <>
                    {summaryCards.totalChangeDirection === "up" ? "▲" : summaryCards.totalChangeDirection === "down" ? "▼" : "—"}
                    {" "}
                    {Math.abs(summaryCards.totalChangePct).toFixed(0)}% vs last period
                  </>
                ) : (
                  "No prior data"
                )}
              </div>
              <span className="text-[14px] font-medium text-white/90">
                {filteredData.length} claims
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Trend Chart */}
        <Card className="lg:col-span-2 rounded-2xl border border-slate-200/80 bg-white shadow-sm flex flex-col">
          <CardContent className="p-6 md:p-8 flex-1">
            <MonthlyTrendChart data={filteredData} />
          </CardContent>
        </Card>
      </div>

      {/* Filters Section */}
      {/* Primary charts */}
      {showCategoriesTab ? (
        <div id="where-money-goes-section" className="grid grid-cols-1 gap-5">
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-3 px-0 pb-0">
            <CardTitle className="text-2xl font-semibold text-slate-900">
              Where the money goes
            </CardTitle>
            <p className="text-sm text-slate-500">Top 5 shown · expand to see all</p>
          </CardHeader>
          <Card className="flex flex-col gap-0">
            <CardContent className="min-h-[380px] flex-1 pb-4 pt-0">
              {loading ? (
                <div className="h-full min-h-[320px] w-full animate-pulse rounded-md bg-gray-100" />
              ) : (
                <WhereTheMoneyGoesChart
                  data={categoryChartData}
                  selectedCategory={filters.expenseType === "ALL" ? undefined : filters.expenseType}
                  onCategoryClick={(category) =>
                    setFilters((current) => ({
                      ...current,
                      expenseType: category ?? "ALL",
                    }))
                  }
                />
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {(showApprovalsTab || showPeopleTab || showTimelineTab) ? (
        <div className="flex flex-col gap-5">
          <div className={`grid grid-cols-1 gap-5 ${showApprovalsTab && showTimelineTab ? "lg:grid-cols-2" : ""}`}>
            {showTimelineTab ? (
              <Card className="flex flex-col rounded-2xl border border-slate-200/80 shadow-sm gap-0">
                <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-0 pb-2">
                  <CardTitle className="text-[17px] font-bold text-slate-900">
                    Spending pattern
                  </CardTitle>
                  <span className="text-[13px] text-slate-500">Darker = busier day</span>
                </CardHeader>
                <CardContent className="min-h-[380px] flex-1 pb-4 pt-0">
                  {loading ? (
                    <div className="h-full min-h-[320px] w-full animate-pulse rounded-md bg-gray-100" />
                  ) : (
                    <SpendingPatternChart data={topSpendersChartData} />
                  )}
                </CardContent>
              </Card>
            ) : null}

            {showApprovalsTab ? (
              <Card className="flex flex-col rounded-2xl border border-slate-200/80 shadow-sm gap-0">
                <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-0 pb-2">
                  <CardTitle className="text-[17px] font-bold text-slate-900">
                    Approval pipeline
                  </CardTitle>
                  <span className="text-[13px] text-slate-500">{filteredData.length} total claims</span>
                </CardHeader>
                <CardContent className="min-h-[380px] flex-1 pb-4 pt-0">
                  {loading ? (
                    <div className="h-full min-h-[320px] w-full animate-pulse rounded-md bg-gray-100" />
                  ) : (
                    <ApprovalPipelineChart
                      data={filteredData}
                      selectedStatus={filters.status === "ALL" ? undefined : filters.status}
                      onStatusClick={(status) =>
                        setFilters((current) => ({
                          ...current,
                          status: status ?? "ALL",
                        }))
                      }
                    />
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>

          {showPeopleTab ? (
            <div className="flex flex-col gap-0 mt-2">
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1 sm:gap-3 px-0 pb-4">
                <CardTitle className="text-2xl font-semibold text-slate-900">
                  Who's claiming
                </CardTitle>
                <p className="text-sm text-slate-500">Bars sized by total claimed</p>
              </CardHeader>
              <Card className="flex flex-col rounded-2xl border border-slate-200/80 shadow-sm gap-0 p-6">
                {loading ? (
                  <div className="h-full min-h-[320px] w-full animate-pulse rounded-md bg-gray-100" />
                ) : (
                  <TopSpendersChart
                    data={topSpendersChartData}
                    selectedUser={filters.user === "ALL" ? undefined : filters.user}
                    onUserClick={(user) =>
                      setFilters((current) => ({
                        ...current,
                        user: user ?? "ALL",
                      }))
                    }
                    hideHeader={true}
                  />
                )}
              </Card>
            </div>
          ) : null}
        </div>
      ) : null}

      {isOverviewTab ? (
        <Card className="gap-0 p-0 mb-10 rounded-2xl border border-slate-200/80 shadow-sm bg-white">
          <div 
            className={`p-6 cursor-pointer flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between transition-colors hover:bg-slate-50 rounded-2xl ${isExpensesOpen ? "border-b border-gray-100 rounded-b-none" : ""}`}
            onClick={() => setIsExpensesOpen(!isExpensesOpen)}
          >
            <div className="flex flex-col gap-1">
              <h3 className="text-[17px] font-bold text-slate-900">All expenses</h3>
              <p className="text-[13px] text-slate-500">Tap to see the full list of {filteredData.length} claims</p>
            </div>
            <div className="flex items-center gap-4">
              <button 
                type="button" 
                className="text-slate-500 hover:text-slate-900 transition-colors"
              >
                {isExpensesOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
              </button>
            </div>
          </div>
          {isExpensesOpen && (
          <CardContent className="pl-5 pr-5">
            <TooltipProvider>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold uppercase tracking-widest text-slate-400 whitespace-nowra">#</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-widest text-slate-400 whitespace-nowra">DATE</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-widest text-slate-400 whitespace-nowra">WHO</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-widest text-slate-400 whitespace-nowra">CATEGORY</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-widest text-slate-400 whitespace-nowra">AMOUNT</TableHead>
                      {/* <TableHead className="text-xs font-semibold uppercase tracking-widest text-slate-400 whitespace-nowra">APPROVER</TableHead> */}
                      <TableHead className="text-xs font-semibold uppercase tracking-widest text-slate-400 whitespace-nowra">STATUS</TableHead>
                      {/* <TableHead className="text-xs font-semibold uppercase tracking-widest text-slate-400 whitespace-nowra text-center">ACTIONS</TableHead> */}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                          <div className="flex justify-center items-center gap-2">
                            <div className="h-4 w-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                            Loading data...
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : pagination.paginatedData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                          No expenses found matching the filters
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagination.paginatedData.map((expense, index) => (
                        <TableRow
                          ref={expense.id === highlightedExpenseId ? highlightedRowRef : null}
                          key={expense.id}
                          className={`hover:bg-gray-50/50 transition-colors ${expense.id === highlightedExpenseId
                              ? "border-2 border-yellow-400 bg-yellow-50"
                              : ""
                            }`}
                        >
                          <TableCell className="whitespace-nowrap text-[13px] font-medium text-slate-400">
                            {pagination.getItemNumber(index)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-[13px] font-medium text-slate-900">
                            {expense.created_at ? (
                              <div className="flex flex-col gap-0.5">
                                <span>{new Date(expense.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                {/* <span className="text-sm text-gray-500">{new Date(expense.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}</span> */}
                              </div>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-[13px] font-medium text-slate-900">
                            <div className="flex flex-col gap-0.5">
                              <span>{expense.creator_name || '—'}</span>
                              {/* <span className="text-sm text-gray-500 font-mono">{expense.unique_id || '—'}</span> */}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-[13px] text-slate-500">
                            {expense.expense_type || '—'}
                          </TableCell>
                          <TableCell className="text-[13px] font-bold text-slate-900 whitespace-nowrap">
                            ₹{Number(expense.amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                          </TableCell>
                          {/* <TableCell className="whitespace-nowrap text-sm">
                            {expense.approver_name || expense.approver?.full_name || '—'}
                          </TableCell> */}
                          <TableCell className="whitespace-nowrap text-left">
                            <ExpenseStatusBadge status={expense.status} />
                          </TableCell>
                          {/* <TableCell className="text-center">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  aria-label="View Expense"
                                  className="inline-flex items-center justify-center rounded-md p-1 text-gray-700 hover:bg-gray-100 hover:text-gray-900 cursor-pointer"
                                  onClick={() => router.push(`/org/${slug}/pune-sosc/${expense.id}`)}
                                >
                                  <Eye className="h-4 w-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>View Expense</TooltipContent>
                            </Tooltip>
                          </TableCell> */}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TooltipProvider>

            <div className="p-4 border-t border-gray-100">
              <Pagination
                currentPage={pagination.currentPage}
                totalPages={pagination.totalPages}
                totalItems={pagination.totalItems}
                itemLabel="Expenses"
                onPageChange={pagination.setCurrentPage}
              />
            </div>
          </CardContent>
          )}
        </Card>
      ) : null}

    </div>
  );
}
