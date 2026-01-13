"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { orgSettings, expenses } from "@/lib/db";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  PlusCircle,
  Filter,
  Download,
  MoreHorizontal,
  Eye,
  Pencil,
  Copy,
  Trash2,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { ExpenseStatusBadge } from "@/components/ExpenseStatusBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatDateTime } from "@/lib/utils";
import supabase from "@/lib/supabase";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Pagination, usePagination } from "@/components/pagination";

const defaultExpenseColumns = [
  { key: "date", label: "Date", visible: true },
  { key: "category", label: "Category", visible: true },
  { key: "event_title", label: "Event", visible: true },
  { key: "amount", label: "Amount", visible: true },
  { key: "creator_name", label: "Created By", visible: true },
  { key: "receipt", label: "Receipt", visible: true },
  { key: "finance_comment", label: "Rejection Reason", visible: true },
  { key: "approver", label: "Approver", visible: true },
];

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "INR",
  }).format(amount);

export default function ExpensesPage() {
  const router = useRouter();
  const { slug } = useParams();
  const searchParams = useSearchParams();
  const { organization, userRole } = useOrgStore();
  const { user } = useAuthStore();

  const orgId = organization?.id!;

  const [columns, setColumns] = useState<any[]>([]);
  const [expensesData, setExpensesData] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);
  const [allExpenses, setAllExpenses] = useState<any[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    approved: 0,
    finance_approved: 0,
    pending: 0,
    rejected: 0,
    finance_rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"my" | "pending" | "all">("my");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    expenseType: "",
    eventName: "",
    amountMin: "",
    amountMax: "",
    dateFrom: "",
    dateTo: "",
    dateMode: "ALL",
    createdBy: "",
    approver: "",
    status: "",
    uniqueId: "",
  });
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    expenseId: string | null;
  }>({
    isOpen: false,
    expenseId: null,
  });

  const OPTION_ALL = "ALL";

  const allDataCombined = useMemo(() => {
    return [...expensesData, ...pendingApprovals, ...allExpenses];
  }, [expensesData, pendingApprovals, allExpenses]);

  const unique = (values: any[]) =>
    Array.from(
      new Set(
        values.filter(
          (v) => v !== undefined && v !== null && String(v).trim() !== ""
        )
      )
    );

  const expenseTypeOptions = useMemo(
    () =>
      unique(
        allDataCombined.map(
          (e: any) => e.expense_type || e.category || e.custom_fields?.category
        )
      ),
    [allDataCombined]
  );

  const eventNameOptions = useMemo(
    () => unique(allDataCombined.map((e: any) => e.event_title)),
    [allDataCombined]
  );

  const creatorOptions = useMemo(
    () =>
      unique(
        allDataCombined.map((e: any) => e.creator?.full_name || e.creator_name)
      ),
    [allDataCombined]
  );

  const approverOptions = useMemo(
    () => unique(allDataCombined.map((e: any) => e.approver?.full_name)),
    [allDataCombined]
  );

  const statusOptions = useMemo(
    () => unique(allDataCombined.map((e: any) => e.status)),
    [allDataCombined]
  );

  const uniqueIdOptions = useMemo(
    () => unique(allDataCombined.map((e: any) => e.unique_id)),
    [allDataCombined]
  );

  // Amount slider from available data
  const amountBounds = useMemo(() => {
    const amounts = allDataCombined
      .map((e: any) => Number(e.amount))
      .filter((n) => !Number.isNaN(n));
    if (amounts.length === 0) return { min: 0, max: 50000 };
    const min = Math.floor(Math.min(...amounts));
    const max = Math.ceil(Math.max(...amounts));
    return { min: Math.max(0, min), max: Math.max(1, max) };
  }, [allDataCombined]);

  const amountStep = useMemo(() => {
    const range = amountBounds.max - amountBounds.min;
    if (range <= 1000) return 10;
    if (range <= 10000) return 100;
    if (range <= 100000) return 500;
    return 1000;
  }, [amountBounds]);

  const currentMinAmount = useMemo(
    () => (filters.amountMin ? Number(filters.amountMin) : amountBounds.min),
    [filters.amountMin, amountBounds]
  );
  const currentMaxAmount = useMemo(
    () => (filters.amountMax ? Number(filters.amountMax) : amountBounds.max),
    [filters.amountMax, amountBounds]
  );

  // Local input states so we can show bounds while allowing typing
  const [amountMinInput, setAmountMinInput] = useState<string>(
    String(amountBounds.min)
  );
  const [amountMaxInput, setAmountMaxInput] = useState<string>(
    String(amountBounds.max)
  );

  useEffect(() => {
    // keep inputs in sync when bounds or filters change
    setAmountMinInput(filters.amountMin ? String(filters.amountMin) : String(amountBounds.min));
  }, [filters.amountMin, amountBounds.min]);

  useEffect(() => {
    setAmountMaxInput(filters.amountMax ? String(filters.amountMax) : String(amountBounds.max));
  }, [filters.amountMax, amountBounds.max]);

  // Determine tabs based on role
  const tabs =
    userRole === "member"
      ? [{ value: "my", label: "My Expenses" }]
      : [
          { value: "my", label: "My Expenses" },
          { value: "pending", label: "Pending Approval" },
          { value: "all", label: "All Expenses" },
        ];

  // Sync activeTab with URL query parameter
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "my" || tabParam === "pending" || tabParam === "all") {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    async function fetchData() {
      if (!orgId) return;
      setLoading(true);

      // 1) load org settings (columns)
      const { data: s, error: se } = await orgSettings.getByOrgId(orgId);
      if (se) {
        toast.error("Failed to load settings", { description: se.message });
        setColumns(defaultExpenseColumns);
      } else {
        // Safely handle the case where settings or expense_columns might be undefined
        let expenseColumns = s?.expense_columns ?? defaultExpenseColumns;

        // ✅ Remove any existing 'description' columns
        expenseColumns = expenseColumns.filter((c) => c.key !== "description");

        // Remove any existing 'Location of Expense' columns
        expenseColumns = expenseColumns.filter((c) => c.key !== "location");

        // Ensure creator_name column exists
        if (!expenseColumns.some((c) => c.key === "creator_name")) {
          expenseColumns.splice(3, 0, {
            key: "creator_name",
            label: "Created By",
            visible: true,
            type: "text",
          });
        }

        // Ensure event_title column exists
        if (!expenseColumns.some((c) => c.key === "event_title")) {
          // Place Event after Category if present, else near the start
          const categoryIdx = expenseColumns.findIndex(
            (c) => c.key === "category"
          );
          const insertIdx = categoryIdx >= 0 ? categoryIdx + 1 : 1;
          expenseColumns.splice(insertIdx, 0, {
            key: "event_title",
            label: "Event Name",
            visible: true,
            type: "text",
          });
        }

        setColumns(expenseColumns);
      }

      // 2) load expenses per role
      let my: any[] = [],
        pending: any[] = [],
        all: any[] = [];

      if (userRole === "member") {
        // Members can only see their own expenses
        const { data, error } = await expenses.getByOrgAndUser(
          orgId,
          user?.id!
        );
        if (error)
          toast.error("Failed to load expenses", {
            description: error.message,
          });
        my = data ?? [];
        all = data ?? [];
      } else if (userRole === "manager") {
        // Managers see their own expenses, pending approvals, and expenses where they are assigned as approver
        const [
          { data: myData, error: myErr },
          { data: pendingData, error: pendingErr },
          { data: allData, error: allErr },
        ] = await Promise.all([
          expenses.getByOrgAndUser(orgId, user?.id!),
          expenses.getPendingApprovals(orgId, user?.id!),
          expenses.getByApprover(orgId, user?.id!),
        ]);

        if (myErr)
          toast.error("Failed to load your expenses", {
            description: myErr.message,
          });
        if (pendingErr)
          toast.error("Failed to load pending approvals", {
            description: pendingErr.message,
          });
        if (allErr)
          toast.error("Failed to load expenses where you are approver", {
            description: allErr.message,
          });

        my = myData ?? [];
        pending = pendingData ?? [];
        all = allData ?? [];
      } else {
        // Admins and owners can see all views
        const [
          { data: myData, error: myErr },
          { data: pendingData, error: pendingErr },
          { data: allData, error: allErr },
        ] = await Promise.all([
          expenses.getByOrgAndUser(orgId, user?.id!),
          expenses.getPendingApprovals(orgId, user?.id!),
          expenses.getByOrg(orgId),
        ]);

        if (myErr)
          toast.error("Failed to load your expenses", {
            description: myErr.message,
          });
        if (pendingErr)
          toast.error("Failed to load pending approvals", {
            description: pendingErr.message,
          });
        if (allErr)
          toast.error("Failed to load all expenses", {
            description: allErr.message,
          });

        my = myData ?? [];
        pending = pendingData ?? [];
        all = allData ?? [];
      }

      // 3) Check for vouchers for each expense
      if (my.length > 0 || all.length > 0 || pending.length > 0) {
        const processExpenseData = async (expensesList: any[]) => {
          if (!expensesList || expensesList.length === 0) {
            return [];
          }

          const processedExpenses = [...expensesList];

          try {
            // Get expense IDs
            const expenseIds = processedExpenses.map((exp) => exp.id);

            // Collect unique event ids
            const eventIds = [
              ...new Set(
                processedExpenses
                  .map((exp) => exp.event_id)
                  .filter((id) => typeof id === "string" && id.length > 0)
              ),
            ];

            // Fetch vouchers
            const { data: allVouchers, error: voucherError } = await supabase
              .from("vouchers")
              .select("*")
              .in("expense_id", expenseIds);

            if (voucherError) {
              console.error("Error fetching vouchers:", voucherError);
            }

            // Create voucher lookup map
            const voucherMap: Record<string, any> = {};
            if (allVouchers && allVouchers.length > 0) {
              allVouchers.forEach((voucher) => {
                voucherMap[voucher.expense_id] = voucher;
              });
            }

            // Get all approver names at once using our new function
            // const approverNamesMap = await expenses.getApproverNames(
            //   expenseIds
            // );

            // Fetch event titles in bulk
            const eventTitleMap: Record<string, string> = {};
            if (eventIds.length > 0) {
              const { data: eventsData, error: eventsErr } = await supabase
                .from("expense_events")
                .select("id,title")
                .in("id", eventIds);
              if (!eventsErr && eventsData) {
                eventsData.forEach((ev: { id: string; title: string }) => {
                  eventTitleMap[ev.id] = ev.title;
                });
              }
            }

            // Process each expense
            for (const expense of processedExpenses) {
              try {
                // Check for voucher
                const voucher = voucherMap[expense.id];
                if (voucher) {
                  expense.hasVoucher = true;
                  expense.voucherId = voucher.id;
                }

                // Get approver name from our map
                const approverName = expense.approver.full_name || "—";
                // approverNamesMap[expense.id] || "Unknown Approver";

                // Set approver info on the expense
                expense.approver = {
                  full_name: approverName,
                  user_id: expense.approver_id || voucher?.approver_id,
                };

                // Set event title if available
                if (expense.event_id) {
                  expense.event_title =
                    eventTitleMap[expense.event_id] || "N/A";
                } else {
                  expense.event_title = "N/A";
                }
              } catch (error) {
                console.error(`Error processing expense ${expense.id}:`, error);
              }
            }

            return processedExpenses;
          } catch (error) {
            console.error("Error in processExpenseData:", error);
            return processedExpenses;
          }
        };

        // Then use this function to process your expense lists
        my = await processExpenseData(my);
        if (userRole !== "member") {
          pending = await processExpenseData(pending);
          all = await processExpenseData(all);
        }
      }
      setExpensesData(my);
      setPendingApprovals(pending);

      setAllExpenses(all);
      // compute stats on "all"
      setStats({
        total: all.length,
        approved: all.filter((e) => e.status === "approved").length,
        finance_approved: all.filter((e) => e.status === "finance_approved")
          .length,
        pending: all.filter((e) => e.status === "submitted").length,
        rejected: all.filter((e) => e.status === "rejected").length,
        finance_rejected: all.filter((e) => e.status === "finance_rejected")
          .length,
      });

      setLoading(false);
    }
    fetchData();
  }, [orgId, userRole, user?.id]);

  const getCurrent = () => {
    if (activeTab === "my") return expensesData;
    if (activeTab === "pending") return pendingApprovals;
    return allExpenses;
  };

  const toNumber = (val: string) => {
    const n = parseFloat(val);
    return isNaN(n) ? undefined : n;
  };

  const filteredCurrent = () => {
    const data = getCurrent();
    if (!data || data.length === 0) return [] as any[];

    const minAmt = toNumber(filters.amountMin);
    const maxAmt = toNumber(filters.amountMax);
    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (filters.dateMode === "CUSTOM") {
      fromDate = filters.dateFrom ? new Date(filters.dateFrom) : undefined;
      toDate = filters.dateTo ? new Date(filters.dateTo) : undefined;
    } else if (filters.dateMode === "SINGLE") {
      if (filters.dateFrom) {
        const day = new Date(filters.dateFrom);
        fromDate = new Date(day);
        toDate = new Date(day);
      }
    }

    const ciIncludes = (a?: string, b?: string) =>
      (a || "")
        .toString()
        .toLowerCase()
        .includes((b || "").toString().toLowerCase());

    return data.filter((e: any) => {
      const expenseType =
        e.expense_type || e.category || e.custom_fields?.category;
      if (filters.expenseType && expenseType !== filters.expenseType)
        return false;

      if (filters.eventName && e.event_title !== filters.eventName)
        return false;

      if (minAmt !== undefined && Number(e.amount) < minAmt) return false;
      if (maxAmt !== undefined && Number(e.amount) > maxAmt) return false;

      if (fromDate || toDate) {
        const d = e.date ? new Date(e.date) : undefined;
        if (!d) return false;
        if (fromDate && d < fromDate) return false;
        if (toDate) {
          const end = new Date(toDate);
          end.setHours(23, 59, 59, 999);
          if (d > end) return false;
        }
      }

      const creatorName = e.creator?.full_name || e.creator_name;
      if (filters.createdBy && creatorName !== filters.createdBy) return false;

      const approverName = e.approver?.full_name;
      if (filters.approver && approverName !== filters.approver) return false;

      if (filters.status && e.status !== filters.status) return false;

      // Filter by Unique ID (exact match via dropdown)
      if (filters.uniqueId && String(e.unique_id) !== filters.uniqueId)
        return false;

      return true;
    });
  };

  const filteredData = useMemo(
    () => filteredCurrent(),
    [filters, expensesData, pendingApprovals, allExpenses, activeTab]
  );

  // Use pagination hook
  const pagination = usePagination(filteredData);

  // Reset to page 1 when filters or tab changes
  useEffect(() => {
    pagination.resetPage();
  }, [filters, activeTab]);

  const handleNew = () => {
    router.push(`/org/${slug}/expenses/new`);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmation.expenseId) return;

    try {
      const { error } = await expenses.delete(deleteConfirmation.expenseId);
      if (error) throw error;
      toast.success("Expense deleted successfully");
      // Update the local state to reflect the deletion
      if (activeTab === "my") {
        setExpensesData((prev) =>
          prev.filter((expense) => expense.id !== deleteConfirmation.expenseId)
        );
      } else if (activeTab === "pending") {
        setPendingApprovals((prev) =>
          prev.filter((expense) => expense.id !== deleteConfirmation.expenseId)
        );
      } else {
        setAllExpenses((prev) =>
          prev.filter((expense) => expense.id !== deleteConfirmation.expenseId)
        );
      }
      setDeleteConfirmation({ isOpen: false, expenseId: null });
    } catch (error: any) {
      toast.error("Failed to delete expense", {
        description: error.message,
      });
      setDeleteConfirmation({ isOpen: false, expenseId: null });
    }
  };

  const handleDelete = (id: string) => {
    setDeleteConfirmation({ isOpen: true, expenseId: id });
  };

  // Helper function to get value from custom_fields or directly from expense
  // Define interfaces for expense data
  interface ExpenseField {
    key: string;
    label: string;
    visible: boolean;
  }

  interface Expense {
    id: string;
    date: string;
    category?: string;
    amount: number;
    description?: string;
    receipt?: {
      path: string;
    };
    approver?: {
      full_name?: string;
    };
    status: string;
    custom_fields?: Record<string, any>;
    hasVoucher?: boolean;
    voucherId?: string;
    [key: string]: any; // Allow for dynamic property access
  }

  // Helper function to get value from custom_fields or directly from expense
  const getExpenseValue = (expense: Expense, key: string): string => {
    // First check if the value exists directly on the expense object
    if (expense[key] !== undefined && expense[key] !== null) {
      return expense[key];
    }

    // Then check in custom_fields if it exists
    if (expense.custom_fields && expense.custom_fields[key] !== undefined) {
      return expense.custom_fields[key];
    }

    // Return a default value if nothing is found
    return "—";
  };

  return (
    <div className="space-y-6 pt-0">
      <h1 className="page-title">Expenses</h1>
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="w-full overflow-x-auto md:overflow-visible md:w-fit">
          <TabsList className="cursor-pointer">
            {tabs.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="cursor-pointer"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {/* stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold">
                    Total Expense{" "}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="stat-value">{stats.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold">
                    Manager Approved
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="stat-value">{stats.approved}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold">
                    Finance Approved
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="stat-value">{stats.finance_approved}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold">
                    Expense Pending
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="stat-value">{stats.pending}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold">
                    Manager Rejected
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="stat-value">{stats.rejected}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-semibold">
                    Finance Rejected
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="stat-value">{stats.finance_rejected}</div>
                </CardContent>
              </Card>
            </div>
            {/* toolbar */}
            <div className="flex items-center justify-between mb-4">
              <Button onClick={handleNew}>
                <PlusCircle className="mr-2 h-4 w-4" />
                New Expense
              </Button>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setShowFilters((s) => !s)}
                >
                  <Filter className="mr-2 h-4 w-4" />
                  Filters
                </Button>
                {/* <Button variant="outline" className="cursor-pointer">
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button> */}
              </div>
            </div>

            {showFilters && (
              <Card className="mb-4">
                <CardContent className="pt-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className={`space-y-1`}>
                      <Label>Expense Type</Label>
                      <Select
                        value={filters.expenseType || OPTION_ALL}
                        onValueChange={(v) =>
                          setFilters({
                            ...filters,
                            expenseType: v === OPTION_ALL ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Expense Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={OPTION_ALL}>
                            All Expense Types
                          </SelectItem>
                          {expenseTypeOptions.map((opt: string) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Event</Label>
                      <Select
                        value={filters.eventName || OPTION_ALL}
                        onValueChange={(v) =>
                          setFilters({
                            ...filters,
                            eventName: v === OPTION_ALL ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Event Name" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={OPTION_ALL}>
                            All Event Names
                          </SelectItem>
                          {eventNameOptions.map((opt: string) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Status</Label>
                      <Select
                        value={filters.status || OPTION_ALL}
                        onValueChange={(v) =>
                          setFilters({
                            ...filters,
                            status: v === OPTION_ALL ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={OPTION_ALL}>
                            All Statuses
                          </SelectItem>
                          {statusOptions.map((opt: string) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-sm">Amount Min</Label>
                          <Input
                            type="number"
                            placeholder="Min Amount"
                            value={amountMinInput}
                            onChange={(e) => {
                              const v = e.target.value;
                              setAmountMinInput(v);
                              setFilters({ ...filters, amountMin: v });
                            }}
                            onBlur={() => {
                              if (!amountMinInput || amountMinInput.trim() === "") {
                                setAmountMinInput(String(amountBounds.min));
                                setFilters({ ...filters, amountMin: "" });
                              }
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Amount Max</Label>
                          <Input
                            type="number"
                            placeholder="Max Amount"
                            value={amountMaxInput}
                            onChange={(e) => {
                              const v = e.target.value;
                              setAmountMaxInput(v);
                              setFilters({ ...filters, amountMax: v });
                            }}
                            onBlur={() => {
                              if (!amountMaxInput || amountMaxInput.trim() === "") {
                                setAmountMaxInput(String(amountBounds.max));
                                setFilters({ ...filters, amountMax: "" });
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <Label>Date</Label>
                      <Select
                        value={filters.dateMode || OPTION_ALL}
                        onValueChange={(v) =>
                          setFilters({
                            ...filters,
                            dateMode: v,
                            ...(v === OPTION_ALL
                              ? { dateFrom: "", dateTo: "" }
                              : v === "SINGLE"
                              ? { dateTo: "" }
                              : {}),
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Date Range" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={OPTION_ALL}>All Dates</SelectItem>
                          <SelectItem value="SINGLE">Single Date</SelectItem>
                          <SelectItem value="CUSTOM">Custom Date</SelectItem>
                        </SelectContent>
                      </Select>
                      {filters.dateMode !== OPTION_ALL && (
                        <>
                          <Label>
                            {filters.dateMode === "SINGLE"
                              ? "On Date"
                              : "From Date"}
                          </Label>
                          <Input
                            type="date"
                            placeholder={
                              filters.dateMode === "SINGLE" ? "Date" : "From"
                            }
                            value={filters.dateFrom}
                            onChange={(e) =>
                              setFilters({
                                ...filters,
                                dateFrom: e.target.value,
                              })
                            }
                          />
                          {filters.dateMode === "CUSTOM" && (
                            <>
                              <Label>To Date</Label>
                              <Input
                                type="date"
                                placeholder="To"
                                value={filters.dateTo}
                                onChange={(e) =>
                                  setFilters({
                                    ...filters,
                                    dateTo: e.target.value,
                                  })
                                }
                              />
                            </>
                          )}
                        </>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label>Created By</Label>
                      <Select
                        value={filters.createdBy || OPTION_ALL}
                        onValueChange={(v) =>
                          setFilters({
                            ...filters,
                            createdBy: v === OPTION_ALL ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Created By" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={OPTION_ALL}>
                            All Created By
                          </SelectItem>
                          {creatorOptions.map((opt: string) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Unique ID</Label>
                      <Select
                        value={filters.uniqueId || OPTION_ALL}
                        onValueChange={(v) =>
                          setFilters({
                            ...filters,
                            uniqueId: v === OPTION_ALL ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Unique ID" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={OPTION_ALL}>All Unique IDs</SelectItem>
                          {uniqueIdOptions.map((opt: string) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Approver</Label>
                      <Select
                        value={filters.approver || OPTION_ALL}
                        onValueChange={(v) =>
                          setFilters({
                            ...filters,
                            approver: v === OPTION_ALL ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Approver" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={OPTION_ALL}>
                            All Approvers
                          </SelectItem>
                          {approverOptions.map((opt: string) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setFilters({
                          expenseType: "",
                          eventName: "",
                          amountMin: "",
                          amountMax: "",
                          dateFrom: "",
                          dateTo: "",
                          dateMode: OPTION_ALL,
                          createdBy: "",
                          approver: "",
                          status: "",
                          uniqueId: "",
                        })
                      }
                    >
                      Clear
                    </Button>
                    <Button onClick={() => setShowFilters(false)}>Apply</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* table */}
            <Card className="pt-0">
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-gray-300">
                    <TableRow>
                      <TableHead>S.No.</TableHead>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Unique ID</TableHead>
                      {columns
                        .filter((c) => c.visible)
                        .map((c) => (
                          <TableHead key={c.key}>{c.label}</TableHead>
                        ))}
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableSkeleton
                        colSpan={columns.filter((c) => c.visible).length + 5}
                        rows={5}
                      />
                    ) : getCurrent().length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={columns.filter((c) => c.visible).length + 5}
                          className="text-center py-4 text-muted-foreground"
                        >
                          No expenses.
                        </TableCell>
                      </TableRow>
                    ) : filteredData.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={columns.filter((c) => c.visible).length + 5}
                          className="text-center py-4 text-muted-foreground"
                        >
                          {filters.amountMin || filters.amountMax
                            ? "No expenses found in the selected amount range."
                            : "No expenses match the selected filters."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      pagination.paginatedData.map((exp, index) => (
                        <TableRow key={exp.id}>
                          <TableCell className="w-12 text-center">
                            {pagination.getItemNumber(index)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatDateTime(exp.created_at)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              <span className="font-mono">
                                {exp.unique_id || "N/A"}
                              </span>
                            </div>
                          </TableCell>
                          {columns
                            .filter((c) => c.visible)
                            .map((c) => (
                              <TableCell key={c.key}>
                                {c.key === "amount" ? (
                                  formatCurrency(exp[c.key])
                                ) : c.key === "date" ? (
                                  formatDate(exp[c.key])
                                ) : c.key === "creator_name" ? (
                                  exp.creator?.full_name || "—"
                                ) : c.key === "receipt" ? (
                                  exp.receipt ? (
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="p-0 h-auto font-normal"
                                      onClick={() => {
                                        if (exp.receipt?.path) {
                                          expenses
                                            .getReceiptUrl(exp.receipt.path)
                                            .then(({ url, error }) => {
                                              if (error) {
                                                console.error(
                                                  "Error getting receipt URL:",
                                                  error
                                                );
                                                toast.error(
                                                  "Failed to load receipt"
                                                );
                                              } else if (url) {
                                                window.open(url, "_blank");
                                              }
                                            });
                                        }
                                      }}
                                    >
                                      View Receipt
                                    </Button>
                                  ) : exp.hasVoucher ? (
                                    <Button
                                      variant="link"
                                      size="sm"
                                      className="p-0 h-auto font-normal text-blue-600"
                                      onClick={() =>
                                        router.push(
                                          `/org/${slug}/expenses/${exp.id}/voucher`
                                        )
                                      }
                                    >
                                      View Voucher
                                    </Button>
                                  ) : (
                                    "No receipt or voucher"
                                  )
                                ) : c.key === "approver" ? (
                                  exp.approver?.full_name || "—"
                                ) : c.key === "category" ? (
                                  getExpenseValue(exp, "category")
                                ) : c.key === "event_title" ? (
                                  exp.event_title || "N/A"
                                ) : typeof exp[c.key] === "object" &&
                                  exp[c.key] !== null ? (
                                  JSON.stringify(exp[c.key])
                                ) : (
                                  exp[c.key] || "—"
                                )}
                              </TableCell>
                            ))}
                          <TableCell>
                            <ExpenseStatusBadge status={exp.status} />
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-3 gap-3">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Eye
                                      className="w-4 h-4 text-gray-600 cursor-pointer hover:text-gray-700"
                                      onClick={() => {
                                        // For pending tab, add nextId to enable sequential approval flow
                                        const baseUrl = `/org/${slug}/expenses/${exp.id}?fromTab=${activeTab}`;
                                        const globalIndex = pagination.getItemNumber(index) - 1;
                                        if (
                                          activeTab === "pending" &&
                                          filteredData[globalIndex + 1]
                                        ) {
                                          const nextId =
                                            filteredData[globalIndex + 1].id;
                                          router.push(
                                            `${baseUrl}&nextId=${nextId}`
                                          );
                                        } else {
                                          router.push(baseUrl);
                                        }
                                      }}
                                    />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>View Expense</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              {exp.status === "submitted" &&
                                exp.approver?.user_id !== user?.id && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Pencil
                                          className="w-4 h-4 text-gray-600 cursor-pointer hover:text-gray-700"
                                          onClick={() =>
                                            router.push(
                                              `/org/${slug}/expenses/${exp.id}/edit`
                                            )
                                          }
                                        />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Edit Expense</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              {(userRole === "admin" ||
                                userRole === "owner") && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Trash2
                                        className="w-4 h-4 text-red-600 cursor-pointer hover:text-red-800"
                                        onClick={() => handleDelete(exp.id)}
                                      />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Delete Expense</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
                {filteredData.length > 0 && (
                  <div className="px-6">
                    <Pagination
                      currentPage={pagination.currentPage}
                      totalPages={pagination.totalPages}
                      totalItems={pagination.totalItems}
                      onPageChange={pagination.setCurrentPage}
                      isLoading={loading}
                      itemLabel="Expenses"
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <Dialog
        open={deleteConfirmation.isOpen}
        onOpenChange={(open) =>
          setDeleteConfirmation((prev) => ({ ...prev, isOpen: open }))
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Expense</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this expense? This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() =>
                setDeleteConfirmation({ isOpen: false, expenseId: null })
              }
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              className="cursor-pointer"
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
