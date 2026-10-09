"use client";

import { useState, useEffect, useRef } from "react";
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
  Search,
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
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { isExportEnabled } from "@/lib/features";
import { Pagination, PER_PAGE } from "@/components/pagination";
import {
  fetchExpensePage,
  fetchExpenseStatusCounts,
  fetchExpenseFilterOptions,
  fetchAllExpensesForExport,
  type ExpenseFilterOptions,
  type ExpenseListScope,
} from "@/lib/expense-list";
import * as XLSX from "xlsx-js-style";

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
  const userId = user?.id;

  const [columns, setColumns] = useState<any[]>([]);
  // Only the rows on the current page are held in memory; the database does
  // the filtering, counting and paging (see src/lib/expense-list.ts).
  const [rows, setRows] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    approved: 0,
    finance_approved: 0,
    pending: 0,
    rejected: 0,
    finance_rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState<"my" | "pending" | "all">("my");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFiltersState] = useState({
    expenseType: "",
    eventName: "",
    projectOfExpense: "",
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
  const [searchQuery, setSearchQuery] = useState({
    expenseType: "",
    projectOfExpense: "",
    status: "",
    dateFrom: "",
    createdBy: "",
    uniqueId: "",
    approver: "",
  });
  const [filterOptions, setFilterOptions] = useState<ExpenseFilterOptions>({
    expenseTypes: [],
    locations: [],
    statuses: [],
    creators: [],
    approvers: [],
  });
  const filterOptionsCache = useRef<Record<string, ExpenseFilterOptions>>({});
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    expenseId: string | null;
  }>({
    isOpen: false,
    expenseId: null,
  });
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [hasAppliedHighlight, setHasAppliedHighlight] = useState(false);
  const highlightedRowRef = useRef<HTMLTableRowElement | null>(null);

  // Current page lives in the URL (?page=), so "back" from an expense returns
  // to the same page.
  const pageQuery = searchParams.get("page");
  const currentPage = Math.max(1, parseInt(pageQuery || "1", 10) || 1);
  const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));

  const goToFirstPage = () => {
    if (!searchParams.get("page")) return;
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("page");
    nextParams.delete("expID");
    router.replace(`/org/${slug}/expenses?${nextParams.toString()}`);
  };

  // Every filter change made through the UI goes back to page 1.
  const setFilters: typeof setFiltersState = (value) => {
    setFiltersState(value);
    goToFirstPage();
  };

  // so they are not lost when navigating back from an expense view
  const isMounted = useRef(false);
  // v2: "Created By" / "Approver" are stored as user ids now (they were names).
  const FILTERS_STORAGE_KEY = "expenses-filters-v2";

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem(FILTERS_STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed.filters) setFiltersState(parsed.filters);
          if (parsed.searchQuery) setSearchQuery(parsed.searchQuery);
          if (parsed.showFilters !== undefined) setShowFilters(parsed.showFilters);
        }
      } catch (e) {
        console.error("Failed to parse saved filters", e);
      }
    }
    setTimeout(() => {
      isMounted.current = true;
    }, 0);
  }, []);

  // so they are not lost when navigating back from an expense view
  useEffect(() => {
    if (isMounted.current && typeof window !== "undefined") {
      try {
        sessionStorage.setItem(
          FILTERS_STORAGE_KEY,
          JSON.stringify({ filters, searchQuery, showFilters })
        );
      } catch {
        // storage unavailable (private mode etc.) — filters just won't persist
      }
    }
  }, [filters, searchQuery, showFilters]);

  // Typing in Amount / Unique ID shouldn't fire a request per keystroke.
  const [debouncedFilters, setDebouncedFilters] = useState(filters);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedFilters(filters), 350);
    return () => window.clearTimeout(timer);
  }, [filters]);

  const OPTION_ALL = "ALL";

  const expenseTypeOptions = filterOptions.expenseTypes;
  const locationOptions = filterOptions.locations;
  const statusOptions = filterOptions.statuses;
  const creatorOptions = filterOptions.creators;
  const approverOptions = filterOptions.approvers;

  // Which expenses each tab shows. Same rules as before, per role:
  //   member  -> only their own
  //   manager -> "All" = expenses where they are the approver
  //   admin/owner -> "All" = the whole org
  const scopeForTab = (tab: "my" | "pending" | "all"): ExpenseListScope => {
    if (tab === "my") return "my";
    if (tab === "pending") return "pending";
    if (userRole === "member") return "my";
    if (userRole === "manager") return "approver";
    return "org";
  };
  const statsScope: ExpenseListScope =
    userRole === "member" ? "my" : userRole === "manager" ? "approver" : "org";
  const currentScope = scopeForTab(activeTab);

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

  const handleTabChange = (tabValue: "my" | "pending" | "all") => {
    setActiveTab(tabValue);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("tab", tabValue);
    nextParams.delete("expID");
    nextParams.delete("page");

    router.replace(`/org/${slug}/expenses?${nextParams.toString()}`);
  };

  // 1) Column settings — once per org.
  useEffect(() => {
    async function loadColumns() {
      if (!orgId) return;

      const { data: s, error: se } = await orgSettings.getByOrgId(orgId);
      if (se) {
        toast.error("Failed to load settings", { description: se.message });
        setColumns(defaultExpenseColumns);
      } else {
        // Safely handle the case where settings or expense_columns might be undefined
        let expenseColumns = s?.expense_columns ?? defaultExpenseColumns;

        // ✅ Remove any existing 'description' columns
        expenseColumns = expenseColumns.filter((c) => c.key !== "description");

        // Move or ensure 'Project of Expense' column exists after 'category'
        const projectColIdx = expenseColumns.findIndex(
          (c) =>
            c.key === "location" ||
            c.label === "Project of Expense" ||
            c.key === "Project of Expense"
        );

        let projectCol: any = {
          key: "location",
          label: "Project of Expense",
          visible: true,
          type: "text",
        };

        if (projectColIdx >= 0) {
          projectCol = expenseColumns[projectColIdx];
          expenseColumns.splice(projectColIdx, 1);
        }

        const catIdx = expenseColumns.findIndex((c) => c.key === "category" || c.key === "expense_type" || c.label === "Expense Type");
        const insertPos = catIdx >= 0 ? catIdx + 1 : 2;
        expenseColumns.splice(insertPos, 0, projectCol);

        // Remove any existing 'Expense Credit Person' columns (by key or label)
        expenseColumns = expenseColumns.filter(
          (c) =>
            c.key !== "expense_credit_person" &&
            c.label !== "Expense Credit Person"
        );

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
        // if (!expenseColumns.some((c) => c.key === "event_title")) {
        //   // Place Event after Project of Expense if present, else after Category
        //   const projIdx = expenseColumns.findIndex((c) => c.key === "location" || c.label === "Project of Expense" || c.key === "Project of Expense");
        //   const categoryIdx = expenseColumns.findIndex((c) => c.key === "category" || c.key === "expense_type" || c.label === "Expense Type");
        //   let insertIdx = 1;
        //   if (projIdx >= 0) insertIdx = projIdx + 1;
        //   else if (categoryIdx >= 0) insertIdx = categoryIdx + 1;

        //   expenseColumns.splice(insertIdx, 0, {
        //     key: "event_title",
        //     label: "Event Name",
        //     visible: true,
        //     type: "text",
        //   });
        // }

        setColumns(expenseColumns);
      }
    }
    loadColumns();
  }, [orgId]);

  // 2) The current page of rows + total count. Re-runs on tab, page or
  //    filter change. Stale responses are ignored.
  const requestSeq = useRef(0);
  useEffect(() => {
    if (!orgId || !userId || !userRole) return;
    const seq = ++requestSeq.current;
    setLoading(true);

    fetchExpensePage({
      orgId,
      userId,
      scope: currentScope,
      filters: debouncedFilters,
      page: currentPage,
      pageSize: PER_PAGE,
    }).then(({ data, count, error }) => {
      if (seq !== requestSeq.current) return;
      if (error) {
        toast.error("Failed to load expenses", { description: error.message });
        setRows([]);
        setTotalCount(0);
      } else {
        setRows(data);
        setTotalCount(count);
      }
      setLoading(false);
    });
  }, [orgId, userId, userRole, currentScope, debouncedFilters, currentPage, reloadKey]);

  // 3) Stat cards — counted by the database, independent of tab and filters
  //    (same as before: they always describe the role's "All" view).
  useEffect(() => {
    if (!orgId || !userId || !userRole) return;
    let cancelled = false;
    fetchExpenseStatusCounts(orgId, userId, statsScope).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error("Failed to load expense counts:", error);
        return;
      }
      if (data) setStats(data);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, userId, userRole, statsScope, reloadKey]);

  // 4) Dropdown values — only fetched once the Filters panel is open, cached
  //    per tab scope.
  useEffect(() => {
    if (!showFilters || !orgId || !userId || !userRole) return;
    const cached = filterOptionsCache.current[currentScope];
    if (cached) {
      setFilterOptions(cached);
      return;
    }
    let cancelled = false;
    fetchExpenseFilterOptions(orgId, userId, currentScope)
      .then((options) => {
        filterOptionsCache.current[currentScope] = options;
        if (!cancelled) setFilterOptions(options);
      })
      .catch((e) => console.error("Failed to load filter options:", e));
    return () => {
      cancelled = true;
    };
  }, [showFilters, orgId, userId, userRole, currentScope]);

  const hasActiveFilters = Boolean(
    filters.expenseType ||
    filters.projectOfExpense ||
    filters.status ||
    filters.amountMin ||
    filters.amountMax ||
    filters.createdBy ||
    filters.approver ||
    filters.uniqueId ||
    (filters.dateMode !== OPTION_ALL && (filters.dateFrom || filters.dateTo))
  );

  const getItemNumber = (index: number) => (currentPage - 1) * PER_PAGE + index + 1;

  const highlightQuery = searchParams.get("expID");

  useEffect(() => {
    setHighlightId(highlightQuery);
    setHasAppliedHighlight(false);
  }, [highlightQuery]);

  useEffect(() => {
    if (!highlightId) return;
    const timer = window.setTimeout(() => setHighlightId(null), 10000);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  // If the URL points past the last page (e.g. rows were deleted), clamp it.
  useEffect(() => {
    if (loading || totalCount === 0) return;
    if (currentPage > totalPages) handlePageChange(totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, totalCount, totalPages, currentPage]);

  const handlePageChange = (nextPage: number) => {
    if (nextPage === currentPage) return;

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("tab", activeTab);
    nextParams.set("page", String(nextPage));
    nextParams.delete("expID");

    router.replace(`/org/${slug}/expenses?${nextParams.toString()}`);
  };

  useEffect(() => {
    if (!highlightId || hasAppliedHighlight) return;

    const isVisible = rows.some((item) => item.id === highlightId);
    if (!isVisible) return;

    const timer = window.setTimeout(() => {
      highlightedRowRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      setHasAppliedHighlight(true);
    }, 200);

    return () => window.clearTimeout(timer);
  }, [highlightId, hasAppliedHighlight, rows]);

  const handleNew = () => {
    router.push(`/org/${slug}/expenses/new`);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmation.expenseId) return;

    try {
      const { error } = await expenses.delete(deleteConfirmation.expenseId);
      if (error) throw error;
      toast.success("Expense deleted successfully");
      // Re-fetch the current page and the counts.
      setReloadKey((k) => k + 1);
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

  // Export fetches everything matching the current tab + filters on demand,
  // so the full dataset is only downloaded when someone actually exports.
  const handleExport = async (format: "csv" | "excel") => {
    if (!orgId || !userId || exporting) return;
    setExporting(true);
    const toastId = toast.loading("Preparing export…");
    let allRows: any[] = [];
    try {
      const { data, error } = await fetchAllExpensesForExport({
        orgId,
        userId,
        scope: currentScope,
        filters,
      });
      if (error) throw error;
      allRows = data ?? [];
    } catch (error: any) {
      toast.error("Failed to export expenses", {
        id: toastId,
        description: error?.message,
      });
      setExporting(false);
      return;
    }
    toast.dismiss(toastId);
    setExporting(false);

    const exportData = allRows.map((exp, index) => {
      const getVal = (key: string) => {
        if (exp[key] !== undefined && exp[key] !== null) return exp[key];
        if (exp.custom_fields && exp.custom_fields[key] !== undefined) return exp.custom_fields[key];
        return "";
      };

      const row: Record<string, any> = {
        "S.No.": index + 1,
        Timestamp: formatDateTime(exp.created_at),
        "Unique ID": exp.unique_id || "N/A",
      };

      columns.filter((c) => c.visible).forEach((c) => {
        if (c.key === "amount") {
          row[c.label] = exp[c.key];
        } else if (c.key === "date") {
          row[c.label] = formatDate(exp[c.key]);
        } else if (c.key === "creator_name") {
          row[c.label] = exp.creator?.full_name || "—";
        } else if (c.key === "approver") {
          row[c.label] = exp.approver?.full_name || "—";
        } else if (c.key === "receipt") {
          row[c.label] = exp.receipt?.path ? "Yes" : "No";
        } else if (c.key === "finance_comment") {
          row[c.label] = exp.finance_comment || "—";
        } else {
          row[c.label] = getVal(c.key);
        }
      });

      row["Status"] = exp.status;

      return row;
    });

    if (exportData.length === 0) {
      toast.error("No data to export");
      return;
    }

    const timestamp = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }).replace(/\//g, "-").replace(/, /g, "_").replace(/:/g, "꞉").toLowerCase();

    const fileName = `Expenses_Export_${timestamp}`;

    if (format === "csv") {
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `${fileName}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      const worksheet = XLSX.utils.json_to_sheet(exportData);

      // Auto-fit columns and style header
      const colWidths = Object.keys(exportData[0] || {}).map((key, index) => {
        let maxLen = key.toString().length;
        exportData.forEach((row) => {
          const val = row[key] ? row[key].toString() : "";
          if (val.length > maxLen) {
            maxLen = val.length;
          }
        });

        // Style header cell
        const colAddress = XLSX.utils.encode_col(index);
        const cellAddress = colAddress + "1";
        if (worksheet[cellAddress]) {
          worksheet[cellAddress].s = {
            font: { bold: true },
            fill: { fgColor: { rgb: "D3D3D3" } },
          };
        }

        return { wch: Math.min(Math.max(maxLen, 10), 50) + 2 };
      });
      worksheet["!cols"] = colWidths;

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Expenses");
      XLSX.writeFile(workbook, `${fileName}.xlsx`);
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
    <div className="space-y-6 pt-0">
      <h1 className="page-title">Expenses</h1>
      <Tabs
        value={activeTab}
        onValueChange={(v) => handleTabChange(v as "my" | "pending" | "all")}
      >
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
                {isExportEnabled && (
                  <Button
                    variant="outline"
                    className="cursor-pointer"
                    disabled={exporting}
                    onClick={() => setExportModalOpen(true)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {exporting ? "Exporting…" : "Export"}
                  </Button>
                )}
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
                        <SelectContent
                          searchPlaceholder="Search expense type..."
                          searchValue={searchQuery.expenseType}
                          onSearchChange={(v) => setSearchQuery({ ...searchQuery, expenseType: v })}
                        >
                          <SelectItem value={OPTION_ALL}>
                            All Expense Types
                          </SelectItem>
                          {expenseTypeOptions
                            .filter((opt: string) => opt.toLowerCase().includes(searchQuery.expenseType.toLowerCase()))
                            .map((opt: string) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Project of Expense</Label>
                      <Select
                        value={filters.projectOfExpense || OPTION_ALL}
                        onValueChange={(v) =>
                          setFilters({
                            ...filters,
                            projectOfExpense: v === OPTION_ALL ? "" : v,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Project of Expense" />
                        </SelectTrigger>
                        <SelectContent
                          searchPlaceholder="Search projects..."
                          searchValue={searchQuery.projectOfExpense}
                          onSearchChange={(v) => setSearchQuery({ ...searchQuery, projectOfExpense: v })}
                        >
                          <SelectItem value={OPTION_ALL}>
                            All Projects
                          </SelectItem>
                          {locationOptions
                            .filter((opt: string) => opt.toLowerCase().includes(searchQuery.projectOfExpense.toLowerCase()))
                            .map((opt: string) => (
                              <SelectItem key={opt} value={opt}>
                                {opt}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {/* <div className="space-y-1">
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
                    </div> */}
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
                        <SelectContent
                          searchPlaceholder="Search status..."
                          searchValue={searchQuery.status}
                          onSearchChange={(v) => setSearchQuery({ ...searchQuery, status: v })}
                        >
                          <SelectItem value={OPTION_ALL}>
                            All Statuses
                          </SelectItem>
                          {statusOptions
                            .filter((opt: string) => opt.toLowerCase().includes(searchQuery.status.toLowerCase()))
                            .map((opt: string) => (
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
                            placeholder="Min"
                            value={filters.amountMin}
                            onChange={(e) => {
                              setFilters((prev) => ({ ...prev, amountMin: e.target.value }));
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-sm">Amount Max</Label>
                          <Input
                            type="number"
                            placeholder="Max"
                            value={filters.amountMax}
                            onChange={(e) => {
                              setFilters((prev) => ({ ...prev, amountMax: e.target.value }));
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
                          {filters.dateMode === "SINGLE" ? (
                            <Input
                              type="date"
                              value={filters.dateFrom}
                              onChange={(e) =>
                                setFilters((prev) => ({
                                  ...prev,
                                  dateFrom: e.target.value,
                                }))
                              }
                            />
                          ) : (
                            <Input
                              type="date"
                              placeholder="From"
                              value={filters.dateFrom}
                              onChange={(e) =>
                                setFilters((prev) => ({
                                  ...prev,
                                  dateFrom: e.target.value,
                                }))
                              }
                            />
                          )}
                          {filters.dateMode === "CUSTOM" && (
                            <>
                              <Label>To Date</Label>
                              <Input
                                type="date"
                                placeholder="To"
                                value={filters.dateTo}
                                onChange={(e) =>
                                  setFilters((prev) => ({
                                    ...prev,
                                    dateTo: e.target.value,
                                  }))
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
                        <SelectContent
                          searchPlaceholder="Search creator..."
                          searchValue={searchQuery.createdBy}
                          onSearchChange={(v) => setSearchQuery({ ...searchQuery, createdBy: v })}
                        >
                          <SelectItem value={OPTION_ALL}>
                            All Created By
                          </SelectItem>
                          {creatorOptions
                            .filter((opt) => opt.name.toLowerCase().includes(searchQuery.createdBy.toLowerCase()))
                            .map((opt) => (
                              <SelectItem key={opt.id} value={opt.id}>
                                {opt.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Unique ID</Label>
                      <Input
                        placeholder="Search unique ID..."
                        value={filters.uniqueId}
                        onChange={(e) =>
                          setFilters((prev) => ({
                            ...prev,
                            uniqueId: e.target.value,
                          }))
                        }
                      />
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
                        <SelectContent
                          searchPlaceholder="Search approver..."
                          searchValue={searchQuery.approver}
                          onSearchChange={(v) => setSearchQuery({ ...searchQuery, approver: v })}
                        >
                          <SelectItem value={OPTION_ALL}>
                            All Approvers
                          </SelectItem>
                          {approverOptions
                            .filter((opt) => opt.name.toLowerCase().includes(searchQuery.approver.toLowerCase()))
                            .map((opt) => (
                              <SelectItem key={opt.id} value={opt.id}>
                                {opt.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setFilters({
                          expenseType: "",
                          eventName: "",
                          projectOfExpense: "",
                          amountMin: "",
                          amountMax: "",
                          dateFrom: "",
                          dateTo: "",
                          dateMode: OPTION_ALL,
                          createdBy: "",
                          approver: "",
                          status: "",
                          uniqueId: "",
                        });
                        setSearchQuery({
                          expenseType: "",
                          projectOfExpense: "",
                          status: "",
                          dateFrom: "",
                          createdBy: "",
                          uniqueId: "",
                          approver: "",
                        });
                      }}
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
              <CardContent className="p-0 max-h-[75vh] overflow-auto [&>div]:overflow-visible">
                <Table>
                  <TableHeader className="bg-gray-300 sticky top-0 z-10">
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
                    ) : totalCount === 0 && !hasActiveFilters ? (
                      <TableRow>
                        <TableCell
                          colSpan={columns.filter((c) => c.visible).length + 5}
                          className="text-center py-4 text-muted-foreground"
                        >
                          No expenses.
                        </TableCell>
                      </TableRow>
                    ) : totalCount === 0 ? (
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
                      rows.map((exp, index) => {
                        const isHighlighted = highlightId === exp.id;
                        return (
                          <TableRow
                            key={exp.id}
                            ref={isHighlighted ? highlightedRowRef : null}
                            data-expense-row={exp.id}
                            className={isHighlighted ? "border-2 border-yellow-400 bg-yellow-50" : ""}
                          >
                            <TableCell className="w-12 text-center">
                              {getItemNumber(index)}
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
                              <div className="flex space-x-1 gap-0">
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <div
                                        className="p-1.5 rounded-md border border-transparent hover:border-gray-300 hover:bg-white transition-all cursor-pointer flex items-center justify-center"
                                        onClick={() => {
                                          // For pending tab, add nextId to enable sequential approval flow
                                          // The detail page works out the next pending
                                          // expense itself, so no nextId is needed.
                                          router.push(
                                            `/org/${slug}/expenses/${exp.id}?fromTab=${activeTab}&page=${currentPage}`
                                          );
                                        }}
                                      >
                                        <Eye className="w-4 h-4 text-gray-600 hover:text-black" />
                                      </div>
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
                                          <div
                                            className="p-1.5 rounded-md border border-transparent hover:border-gray-300 hover:bg-white transition-all cursor-pointer flex items-center justify-center"
                                            onClick={() =>
                                              router.push(
                                                `/org/${slug}/expenses/${exp.id}/edit`
                                              )
                                            }
                                          >
                                            <Pencil className="w-4 h-4 text-gray-600 hover:text-black" />
                                          </div>
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
                                          <div
                                            className="p-1.5 rounded-md border border-transparent hover:border-red-300 hover:bg-red-50 transition-all cursor-pointer flex items-center justify-center"
                                            onClick={() => handleDelete(exp.id)}
                                          >
                                            <Trash2 className="w-4 h-4 text-red-600 hover:text-red-700" />
                                          </div>
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
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            {totalCount > 0 && (
              <div className="px-2">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalCount}
                  onPageChange={handlePageChange}
                  isLoading={loading}
                  itemLabel="Expenses"
                />
              </div>
            )}
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

      <Dialog
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Expenses</DialogTitle>
            <DialogDescription>
              Choose the format in which you want to export your expenses.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-row justify-center gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                handleExport("excel");
                setExportModalOpen(false);
              }}
              className="cursor-pointer flex-1"
            >
              Microsoft Excel (.xlsx)
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                handleExport("csv");
                setExportModalOpen(false);
              }}
              className="cursor-pointer flex-1"
            >
              CSV (.csv)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
