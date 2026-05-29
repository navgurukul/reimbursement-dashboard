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
  ExpensesByExpenseTypeChart,
  ExpensesAmountChart,
  ExpensesByStatusChart,
  ExpensesTimeChart,
} from "@/components/DashboardCharts";
import { Eye, FileText, IndianRupee, PieChart, BarChart as BarChartIcon } from "lucide-react";

export default function PuneSoSCDashboard() {
  const { slug } = useParams();
  const router = useRouter();
  const { organization, userRole } = useOrgStore();

  const [expensesData, setExpensesData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [lastUpdatedTick, setLastUpdatedTick] = useState(Date.now());
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

  // Derived unique options for filters
  const expenseTypeOptions = useMemo(() => {
    const types = new Set(expensesData.map(e => e.expense_type).filter(Boolean));
    return Array.from(types);
  }, [expensesData]);

  const statusOptions = useMemo(() => {
    const statuses = new Set(expensesData.map(e => e.status).filter(Boolean));
    return Array.from(statuses);
  }, [expensesData]);

  const userOptions = useMemo(() => {
    const users = new Set(expensesData.map(e => e.creator_name).filter(Boolean));
    return Array.from(users);
  }, [expensesData]);

  const uniqueIdOptions = useMemo(() => {
    const uniqueIds = new Set(
      expensesData
        .map((e) => e.unique_id || e.uniqueId)
        .filter(Boolean)
    );
    return Array.from(uniqueIds);
  }, [expensesData]);

  const dateOptions = useMemo(() => {
    const dates = new Set(
      expensesData
        .map((e) => {
          if (e.date) {
            return new Date(e.date).toISOString().split('T')[0];
          }
          return "";
        })
        .filter(Boolean)
    );
    return Array.from(dates).sort().reverse();
  }, [expensesData]);

  // Apply filters
  const filteredData = useMemo(() => {
    return expensesData.filter((e) => {
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
  }, [expensesData, filters]);

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

  const RANGE_LABELS: Record<string, string> = {
    day: 'Day',
    weekly: 'Week',
    monthly: 'Month',
    quarterly: 'Quarter',
    halfyear: 'Half Year',
    year: 'Year',
  };

  function getRangeLabel(key: string | undefined) {
    if (!key) return '';
    return RANGE_LABELS[key] || key;
  }

  return (
    <div className="space-y-6 pt-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-black to-black bg-clip-text text-transparent">
            Pune SoSC Dashboard Overview
          </h1>
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{filteredData.length} expenses</span>
            <span> across </span>
            <span className="font-semibold text-foreground">{uniquePeopleCount} people</span>
            <span> · Last updated {getRelativeLastUpdated(lastUpdatedAt)}</span>
          </p>
        </div>
        <div className="w-fit bg-black text-white px-4 py-2 rounded-lg flex items-center gap-2 font-semibold shadow-sm border border-blue-100">
          <IndianRupee className="h-5 w-5" />
          <span>Total: {totalAmount.toLocaleString()}</span>
        </div>
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

      {/* Charts Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PieChart className="h-4 w-4 text-blue-500" />
              Expenses by Expense Type
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-[350px] pt-4 pb-2 flex-1">
            {loading ? <div className="animate-pulse bg-gray-100 h-full w-full rounded-md" /> : <ExpensesByExpenseTypeChart data={filteredData} />}
          </CardContent>
        </Card>

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

        <Card className="flex flex-col">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PieChart className="h-4 w-4 text-purple-500" />
              Expenses by Time
            </CardTitle>
          </CardHeader>
          <CardContent className="min-h-[350px] pt-4 pb-2 flex-1">
            {loading ? <div className="animate-pulse bg-gray-100 h-full w-full rounded-md" /> : <ExpensesTimeChart data={filteredData} range={filters.timeRange as any} />}
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
