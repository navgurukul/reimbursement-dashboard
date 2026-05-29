"use client";

import { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import supabase from "@/lib/supabase";
import { ExpenseStatusBadge } from "@/components/ExpenseStatusBadge";
import { Pagination, usePagination } from "@/components/pagination";
import { formatDateTime } from "@/lib/utils";
import {
  ExpensesAmountChart,
  ExpensesByStatusChart,
  WhereTheMoneyGoesChart,
  DailySpendTrendChart,
} from "@/components/DashboardCharts";
import {
  AlertTriangle,
  BarChart2,
  BarChart as BarChartIcon,
  Clock3,
  Eye,
  FileText,
  IndianRupee,
  PieChart,
  Sparkles,
} from "lucide-react";

const QUICK_RANGE_OPTIONS = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "ytd", label: "YTD" },
  { value: "all", label: "All time" },
] as const;

type QuickRangeValue = (typeof QUICK_RANGE_OPTIONS)[number]["value"];

export default function PuneSoSCDashboard() {
  const { slug } = useParams();
  const router = useRouter();
  const { organization, userRole } = useOrgStore();

  const [expensesData, setExpensesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [lastUpdatedTick, setLastUpdatedTick] = useState(Date.now());
  const [quickRange, setQuickRange] = useState<QuickRangeValue>("all");
  const [filters, setFilters] = useState({
    expenseType: "ALL",
    status: "ALL",
    date: "ALL",
    user: "ALL",
    uniqueId: "ALL",
    timeRange: "day",
  });

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
        setLastUpdatedAt(new Date());
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

  // Derived unique options for filters
  const expenseTypeOptions = useMemo(() => {
    const types = new Set(timeRangeFilteredData.map(e => e.expense_type).filter(Boolean));
    return Array.from(types);
  }, [timeRangeFilteredData]);

  const statusOptions = useMemo(() => {
    const statuses = new Set(timeRangeFilteredData.map(e => e.status).filter(Boolean));
    return Array.from(statuses);
  }, [timeRangeFilteredData]);

  const userOptions = useMemo(() => {
    const users = new Set(timeRangeFilteredData.map(e => e.creator_name).filter(Boolean));
    return Array.from(users);
  }, [timeRangeFilteredData]);

  const uniqueIdOptions = useMemo(() => {
    const uniqueIds = new Set(
      timeRangeFilteredData
        .map((e) => e.unique_id || e.uniqueId)
        .filter(Boolean)
    );
    return Array.from(uniqueIds);
  }, [timeRangeFilteredData]);

  const dateOptions = useMemo(() => {
    const dates = new Set(
      timeRangeFilteredData
        .map((e) => {
          if (e.date) {
            return new Date(e.date).toISOString().split('T')[0];
          }
          return "";
        })
        .filter(Boolean)
    );
    return Array.from(dates).sort().reverse();
  }, [timeRangeFilteredData]);

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

      return true;
    });
  }, [timeRangeFilteredData, filters.status, filters.user, filters.uniqueId, filters.date]);

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

  function getRelativeLastUpdated(value: Date | null) {
    if (!value) return "just now";

    const diffMs = Math.max(0, lastUpdatedTick - value.getTime());
    const minutes = Math.floor(diffMs / 60_000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"} ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;

    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? "" : "s"} ago`;
  }

  const pagination = usePagination(filteredData);

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

  return (
    <div className="space-y-6 pt-0">
      <div className="flex flex-col gap-0">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-black to-black bg-clip-text text-transparent">
            Pune SoSC Dashboard Overview
          </h1>
        </div>
        <div className="flex w-full items-center justify-between gap-4 overflow-hidden">
          <p className="min-w-0 flex-1 whitespace-nowrap text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{filteredData.length} expenses</span>
            <span> across </span>
            <span className="font-semibold text-foreground">{uniquePeopleCount} people</span>
            <span> · Last updated {getRelativeLastUpdated(lastUpdatedAt)}</span>
          </p>
          <div className="inline-flex shrink-0 items-center rounded-xl border bg-background p-1 shadow-sm">
            {QUICK_RANGE_OPTIONS.map((option) => {
              const isActive = quickRange === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setQuickRange(option.value)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${isActive
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                    }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        {/* <div className="w-fit bg-black text-white px-4 py-2 rounded-lg flex items-center gap-2 font-semibold shadow-sm border border-blue-100">
          <IndianRupee className="h-5 w-5" />
          <span>Total: {totalAmount.toLocaleString()}</span>
        </div> */}
      </div>

      {/* Filters Section */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <Select value={filters.expenseType} onValueChange={(val) => setFilters((f) => ({ ...f, expenseType: val }))}>
          <SelectTrigger className="w-full sm:w-[200px] rounded-xl">
            <div className="flex w-full items-center gap-2 overflow-hidden text-sm">
              <span className="text-muted-foreground">Type:</span>
              <span className="truncate font-semibold">{filters.expenseType === "ALL" ? "All types" : filters.expenseType}</span>
            </div>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="ALL">All types</SelectItem>
            {expenseTypeOptions.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.status} onValueChange={(val) => setFilters((f) => ({ ...f, status: val }))}>
          <SelectTrigger className="w-full sm:w-[200px] rounded-xl">
            <div className="flex w-full items-center gap-2 overflow-hidden text-sm">
              <span className="text-muted-foreground">Status:</span>
              <span className="truncate font-semibold">{filters.status === "ALL" ? "All statuses" : filters.status}</span>
            </div>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="ALL">All statuses</SelectItem>
            {statusOptions.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.user} onValueChange={(val) => setFilters((f) => ({ ...f, user: val }))}>
          <SelectTrigger className="w-full sm:w-[180px] rounded-xl">
            <div className="flex w-full items-center gap-2 overflow-hidden text-sm">
              <span className="text-muted-foreground">User:</span>
              <span className="truncate font-semibold">{filters.user === "ALL" ? "All users" : filters.user}</span>
            </div>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="ALL">All users</SelectItem>
            {userOptions.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.uniqueId} onValueChange={(val) => setFilters((f) => ({ ...f, uniqueId: val }))}>
          <SelectTrigger className="w-full sm:w-[190px] rounded-xl">
            <div className="flex w-full items-center gap-2 overflow-hidden text-sm">
              <span className="text-muted-foreground">Unique ID:</span>
              <span className="truncate font-semibold">{filters.uniqueId === "ALL" ? "All IDs" : filters.uniqueId}</span>
            </div>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="ALL">All IDs</SelectItem>
            {uniqueIdOptions.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.date} onValueChange={(val) => setFilters((f) => ({ ...f, date: val }))}>
          <SelectTrigger className="w-full sm:w-[190px] rounded-xl">
            <div className="flex w-full items-center gap-2 overflow-hidden text-sm">
              <span className="text-muted-foreground">Date:</span>
              <span className="truncate font-semibold">
                {filters.date === "ALL"
                  ? "All dates"
                  : new Date(filters.date).toLocaleDateString("en-GB", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
              </span>
            </div>
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="ALL">All dates</SelectItem>
            {dateOptions.map((dateOption) => (
              <SelectItem key={dateOption} value={dateOption}>
                {new Date(dateOption).toLocaleDateString("en-GB", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <CardContent className="relative p-5 pb-14">
            <div className="relative z-10 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-500">
                <IndianRupee className="h-4 w-4" />
                <span className="text-sm font-semibold text-slate-600">Total this period</span>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${summaryCards.totalChangeDirection === "up"
                    ? "bg-rose-50 text-rose-600"
                    : summaryCards.totalChangeDirection === "down"
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-slate-100 text-slate-600"
                  }`}
              >
                {summaryCards.totalChangePct == null
                  ? quickRange === "all"
                    ? "All time"
                    : "—"
                  : `${summaryCards.totalChangePct > 0 ? "↑" : summaryCards.totalChangePct < 0 ? "↓" : "→"} ${Math.abs(summaryCards.totalChangePct).toFixed(1)}%`}
              </span>
            </div>

            <div className="relative z-10 mt-3">
              <p className="text-3xl font-bold tracking-tight text-slate-900">{summaryCards.formatAmount(summaryCards.totalAmount)}</p>
              <p className="mt-1 text-sm text-slate-500">
                {summaryCards.totalChangeAmount !== 0
                  ? `${summaryCards.totalChangeAmount > 0 ? "+" : "−"}${summaryCards.formatAmount(Math.abs(summaryCards.totalChangeAmount))} ${summaryCards.windowLabel}`
                  : summaryCards.windowLabel}
              </p>
            </div>

            {summaryCards.sparkline.length > 1 ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14">
                <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-full w-full">
                  <defs>
                    <linearGradient id="pune-total-spark" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d={summaryCards.sparklineAreaPath} fill="url(#pune-total-spark)" />
                  <path
                    d={summaryCards.sparklineLinePath}
                    fill="none"
                    stroke="#8b5cf6"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden rounded-2xl border border-amber-200/80 bg-amber-50/60 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-amber-700">
                <Clock3 className="h-4 w-4" />
                <span className="text-sm font-semibold text-slate-600">Pending your approval</span>
              </div>
              <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                {summaryCards.pendingCount} open
              </span>
            </div>

            <div className="mt-3">
              <p className="text-3xl font-bold tracking-tight text-slate-900">
                {summaryCards.pendingCount} <span className="font-normal text-slate-400">·</span> {summaryCards.formatAmount(summaryCards.pendingAmount)}
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-500">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                <span>
                  Oldest waiting{" "}
                  <span className="font-semibold text-amber-700">{summaryCards.oldestPendingAgeDays || 0} days</span>
                  {" · review now →"}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-sky-600">
                <BarChart2 className="h-4 w-4" />
                <span className="text-sm font-semibold text-slate-600">Largest category</span>
              </div>
              <span className="shrink-0 rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">
                {summaryCards.largestCategoryShare.toFixed(0)}%
              </span>
            </div>

            <div className="mt-3 min-w-0">
              <p className="truncate text-3xl font-bold tracking-tight text-slate-900">{summaryCards.largestCategoryName}</p>
              <p className="mt-1 text-sm text-slate-500">
                {summaryCards.formatAmount(summaryCards.largestCategoryAmount)} across {summaryCards.largestCategoryCount} claims
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-rose-600">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-semibold text-slate-600">Outlier days</span>
              </div>
              <span className="shrink-0 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
                {summaryCards.outlierDays.length} spikes
              </span>
            </div>

            <div className="mt-3">
              <p className="text-3xl font-bold tracking-tight text-slate-900">{summaryCards.outlierDays.length} spikes</p>
              {summaryCards.outlierDays.length > 0 ? (
                <p className="mt-1 text-sm text-slate-500">
                  {summaryCards.outlierDays
                    .map((item) =>
                      `${new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${summaryCards.formatAmount(item.amount)}`
                    )
                    .join(" · ")}
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-500">No outlier days found for the selected data.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Primary charts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="flex flex-col rounded-2xl border border-slate-200/80 shadow-sm gap-0">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900">
              Where the money goes
            </CardTitle>
          </CardHeader>
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

        <Card className="flex flex-col rounded-2xl border border-slate-200/80 shadow-sm gap-0">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-slate-900">
              Daily spend trend
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-[380px] flex-1 pb-4 pt-0">
            {loading ? (
              <div className="h-full min-h-[320px] w-full animate-pulse rounded-md bg-gray-100" />
            ) : (
              <DailySpendTrendChart data={filteredData} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Secondary charts */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BarChartIcon className="h-4 w-4 text-emerald-500" />
              Expenses Amount
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-[350px] pt-4 pb-2 flex-1">
            {loading ? <div className="animate-pulse bg-gray-100 h-full w-full rounded-md" /> : <ExpensesAmountChart data={filteredData} />}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PieChart className="h-4 w-4 text-purple-500" />
              Expenses by Status
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-[350px] pt-4 pb-2 flex-1">
            {loading ? <div className="animate-pulse bg-gray-100 h-full w-full rounded-md" /> : <ExpensesByStatusChart data={filteredData} />}
          </CardContent>
        </Card>
      </div>

      {/* Expense Details Table */}
      <Card className="gap-0 pt-0">
        <CardHeader className="border-b bg-gray-300 rounded">
          <CardTitle className="text-lg flex items-center gap-2 mt-2">
            <FileText className="h-5 w-5 text-gray-900" />
            Pune SoSC Expense Details
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <TooltipProvider>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="font-semibold whitespace-nowrap">S.No.</TableHead>
                    <TableHead className="font-semibold whitespace-nowrap">Timestamp</TableHead>
                    <TableHead className="font-semibold whitespace-nowrap">Unique ID</TableHead>
                    <TableHead className="font-semibold whitespace-nowrap">Expense Type</TableHead>
                    {/* <TableHead className="font-semibold whitespace-nowrap">Event Name</TableHead> */}
                    <TableHead className="font-semibold whitespace-nowrap text-right">Amount</TableHead>
                    <TableHead className="font-semibold whitespace-nowrap">Date</TableHead>
                    <TableHead className="font-semibold whitespace-nowrap">Created By</TableHead>
                    <TableHead className="font-semibold whitespace-nowrap">Approver</TableHead>
                    <TableHead className="font-semibold whitespace-nowrap">Status</TableHead>
                    <TableHead className="font-semibold whitespace-nowrap text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={11} className="h-32 text-center text-muted-foreground">
                        <div className="flex justify-center items-center gap-2">
                          <div className="h-4 w-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
                          Loading data...
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : pagination.paginatedData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="h-32 text-center text-muted-foreground">
                        No expenses found matching the filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    pagination.paginatedData.map((expense, index) => (
                      <TableRow key={expense.id} className="hover:bg-gray-50/50 transition-colors">
                        <TableCell className="whitespace-nowrap text-sm text-center">
                          {pagination.getItemNumber(index)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {formatDateTime(expense.created_at)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm font-mono">
                          {expense.unique_id || '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {expense.expense_type || '—'}
                        </TableCell>
                        {/* <TableCell className="whitespace-nowrap text-sm">
                        {expense.event_title || expense.event_name || 'N/A'}
                      </TableCell> */}
                        <TableCell className="text-right font-medium whitespace-nowrap">
                          ₹{Number(expense.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {expense.date ? new Date(expense.date).toLocaleDateString('en-GB') : '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {expense.creator_name || '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {expense.approver_name || expense.approver?.full_name || '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-left">
                          <ExpenseStatusBadge status={expense.status} />
                        </TableCell>
                        <TableCell className="text-center">
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
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TooltipProvider>

          <div className="p-4 border-t">
            <Pagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalItems={pagination.totalItems}
              itemLabel="Expenses"
              onPageChange={pagination.setCurrentPage}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
