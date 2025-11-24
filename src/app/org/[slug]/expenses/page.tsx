"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { orgSettings, expenses } from "@/lib/db";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Edit,
  Trash2,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate, formatDateTime } from "@/lib/utils";
import supabase from "@/lib/supabase";

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
  });

  const OPTION_ALL = "ALL";

  const allDataCombined = useMemo(() => {
    return [...expensesData, ...pendingApprovals, ...allExpenses];
  }, [expensesData, pendingApprovals, allExpenses]);

  const unique = (values: any[]) =>
    Array.from(new Set(values.filter((v) => v !== undefined && v !== null && String(v).trim() !== "")));

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
    () => unique(allDataCombined.map((e: any) => e.creator?.full_name || e.creator_name)),
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

  // Determine tabs based on role
  const tabs =
    userRole === "member"
      ? [{ value: "my", label: "My Expenses" }]
      : userRole === "admin"
        ? [
          { value: "my", label: "My Expenses" },
          { value: "pending", label: "Pending Approval" },
        ]
        : [
          { value: "my", label: "My Expenses" },
          { value: "pending", label: "Pending Approval" },
          { value: "all", label: "All Expenses" },
        ];

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
          const categoryIdx = expenseColumns.findIndex((c) => c.key === "category");
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
                const approverName = expense.approver.full_name || "—"
                  // approverNamesMap[expense.id] || "Unknown Approver";

                // Set approver info on the expense
                expense.approver = {
                  full_name: approverName,
                  user_id: expense.approver_id || voucher?.approver_id,
                };

                // Set event title if available
                if (expense.event_id) {
                  expense.event_title = eventTitleMap[expense.event_id] || "N/A";
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
        finance_approved: all.filter((e) => e.status === "finance_approved").length,
        pending: all.filter((e) => e.status === "submitted").length,
        rejected: all.filter((e) => e.status === "rejected").length,
        finance_rejected: all.filter((e) => e.status === "finance_rejected").length,
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
      (a || "").toString().toLowerCase().includes((b || "").toString().toLowerCase());

    return data.filter((e: any) => {
      const expenseType = e.expense_type || e.category || e.custom_fields?.category;
      if (filters.expenseType && expenseType !== filters.expenseType) return false;

      if (filters.eventName && e.event_title !== filters.eventName) return false;

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

      return true;
    });
  };
  
  const filteredData = useMemo(() => filteredCurrent(), [filters, expensesData, pendingApprovals, allExpenses, activeTab]);

  const handleNew = () => {
    router.push(`/org/${slug}/expenses/new`);
  };


  const handleDelete = async (id: string) => {
    try {
      const { error } = await expenses.delete(id);
      if (error) throw error;
      toast.success("Expense deleted successfully");
      // Refresh the expenses list
      // Update the local state to reflect the deletion
      if (activeTab === "my") {
        setExpensesData((prev) => prev.filter((expense) => expense.id !== id));
      } else if (activeTab === "pending") {
        setPendingApprovals((prev) => prev.filter((expense) => expense.id !== id));
      } else {
        setAllExpenses((prev) => prev.filter((expense) => expense.id !== id));
      }
    } catch (error: any) {
      toast.error("Failed to delete expense", {
        description: error.message,
      });
    }
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
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <div className="w-full overflow-x-auto md:overflow-visible md:w-fit">
          <TabsList>
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
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
                  <CardTitle className="text-sm font-medium">Total Expense </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl">{stats.total}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Manager Approved</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl text-green-600">{stats.approved}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Finance Approved</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl text-green-600">{stats.finance_approved}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Expense Pending</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl  text-amber-600">{stats.pending}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Manager Rejected</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl text-red-600">{stats.rejected}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Finance Rejected</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl text-red-600">{stats.finance_rejected}</div>
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
                <Button variant="outline" onClick={() => setShowFilters((s) => !s)} className="cursor-pointer">
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
                          setFilters({ ...filters, expenseType: v === OPTION_ALL ? "" : v })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Expense Type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={OPTION_ALL}>All Expense Types</SelectItem>
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
                          setFilters({ ...filters, eventName: v === OPTION_ALL ? "" : v })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Event Name" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={OPTION_ALL}>All Event Names</SelectItem>
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
                          setFilters({ ...filters, status: v === OPTION_ALL ? "" : v })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={OPTION_ALL}>All Statuses</SelectItem>
                          {statusOptions.map((opt: string) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Amount Range</Label>
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                        <span className="font-bold text-gray-700">Min: ₹{currentMinAmount.toLocaleString("en-IN")}</span>
                        <span className="font-bold text-gray-700">Max: ₹{currentMaxAmount.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="relative h-4">
                        <div className="absolute top-1/2 left-0 right-0 h-1 bg-gray-200 rounded-full -translate-y-1/2"></div>
                        <div
                          className="absolute top-1/2 h-1 bg-black rounded-full -translate-y-1/2"
                          style={{
                            left: `${((currentMinAmount - amountBounds.min) / (amountBounds.max - amountBounds.min)) * 100}%`,
                            right: `${100 - ((currentMaxAmount - amountBounds.min) / (amountBounds.max - amountBounds.min)) * 100}%`,
                          }}
                        />

                        {/* Min Slider */}
                        <input
                          type="range"
                          min={amountBounds.min}
                          max={amountBounds.max}
                          step={amountStep}
                          value={currentMinAmount}
                          onChange={(e) => {
                            let val = Number(e.target.value);
                            if (val >= currentMaxAmount) {
                              val = currentMaxAmount - amountStep; // prevent overlap
                            }
                            setFilters((prev) => ({ ...prev, amountMin: String(val) }));
                          }}
                          className="absolute left-0 w-full appearance-none bg-transparent cursor-pointer"
                        />

                        {/* Max Slider */}
                        <input
                          type="range"
                          min={amountBounds.min}
                          max={amountBounds.max}
                          step={amountStep}
                          value={currentMaxAmount}
                          onChange={(e) => {
                            let val = Number(e.target.value);
                            if (val <= currentMinAmount) {
                              val = currentMinAmount + amountStep; // prevent overlap
                            }
                            setFilters((prev) => ({ ...prev, amountMax: String(val) }));
                          }}
                          className="absolute left-0 w-full appearance-none bg-transparent cursor-pointer"
                        />
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
                            {filters.dateMode === "SINGLE" ? "On Date" : "From Date"}
                          </Label>
                          <Input
                            type="date"
                            placeholder={filters.dateMode === "SINGLE" ? "Date" : "From"}
                            value={filters.dateFrom}
                            onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                          />
                          {filters.dateMode === "CUSTOM" && (
                            <>
                              <Label>To Date</Label>
                              <Input
                                type="date"
                                placeholder="To"
                                value={filters.dateTo}
                                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
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
                          setFilters({ ...filters, createdBy: v === OPTION_ALL ? "" : v })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Created By" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={OPTION_ALL}>All Created By</SelectItem>
                          {creatorOptions.map((opt: string) => (
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
                          setFilters({ ...filters, approver: v === OPTION_ALL ? "" : v })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Approver" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={OPTION_ALL}>All Approvers</SelectItem>
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
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>S.No.</TableHead>
                      <TableHead>Timestamp</TableHead>
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
                      <TableRow>
                        <TableCell
                          colSpan={columns.filter((c) => c.visible).length + 3}
                          className="text-center py-4"
                        >
                          Loading…
                        </TableCell>
                      </TableRow>
                    ) : getCurrent().length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={columns.filter((c) => c.visible).length + 3}
                          className="text-center py-4 text-muted-foreground"
                        >
                          No expenses.
                        </TableCell>
                      </TableRow>
                    ) : filteredData.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={columns.filter((c) => c.visible).length + 3}
                          className="text-center py-4 text-muted-foreground"
                        >
                          {filters.amountMin || filters.amountMax
                            ? "No expenses found in the selected amount range."
                            : "No expenses match the selected filters."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredData.map((exp, index) => (
                        <TableRow key={exp.id}>
                          <TableCell className="w-12 text-center">{index + 1}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatDateTime(exp.created_at)}
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
                                ) : typeof exp[c.key] === "object" && exp[c.key] !== null ? (
                                  JSON.stringify(exp[c.key])
                                ) : (
                                  exp[c.key] || "—"
                                )}

                              </TableCell>
                            ))}
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded-full text-xs ${exp.status === "approved"
                                ? "bg-green-100 text-green-800"
                                : exp.status === "finance_approved"
                                  ? "bg-green-100 text-green-800"
                                  : exp.status === "finance_rejected" || exp.status === "rejected"
                                    ? "bg-red-100 text-red-800"
                                    : exp.status === "submitted"
                                      ? "bg-yellow-100 text-yellow-800"
                                      : "bg-gray-100 text-gray-800"
                                }`}
                            >
                                {exp.status === "approved"
                                  ? "Manager_Approved"
                                  : (exp.status === "rejected" || exp.status === "manager_rejected")
                                    ? "Manager_Reject"
                                    : exp.status.charAt(0).toUpperCase() +
                                      exp.status.slice(1)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-3 gap-3">
                              {/* 👁️ View Icon */}
                              <Eye
                                className="w-4 h-4 text-gray-600 cursor-pointer hover:text-gray-700"
                                onClick={() =>
                                  router.push(`/org/${slug}/expenses/${exp.id}`)
                                }
                              />
                              {/* ✏️ Edit Icon — status "submitted" ke liye */}
                              {/* {exp.status === "submitted" && ( */}
                              {/* ✏️ Edit Icon — sabko dikhega except expense approver ke liye aur status "submitted" ke liye */}
                              {exp.status === "submitted" && exp.approver?.user_id !== user?.id && (
                                <Edit
                                  className="w-4 h-4 text-gray-600 cursor-pointer hover:text-gray-700"
                                  onClick={() =>
                                    router.push(`/org/${slug}/expenses/${exp.id}/edit`)
                                  }
                                />
                              )}
                              {/* 🗑️ Delete Icon — Admin or Owner ke liye */}
                              {(userRole === "admin" || userRole === "owner") && (
                                <Trash2
                                  className="w-4 h-4 text-red-500 cursor-pointer hover:text-red-700"
                                  onClick={() => handleDelete(exp.id)}
                                />
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
