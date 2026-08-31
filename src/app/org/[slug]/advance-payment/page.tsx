"use client";

import React from "react";
import { useEffect, useState, useRef, useMemo } from "react";
import supabase from "@/lib/supabase";
import { expenses, organizations } from "@/lib/db";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";
import {
  IndianRupee,
  Pencil,
  Save,
  Trash2,
  Funnel,
  Undo2,
  Filter,
  Eye,
  Download,
  Tag,
  CheckCircle,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/utils";
import { isExportEnabled } from "@/lib/features";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { toast } from "sonner";
import { ExpenseStatusBadge } from "@/components/ExpenseStatusBadge";
import { Button } from "@/components/ui/button";
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
import { Pagination, usePagination } from "@/components/pagination";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "N/A";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);
};

const calculateTdsAmount = (
  baseAmount: number | null | undefined,
  percentage: number | null | undefined
) => {
  if (!percentage || baseAmount === null || baseAmount === undefined) return null;
  const amount = (Number(baseAmount) * percentage) / 100;
  return Number(amount.toFixed(2));
};

const calculateActualAmount = (
  baseAmount: number | null | undefined,
  tdsAmount: number | null | undefined,
  securityDepositAmount: number | null | undefined
) => {
  if (baseAmount === null || baseAmount === undefined) return null;
  const amount = Number(baseAmount) - (tdsAmount ?? 0) - (securityDepositAmount ?? 0);
  return Number(amount.toFixed(2));
};

const toDateOnly = (value?: string | Date | null) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateForInput = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateForFileName = (date: Date | string | null | undefined) => {
  if (!date) return "";

  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";

  const day = `${value.getDate()}`.padStart(2, "0");
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const year = value.getFullYear();
  return `${day}-${month}-${year}`;
};

export default function AdvancePaymentRecords() {
  const [records, setRecords] = useState<any[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const { slug } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isInitialized, setIsInitialized] = useState(false);
  const [highlightedExpenseId, setHighlightedExpenseId] = useState<string | null>(null);
  const [hasAppliedHighlight, setHasAppliedHighlight] = useState(false);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState({
    expenseType: "",
    eventName: "",
    createdBy: "",
    email: "",
    uniqueId: "",
    location: "",
    bills: "",
    utr: "",
    startDate: "",
    paidStartDate: "",
    tdsDeduction: "",
    securityDeposit: "",
    paidByBank: "",
  });
  const [filters, setFilters] = useState({
    expenseType: "All Expense Type",
    eventName: "All Events",
    createdBy: "All Creators",
    email: "All Emails",
    uniqueId: "All Unique IDs",
    location: "All Locations",
    bills: "All Receipt/Voucher",
    utr: "All UTRs",
    paidByBank: "All Banks",
    startDate: "",
    endDate: "",
    dateMode: "All Dates",
    paidStartDate: "",
    paidEndDate: "",
    paidDateMode: "All Dates",
    minAmount: "",
    maxAmount: "",
    actualMinAmount: "",
    actualMaxAmount: "",
    tdsDeduction: "All TDS Deductions",
    securityDeposit: "All Security Deposits",
  });

  const [amountBounds, setAmountBounds] = useState({ min: 0, max: 0 });
  const [actualAmountBounds, setActualAmountBounds] = useState({ min: 0, max: 0 });
  const [filterOpen, setFilterOpen] = useState(false);
  const [eventTitleLookup, setEventTitleLookup] = useState<
    Record<string, string>
  >({});
  const [eventOptions, setEventOptions] = useState<
    { id: string; title: string }[]
  >([]);

  // State for UTR editing functionality
  const [editingFields, setEditingFields] = useState<
    Record<string, { utr?: boolean }>
  >({});
  const [isPasswordVerified, setIsPasswordVerified] = useState(false);
  const [passwordModal, setPasswordModal] = useState({
    open: false,
    expenseId: null as null | string,
  });
  const [enteredPassword, setEnteredPassword] = useState("");

  // Use pagination hook
  const pagination = usePagination(filteredRecords, 100);

  // Initialize activeTab from URL and listen for URL changes
  useEffect(() => {
    const tabParam = searchParams.get("tab") || "all";
    setActiveTab(tabParam);
    setIsInitialized(true);
  }, []);

  // Update URL when activeTab changes
  useEffect(() => {
    if (isInitialized) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", activeTab);
      router.push(`?${params.toString()}`);
    }
  }, [activeTab, isInitialized]);

  // Handle tab change - remove expID parameter
  const handleTabChange = (value: string) => {
    setActiveTab(value);
    
    // Remove expID from URL params if it exists
    const params = new URLSearchParams(searchParams.toString());
    if (params.has("expID")) {
      params.delete("expID");
      params.set("tab", value);
      router.push(`?${params.toString()}`);
    }
  };

  // Reset page when filters change
  useEffect(() => {
    pagination.resetPage();
  }, [filters]);

  // Handle expID from URL parameter
  useEffect(() => {
    const expID = searchParams.get("expID");
    setHighlightedExpenseId(expID);
    setHasAppliedHighlight(false);
  }, [searchParams.get("expID")]);

  // Auto-clear highlight after 10 seconds and remove expID from URL
  useEffect(() => {
    if (!highlightedExpenseId) return;
    const timer = window.setTimeout(() => {
      setHighlightedExpenseId(null);
      
      // Remove expID from URL params
      const params = new URLSearchParams(searchParams.toString());
      if (params.has("expID")) {
        params.delete("expID");
        router.push(`?${params.toString()}`);
      }
    }, 10000);
    return () => window.clearTimeout(timer);
  }, [highlightedExpenseId, searchParams, router]);

  // Navigate to page containing highlighted expense
  useEffect(() => {
    if (!filteredRecords.length) return;
    const recordIndex = filteredRecords.findIndex(r => r.id === highlightedExpenseId);
    if (recordIndex !== -1) {
      const itemsPerPage = 100;
      const pageNumber = Math.floor(recordIndex / itemsPerPage) + 1;
      if (pageNumber !== pagination.currentPage) {
        pagination.setCurrentPage(pageNumber);
      }
    }
  }, [
    highlightedExpenseId,
    filteredRecords,
    pagination.currentPage,
    pagination.setCurrentPage,
  ]);

  // Scroll to highlighted row when visible on current page
  useEffect(() => {
    if (!highlightedExpenseId || hasAppliedHighlight) return;

    const isVisible = pagination.paginatedData.some(
      (item) => item.id === highlightedExpenseId
    );
    if (!isVisible) return;

    const timer = window.setTimeout(() => {
      highlightedRowRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      setHasAppliedHighlight(true);
    }, 200);

    return () => window.clearTimeout(timer);
  }, [highlightedExpenseId, hasAppliedHighlight, pagination.paginatedData]);
  const [deleteModal, setDeleteModal] = useState<{
    open: boolean;
    id: string | null;
  }>({
    open: false,
    id: null,
  });
  const [sendBackModal, setSendBackModal] = useState<{
    open: boolean;
    id: string | null;
  }>({ open: false, id: null });
  const [sendBackLoading, setSendBackLoading] = useState(false);
  const [editModal, setEditModal] = useState<{
    open: boolean;
    record: any | null;
  }>({ open: false, record: null });
  const [editForm, setEditForm] = useState({
    expense_type: "",
    event_id: "",
    location: "",
    approved_amount: "",
    utr: "",
    unique_id: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Export state
  const [showExportModal, setShowExportModal] = useState(false);
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [showExportBankModal, setShowExportBankModal] = useState(false);
  const [showExportDateModal, setShowExportDateModal] = useState(false);
  const [showQuickExportModal, setShowQuickExportModal] = useState(false);
  const [quickExportMode, setQuickExportMode] = useState<"weekly" | "monthly">("weekly");
  const [quickExportDate, setQuickExportDate] = useState("");
  const [exportLocationFilter, setExportLocationFilter] = useState("All Locations");
  const [quickExportLocation, setQuickExportLocation] = useState("All Locations");
  const [exportRangeLabel, setExportRangeLabel] = useState<"" | "Weekly" | "Monthly">("");
  const [exportDateRangeLabel, setExportDateRangeLabel] = useState("");
  const [exportDateFilters, setExportDateFilters] = useState({
    expenseDateMode: "All Dates",
    expenseStartDate: "",
    expenseEndDate: "",
    paidDateMode: "All Dates",
    paidStartDate: "",
    paidEndDate: "",
  });
  const [exportBankType, setExportBankType] = useState<"ALL_RECORDS" | "NGIDFC Current" | "FCIDFC Current" | "KOTAK" | "NO_BANK" | "">("");

  const allColumns = [
    "Timestamp",
    "Email",
    "Unique ID",
    "Expense Type",
    "Event Name",
    "Location",
    "Amount",
    "TDS Deduction",
    "Security Deposit",
    "Actual Amount",
    "Date of Expense",
    "Status",
    "UTR",
    "Paid Date",
    "Payment Status",
    "Paid by bank",
  ];
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    ...allColumns,
  ]);

  const ADMIN_PASSWORD = "admin"; // your password

  const getBaseAmount = (record: any) =>
    Number(record.approved_amount ?? record.amount ?? 0);

  const getTdsAmount = (record: any) => {
    const storedAmount = record.tds_deduction_amount;
    if (storedAmount !== null && storedAmount !== undefined && storedAmount !== "") {
      return Number(storedAmount);
    }

    const percentage = Number(record.tds_deduction_percentage ?? 0);
    if (!percentage) return null;

    return calculateTdsAmount(getBaseAmount(record), percentage);
  };

  const getSecurityDepositAmount = (record: any) => {
    const amount = record.security_deposit_amount;
    if (amount === null || amount === undefined || amount === "") {
      return null;
    }

    return Number(amount);
  };

  const hasTdsDeduction = (record: any) => {
    const storedAmount = record.tds_deduction_amount;
    if (storedAmount !== null && storedAmount !== undefined && storedAmount !== "") {
      return true;
    }
    return Number(record.tds_deduction_percentage ?? 0) > 0;
  };

  const getTdsDeductionOptionValue = (record: any) => {
    if (!hasTdsDeduction(record)) return "N/A";
    const percentage = Number(record.tds_deduction_percentage ?? 0);
    const amount = getTdsAmount(record) ?? 0;
    return `${percentage}|${Number(amount).toFixed(2)}`;
  };

  const formatTdsDeductionOptionLabel = (optionValue: string) => {
    if (optionValue === "N/A") return "N/A";
    const [percentageText, amountText] = optionValue.split("|");
    const percentage = Number(percentageText);
    const amount = Number(amountText);
    const percentageLabel = Number.isFinite(percentage) && percentage > 0 ? `${percentage}%` : "—";
    return `${percentageLabel} (${formatCurrency(amount)})`;
  };

  const hasSecurityDeposit = (record: any) => {
    const amount = record.security_deposit_amount;
    return !(amount === null || amount === undefined || amount === "");
  };

  const activeTabRecords = React.useMemo(() => {
    if (activeTab === "ngidfc") return records.filter(r => (r.paid_by_bank || "").includes("NGIDFC"));
    if (activeTab === "fcidfc") return records.filter(r => (r.paid_by_bank || "").includes("FCIDFC"));
    if (activeTab === "kotak") return records.filter(r => (r.paid_by_bank || "").includes("KOTAK"));
    return records;
  }, [records, activeTab]);

  const tdsDeductionOptions = React.useMemo(() =>
    Array.from(new Set(activeTabRecords.map((r: any) => getTdsDeductionOptionValue(r)))).sort((a, b) => {
      if (a === "N/A") return 1;
      if (b === "N/A") return -1;
      const [aP, aA] = a.split("|");
      const [bP, bA] = b.split("|");
      const pDiff = Number(aP) - Number(bP);
      if (pDiff !== 0) return pDiff;
      return Number(aA) - Number(bA);
    }), [activeTabRecords]);

  const securityDepositOptions = React.useMemo(() =>
    Array.from(new Set(activeTabRecords.map((r: any) => (hasSecurityDeposit(r) ? String(getSecurityDepositAmount(r)) : "N/A")))).sort((a, b) => {
      if (a === "N/A") return 1;
      if (b === "N/A") return -1;
      return Number(a) - Number(b);
    }), [activeTabRecords]);

  const quickExportLocationOptions = useMemo(() => {
    const locations = new Set<string>();

    filteredRecords.forEach((record) => {
      const location = (record.location || "").trim();
      if (location) locations.add(location);
    });

    return Array.from(locations).sort((a, b) => a.localeCompare(b));
  }, [filteredRecords]);

  const quickExpenseDateOptions = useMemo(() => {
    const uniqueDates = new Set<string>();

    filteredRecords.forEach((record) => {
      if (
        quickExportLocation !== "All Locations" &&
        (record.location || "") !== quickExportLocation
      ) {
        return;
      }

      const dateOnly = toDateOnly(record.date);
      if (dateOnly) uniqueDates.add(dateOnly);
    });

    return Array.from(uniqueDates).sort((a, b) => a.localeCompare(b));
  }, [filteredRecords, quickExportLocation]);

  const weeklyExpenseOptions = useMemo(() => {
    const weeks = new Map<
      string,
      {
        start: Date;
        end: Date;
      }
    >();

    quickExpenseDateOptions.forEach((dateStr) => {
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return;

      const day = d.getDay(); // 0 (Sun) - 6 (Sat)
      const diffToMonday = (day + 6) % 7;

      const start = new Date(d);
      start.setDate(d.getDate() - diffToMonday);

      const end = new Date(start);
      end.setDate(start.getDate() + 6);

      const key = `${start.toISOString().slice(0, 10)}|${end.toISOString().slice(0, 10)}`;
      if (!weeks.has(key)) {
        weeks.set(key, { start, end });
      }
    });

    const formatter = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    return Array.from(weeks.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, { start, end }]) => ({
        value,
        label: `${formatter.format(start)} - ${formatter.format(end)}`,
      }));
  }, [quickExpenseDateOptions]);

  const monthlyExpenseOptions = useMemo(() => {
    const months = new Set<string>();

    quickExpenseDateOptions.forEach((dateStr) => {
      if (!dateStr) return;
      const [year, month] = dateStr.split("-");
      if (!year || !month) return;
      months.add(`${year}-${month}`);
    });

    const formatter = new Intl.DateTimeFormat("en-GB", {
      month: "long",
      year: "numeric",
    });

    return Array.from(months)
      .sort((a, b) => a.localeCompare(b))
      .map((value) => {
        const [yearStr, monthStr] = value.split("-");
        const year = Number(yearStr);
        const monthIndex = Number(monthStr) - 1;
        const date = new Date(year, monthIndex, 1);
        return {
          value,
          label: formatter.format(date),
        };
      });
  }, [quickExpenseDateOptions]);

  useEffect(() => {
    setQuickExportDate("");
  }, [quickExportMode, quickExportLocation]);

  const getActualAmount = (record: any) => {
    const stored = record.actual_amount;
    if (stored !== null && stored !== undefined && stored !== "") {
      return Number(stored);
    }

    return calculateActualAmount(
      getBaseAmount(record),
      getTdsAmount(record),
      getSecurityDepositAmount(record)
    );
  };

  useEffect(() => {
    const fetchRecords = async () => {
      try {
        setLoading(true);

        // Get organization ID from slug
        const { data: orgData, error: orgError } = await organizations.getBySlug(
          slug as string
        );

        if (orgError || !orgData) {
          throw new Error("Organization not found");
        }

        const orgId = orgData.id;

        // Fetch all paid expenses
        const { data, error } = await supabase
          .from("expense_new")
          .select("*")
          .eq("payment_status", "paid")
          .eq("org_id", orgId)
          .order("paid_approval_time", { ascending: true, nullsFirst: true });

        if (error) throw error;

        const rows = data || [];

        // Filter for advance payments only
        // Check if expense was marked as advance from Records tab using the flag
        const advanceRows = rows.filter((r: any) => {
          const customFields = r.custom_fields || {};
          return customFields.marked_as_advance === true;
        });

        // Fetch vouchers for these records (if any)
        try {
          const expenseIds = advanceRows.map((r: any) => r.id).filter(Boolean);
          if (expenseIds.length > 0) {
            const { data: allVouchers, error: voucherError } = await supabase
              .from("vouchers")
              .select("*")
              .in("expense_id", expenseIds);

            const voucherMap: Record<string, any> = {};
            if (!voucherError && allVouchers) {
              allVouchers.forEach((v: any) => {
                voucherMap[v.expense_id] = v;
              });
            }

            // attach voucher info to rows
            advanceRows.forEach((r: any) => {
              const voucher = voucherMap[r.id];
              if (voucher) {
                r.hasVoucher = true;
                r.voucherId = voucher.id;
              }
            });
          }
        } catch (vErr) {
          // non-critical: continue without voucher data
          console.error("Error fetching vouchers for records:", vErr);
        }

        // Bulk fetch event titles
        const eventIds = [
          ...new Set(
            advanceRows
              .map((r: any) => r.event_id)
              .filter((id: any) => typeof id === "string" && id.length > 0)
          ),
        ];

        let eventTitleMap: Record<string, string> = {};
        let eventsDataList: { id: string; title: string }[] = [];
        if (eventIds.length > 0) {
          const { data: eventsData, error: evErr } = await supabase
            .from("expense_events")
            .select("id,title")
            .in("id", eventIds);
          if (!evErr && eventsData) {
            eventsDataList = eventsData;
            eventsData.forEach((ev: { id: string; title: string }) => {
              eventTitleMap[ev.id] = ev.title;
            });
          }
        }

        const sortByMarkedAsAdvanceTime = (list: any[]) =>
          [...list].sort((a, b) => {
            const aTime = a.custom_fields?.marked_as_advance_at
              ? new Date(a.custom_fields.marked_as_advance_at).getTime()
              : null;
            const bTime = b.custom_fields?.marked_as_advance_at
              ? new Date(b.custom_fields.marked_as_advance_at).getTime()
              : null;

            if (aTime === null && bTime === null) return 0;
            if (aTime === null) return 1; // nulls last
            if (bTime === null) return -1;
            return aTime - bTime; // ascending for non-nulls (oldest first)
          });

        const withTitles = advanceRows.map((r: any) => ({
          ...r,
          event_title: r.event_id ? eventTitleMap[r.event_id] || "N/A" : "N/A",
        }));

        // Fetch bank details to enrich records with user's unique_id (if available)
        try {
          const { data: bankData, error: bankError } = await supabase
            .from("bank_details")
            .select("*");
          if (bankError) throw bankError;

          const enriched = withTitles.map((r: any) => {
            const matched = bankData?.find(
              (b: any) => b.email === r.creator_email
            );
            return {
              ...r,
              unique_id: r.unique_id || matched?.unique_id || "N/A",
            };
          });

          const sorted = sortByMarkedAsAdvanceTime(enriched);
          const sortedWithSerial = sorted.map((r: any, index: number) => {
            // Use the original serial number from records tab if available, otherwise use index-based
            const originalSerialNumber = r.custom_fields?.original_serial_number;
            return {
              ...r,
              serialNumber: originalSerialNumber !== null && originalSerialNumber !== undefined 
                ? originalSerialNumber 
                : index + 1,
            };
          });

          // compute amount bounds
          const amounts = enriched.map((r: any) => getBaseAmount(r));
          const actualAmounts = enriched
            .map((r: any) => getActualAmount(r))
            .filter((amount: number | null): amount is number => amount !== null);
          const min = amounts.length ? Math.min(...amounts) : 0;
          const max = amounts.length ? Math.max(...amounts) : 0;
          const actualMin = actualAmounts.length ? Math.min(...actualAmounts) : 0;
          const actualMax = actualAmounts.length ? Math.max(...actualAmounts) : 0;

          setRecords(sortedWithSerial);
          setFilteredRecords(sortedWithSerial);
          setAmountBounds({ min, max });
          setActualAmountBounds({ min: actualMin, max: actualMax });
          setEventTitleLookup(eventTitleMap);
          setEventOptions(eventsDataList);
          setFilters((prev) => ({
            ...prev,
            minAmount: "",
            maxAmount: "",
            actualMinAmount: "",
            actualMaxAmount: "",
          }));
        } catch (bankErr) {
          // If bank details fetch fails, fall back to existing titles and default Unique ID
          const fallback = sortByMarkedAsAdvanceTime(
            withTitles.map((r: any) => ({
              ...r,
              unique_id: r.unique_id || "N/A",
            }))
          );
          const fallbackWithSerial = fallback.map((r: any, index: number) => {
            // Use the original serial number from records tab if available, otherwise use index-based
            const originalSerialNumber = r.custom_fields?.original_serial_number;
            return {
              ...r,
              serialNumber: originalSerialNumber !== null && originalSerialNumber !== undefined 
                ? originalSerialNumber 
                : index + 1,
            };
          });
          const amounts = fallback.map((r: any) => getBaseAmount(r));
          const actualAmounts = fallback
            .map((r: any) => getActualAmount(r))
            .filter((amount: number | null): amount is number => amount !== null);
          const min = amounts.length ? Math.min(...amounts) : 0;
          const max = amounts.length ? Math.max(...amounts) : 0;
          const actualMin = actualAmounts.length ? Math.min(...actualAmounts) : 0;
          const actualMax = actualAmounts.length ? Math.max(...actualAmounts) : 0;

          setRecords(fallbackWithSerial);
          setFilteredRecords(fallbackWithSerial);
          setAmountBounds({ min, max });
          setActualAmountBounds({ min: actualMin, max: actualMax });
          setEventTitleLookup(eventTitleMap);
          setEventOptions(eventsDataList);
          setFilters((prev) => ({
            ...prev,
            minAmount: "",
            maxAmount: "",
            actualMinAmount: "",
            actualMaxAmount: "",
          }));
        }
      } catch (err: any) {
        toast.error("Failed to load advance payment records", { description: err.message });
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, []);

  // Derive options from fetched records
  const expenseTypes = Array.from(
    new Set(records.map((r: any) => r.expense_type).filter(Boolean))
  );
  const eventNames = Array.from(
    new Set(records.map((r: any) => r.event_title).filter(Boolean))
  );
  const creators = Array.from(
    new Set(records.map((r: any) => r.creator_email).filter(Boolean))
  );
  const locations = Array.from(
    new Set(records.map((r: any) => r.location).filter(Boolean))
  );
  const uniqueIds = Array.from(
    new Set(records.map((r: any) => r.unique_id).filter(Boolean))
  );
  const bankOptions = Array.from(
    new Set(records.map((r: any) => r.paid_by_bank).filter(Boolean))
  );
  const paidDateFilterOptions = Array.from(
    new Set(
      activeTabRecords
        .map((r: any) => {
          if (!r.paid_approval_time) return null;
          const date = new Date(r.paid_approval_time);
          if (Number.isNaN(date.getTime())) return null;
          const year = date.getFullYear();
          const month = `${date.getMonth() + 1}`.padStart(2, "0");
          const day = `${date.getDate()}`.padStart(2, "0");
          return `${year}-${month}-${day}`;
        })
        .filter((x): x is string => Boolean(x))
    )
  ).sort((a, b) => b.localeCompare(a));
  const baseExportRecords = (() => {
    if (!exportBankType) return filteredRecords;
    if (exportBankType === "ALL_RECORDS") return filteredRecords;
    if (exportBankType === "NO_BANK") return filteredRecords.filter((r: any) => !(r.paid_by_bank || "").trim());
    return filteredRecords.filter((r: any) => (r.paid_by_bank || "") === exportBankType);
  })();

  const expenseDateOptions: string[] = Array.from(
    new Set(
      baseExportRecords
        .map((r: any) => (r.date ? new Date(r.date).toISOString().slice(0, 10) : null))
        .filter((x): x is string => Boolean(x))
    )
  ).sort();
  const paidDateOptions: string[] = Array.from(
    new Set(
      baseExportRecords
        .map((r: any) => (r.paid_approval_time ? new Date(r.paid_approval_time).toISOString().slice(0, 10) : null))
        .filter((x): x is string => Boolean(x))
    )
  ).sort();

  const formatDateForDisplay = (d: string) => {
    try {
      return new Date(d).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return d;
    }
  };

  const sanitize = (s: string) => String(s || "").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "");

  const buildExportFileName = (ext: string) => {
    // For quick export (weekly/monthly), use special format
    if (exportRangeLabel && exportDateRangeLabel) {
      const label = exportRangeLabel.toLowerCase();
      // Sanitize location name (replace spaces with underscores)
      const locationPart = exportLocationFilter !== "All Locations" 
        ? sanitize(exportLocationFilter).toLowerCase() 
        : "all_projects";
      return `${label}_advance_payment_record_${locationPart}_${exportDateRangeLabel}.${ext}`;
    }
    
    // For regular export
    const timestamp = formatDateForFileName(new Date());
    
    const bankPart = (() => {
      if (!exportBankType) return "";
      if (exportBankType === "ALL_RECORDS") return "All_Records";
      if (exportBankType === "NO_BANK") return "No_Bank";
      return sanitize(exportBankType);
    })();

    const expensePart = (() => {
      const m = exportDateFilters.expenseDateMode;
      if (m === "All Dates") return "";
      if (m === "Single Date") return `DateofExpense_${formatDateForFileName(exportDateFilters.expenseStartDate)}`;
      if (m === "Custom Date") return `DateofExpense_${formatDateForFileName(exportDateFilters.expenseStartDate)}_to_${formatDateForFileName(exportDateFilters.expenseEndDate)}`;
      return "";
    })();

    const paidPart = (() => {
      const m = exportDateFilters.paidDateMode;
      if (m === "All Dates") return "";
      if (m === "Single Date") return `PaidDate_${formatDateForFileName(exportDateFilters.paidStartDate)}`;
      if (m === "Custom Date") return `PaidDate_${formatDateForFileName(exportDateFilters.paidStartDate)}_to_${formatDateForFileName(exportDateFilters.paidEndDate)}`;
      return "";
    })();

    const dateParts = [expensePart, paidPart].filter(Boolean);
    const dateScopePart = dateParts.length ? dateParts.join("_") : "all_dates";

    const parts = [
      bankPart,
      "advance-payment",
      dateScopePart,
      timestamp,
    ].filter((p) => p !== "");
    
    return `${parts.join("_")}.${ext}`;
  };
  const utrValues = Array.from(
    new Set(
      (filters.uniqueId && filters.uniqueId !== "All Unique IDs"
        ? records.filter((r: any) => (r.unique_id || "") === filters.uniqueId)
        : records
      )
        .map((r: any) => (r.utr || "").toString().trim())
        .filter((v: string) => v !== "")
    )
  );

  const applyFilters = (sourceRecords: any[] = records) => {
    const fr = sourceRecords.filter((r: any) => {
      if (
        filters.expenseType !== "All Expense Type" &&
        r.expense_type !== filters.expenseType
      )
        return false;
      if (
        filters.eventName !== "All Events" &&
        (r.event_title || "N/A") !== filters.eventName
      )
        return false;
      if (
        filters.createdBy !== "All Creators" &&
        r.creator_email !== filters.createdBy
      )
        return false;
      if (filters.email !== "All Emails" && r.creator_email !== filters.email)
        return false;
      if (
        filters.uniqueId !== "All Unique IDs" &&
        (r.unique_id || "") !== filters.uniqueId
      )
        return false;
      if (
        filters.location !== "All Locations" &&
        (r.location || "") !== filters.location
      )
        return false;
      if (filters.bills !== "All Receipt/Voucher") {
        if (filters.bills === "Receipt" && !r.receipt) return false;
        if (filters.bills === "Voucher" && !r.hasVoucher) return false;
      }
      if (
        filters.paidByBank !== "All Banks" &&
        (r.paid_by_bank || "") !== filters.paidByBank
      )
        return false;
      if (filters.utr && filters.utr !== "All UTRs") {
        if (filters.utr === "Has" && !r.utr) return false;
        if (filters.utr === "None" && r.utr) return false;
        if (
          filters.utr !== "Has" &&
          filters.utr !== "None" &&
          (r.utr || "") !== filters.utr
        )
          return false;
      }
      if (filters.startDate) {
        const start = new Date(filters.startDate);
        const recDate = new Date(r.updated_at || r.created_at || r.date);
        if (recDate < start) return false;
      }
      if (filters.endDate) {
        const end = new Date(filters.endDate);
        const recDate = new Date(r.updated_at || r.created_at || r.date);
        end.setHours(23, 59, 59, 999);
        if (recDate > end) return false;
      }
      const paidApprovalDate = r.paid_approval_time
        ? new Date(r.paid_approval_time)
        : null;
      if (filters.paidDateMode === "Single Date" && filters.paidStartDate) {
        const start = new Date(filters.paidStartDate);
        const end = new Date(filters.paidStartDate);
        end.setHours(23, 59, 59, 999);
        if (!paidApprovalDate || Number.isNaN(paidApprovalDate.getTime()))
          return false;
        if (paidApprovalDate < start || paidApprovalDate > end) return false;
      }
      if (filters.paidDateMode === "Custom Date") {
        if (!paidApprovalDate || Number.isNaN(paidApprovalDate.getTime()))
          return false;
        if (filters.paidStartDate) {
          const start = new Date(filters.paidStartDate);
          if (paidApprovalDate < start) return false;
        }
        if (filters.paidEndDate) {
          const end = new Date(filters.paidEndDate);
          end.setHours(23, 59, 59, 999);
          if (paidApprovalDate > end) return false;
        }
      }
      const amt = getBaseAmount(r);
      if (filters.minAmount !== "" && amt < Number(filters.minAmount))
        return false;
      if (filters.maxAmount !== "" && amt > Number(filters.maxAmount))
        return false;

      const actualAmt = getActualAmount(r);
      if (
        filters.actualMinAmount !== "" &&
        actualAmt !== null &&
        actualAmt < Number(filters.actualMinAmount)
      )
        return false;
      if (
        filters.actualMaxAmount !== "" &&
        actualAmt !== null &&
        actualAmt > Number(filters.actualMaxAmount)
      )
        return false;

      // TDS Deduction filter: option values generated from records (e.g. "N/A" or "10|25.00")
      if (
        filters.tdsDeduction &&
        filters.tdsDeduction !== "All TDS Deductions"
      ) {
        if (filters.tdsDeduction === "N/A") {
          if (hasTdsDeduction(r)) return false;
        } else {
          if (getTdsDeductionOptionValue(r) !== filters.tdsDeduction) return false;
        }
      }

      // Security Deposit filter: string amounts or "N/A"
      if (
        filters.securityDeposit &&
        filters.securityDeposit !== "All Security Deposits"
      ) {
        if (filters.securityDeposit === "N/A") {
          if (hasSecurityDeposit(r)) return false;
        } else {
          const sec = getSecurityDepositAmount(r);
          if (String(sec) !== filters.securityDeposit) return false;
        }
      }

      return true;
    });

    setFilteredRecords(fr);
  };

  // Auto-apply filters when filter values change or when records update
  useEffect(() => {
    // only apply when records are loaded
    if (!loading) {
      let tabFiltered = records;
      if (activeTab === "ngidfc") {
        tabFiltered = records.filter(r => (r.paid_by_bank || "").includes("NGIDFC"));
      } else if (activeTab === "fcidfc") {
        tabFiltered = records.filter(r => (r.paid_by_bank || "").includes("FCIDFC"));
      } else if (activeTab === "kotak") {
        tabFiltered = records.filter(r => (r.paid_by_bank || "").includes("KOTAK"));
      }
      applyFilters(tabFiltered);
    }
  }, [filters, records, activeTab]);

  // Reset to page 1 when filters change
  useEffect(() => {
    pagination.resetPage();
  }, [filteredRecords]);

  const clearFilters = () => {
    setFilters((prev) => ({
      ...prev,
      expenseType: "All Expense Type",
      eventName: "All Events",
      createdBy: "All Creators",
      email: "All Emails",
      uniqueId: "All Unique IDs",
      location: "All Locations",
      bills: "All Receipt/Voucher",
      utr: "All UTRs",
      paidByBank: "All Banks",
      dateMode: "All Dates",
      startDate: "",
      endDate: "",
      paidDateMode: "All Dates",
      paidStartDate: "",
      paidEndDate: "",
      minAmount: "",
      maxAmount: "",
      actualMinAmount: "",
      actualMaxAmount: "",
      tdsDeduction: "All TDS Deductions",
      securityDeposit: "All Security Deposits",
    }));
    setSearchQuery({
      expenseType: "",
      eventName: "",
      createdBy: "",
      email: "",
      uniqueId: "",
      location: "",
      bills: "",
      utr: "",
      startDate: "",
      paidStartDate: "",
      tdsDeduction: "",
      securityDeposit: "",
      paidByBank: "",
    });

    let tabFiltered = records;
    if (activeTab === "ngidfc") {
      tabFiltered = records.filter((r) => (r.paid_by_bank || "").includes("NGIDFC"));
    } else if (activeTab === "fcidfc") {
      tabFiltered = records.filter((r) => (r.paid_by_bank || "").includes("FCIDFC"));
    } else if (activeTab === "kotak") {
      tabFiltered = records.filter((r) => (r.paid_by_bank || "").includes("KOTAK"));
    }
    setFilteredRecords(tabFiltered);
  };


  const openEditModal = (record: any) => {
    setEditForm({
      expense_type: record.expense_type || "",
      event_id: record.event_id || "",
      location: record.location || "",
      approved_amount:
        record.approved_amount !== undefined
          ? String(record.approved_amount)
          : record.amount !== undefined
            ? String(record.amount)
            : "",
      utr: record.utr || "",
      unique_id: record.unique_id || "",
    });
    setEditModal({ open: true, record });
  };

  const handleSaveEdit = async () => {
    if (!editModal.record) return;

    const parsedAmount = Number(editForm.approved_amount);
    if (
      editForm.approved_amount !== "" &&
      !Number.isFinite(parsedAmount)
    ) {
      toast.error("Please enter a valid amount");
      return;
    }

    const payload = {
      expense_type:
        editForm.expense_type || editModal.record.expense_type || null,
      event_id: editForm.event_id || editModal.record.event_id || null,
      location: editForm.location || editModal.record.location || null,
      approved_amount:
        editForm.approved_amount === ""
          ? editModal.record.approved_amount ?? null
          : parsedAmount,
      utr: editForm.utr.trim() || null,
      unique_id: editForm.unique_id.trim() || null,
    };

    const updatedEventTitle = payload.event_id
      ? eventTitleLookup[payload.event_id] || editModal.record.event_title || "N/A"
      : editModal.record.event_title || "N/A";

    try {
      setSavingEdit(true);

      const { error } = await supabase
        .from("expense_new")
        .update(payload)
        .eq("id", editModal.record.id);

      if (error) throw error;

      const updateList = (list: any[]) =>
        list.map((r: any) =>
          r.id === editModal.record.id
            ? { ...r, ...payload, event_title: updatedEventTitle }
            : r
        );

      setRecords((prev) => updateList(prev));
      setFilteredRecords((prev) => updateList(prev));

      toast.success("Record updated");
      setEditModal({ open: false, record: null });
    } catch (err: any) {
      toast.error("Failed to update record", { description: err.message });
    } finally {
      setSavingEdit(false);
    }
  };

  const exportToCSV = () => {
    const headers = selectedColumns;

    const baseRecords = exportBankType === ""
      ? filteredRecords
      : exportBankType === "ALL_RECORDS"
        ? filteredRecords
        : exportBankType === "NO_BANK"
          ? filteredRecords.filter((r) => !(r.paid_by_bank || "").trim())
          : filteredRecords.filter((r) => (r.paid_by_bank || "") === exportBankType);

    const applyDateFilters = (rec: any) => {
      // Apply location filter if specified
      if (exportLocationFilter !== "All Locations" && (rec.location || "") !== exportLocationFilter) {
        return false;
      }
      const toYMD = (dt: any) => {
        if (!dt) return null;
        try {
          return new Date(dt).toISOString().slice(0, 10);
        } catch {
          return null;
        }
      };

      const expenseYmd = toYMD(rec.date);
      const paidYmd = toYMD(rec.paid_approval_time);

      const edMode = exportDateFilters.expenseDateMode;
      if (edMode === "Single Date") {
        if (!exportDateFilters.expenseStartDate) return false;
        if (expenseYmd !== exportDateFilters.expenseStartDate) return false;
      } else if (edMode === "Custom Date") {
        if (!exportDateFilters.expenseStartDate || !exportDateFilters.expenseEndDate) return false;
        if (!expenseYmd) return false;
        if (expenseYmd < exportDateFilters.expenseStartDate || expenseYmd > exportDateFilters.expenseEndDate) return false;
      }

      const pdMode = exportDateFilters.paidDateMode;
      if (pdMode === "Single Date") {
        if (!exportDateFilters.paidStartDate) return false;
        if (paidYmd !== exportDateFilters.paidStartDate) return false;
      } else if (pdMode === "Custom Date") {
        if (!exportDateFilters.paidStartDate || !exportDateFilters.paidEndDate) return false;
        if (!paidYmd) return false;
        if (paidYmd < exportDateFilters.paidStartDate || paidYmd > exportDateFilters.paidEndDate) return false;
      }

      return true;
    };

    const filteredByDate = baseRecords.filter(applyDateFilters);

    const rows = filteredByDate.map((record) => {
      const row: any[] = [];

      for (const col of headers) {
        switch (col) {
          case "Timestamp":
            row.push(formatDateTime(record.updated_at || record.created_at) || "—");
            break;
          case "Email":
            row.push(record.creator_email || "—");
            break;
          case "Unique ID":
            row.push(record.unique_id || "N/A");
            break;
          case "Expense Type":
            row.push(record.expense_type || "—");
            break;
          case "Event Name":
            row.push(record.event_title || "N/A");
            break;
          case "Location":
            row.push(record.location || "—");
            break;
          case "Amount":
            row.push(record.approved_amount || record.amount || "—");
            break;
          case "TDS Deduction": {
            const tdsAmount = getTdsAmount(record);
            const percentage = Number(record.tds_deduction_percentage ?? 0);
            row.push(
              percentage && tdsAmount !== null
                ? `${percentage}% (${formatCurrency(tdsAmount)})`
                : tdsAmount !== null
                  ? formatCurrency(tdsAmount)
                  : "N/A"
            );
            break;
          }
          case "Security Deposit": {
            const securityDepositAmount = getSecurityDepositAmount(record);
            row.push(
              securityDepositAmount !== null
                ? formatCurrency(securityDepositAmount)
                : "N/A"
            );
            break;
          }
          case "Actual Amount": {
            const actualAmount = getActualAmount(record);
            row.push(actualAmount !== null ? formatCurrency(actualAmount) : "N/A");
            break;
          }
          case "Date of Expense":
            row.push(
              record.date ? new Date(record.date).toLocaleDateString("en-IN") : "—"
            );
            break;
          case "Status":
            row.push(record.status || "—");
            break;
          case "UTR":
            row.push(record.utr || "—");
            break;
          case "Paid Date":
            row.push(
              record.paid_approval_time
                ? new Date(record.paid_approval_time).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
                : "—"
            );
            break;
          case "Payment Status":
            row.push(record.payment_status || "—");
            break;
          case "Paid by bank":
            row.push(record.paid_by_bank || "—");
            break;
          default:
            row.push("—");
        }
      }

      return row;
    });

    const csvRows: string[] = [];
    csvRows.push(headers.map((h) => `"${h}"`).join(","));
    csvRows.push(
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      )
    );
    const csvContent = csvRows.join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", buildExportFileName("csv"));
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToXLSX = () => {
    const headers = selectedColumns;

    const baseRecords = exportBankType === ""
      ? filteredRecords
      : exportBankType === "ALL_RECORDS"
        ? filteredRecords
        : exportBankType === "NO_BANK"
          ? filteredRecords.filter((r) => !(r.paid_by_bank || "").trim())
          : filteredRecords.filter((r) => (r.paid_by_bank || "") === exportBankType);

    const toYMD = (dt: any) => {
      if (!dt) return null;
      try {
        return new Date(dt).toISOString().slice(0, 10);
      } catch {
        return null;
      }
    };

    const applyDateFilters = (rec: any) => {
      // Apply location filter if specified
      if (exportLocationFilter !== "All Locations" && (rec.location || "") !== exportLocationFilter) {
        return false;
      }
      const expenseYmd = toYMD(rec.date);
      const paidYmd = toYMD(rec.paid_approval_time);

      const edMode = exportDateFilters.expenseDateMode;
      if (edMode === "Single Date") {
        if (!exportDateFilters.expenseStartDate) return false;
        if (expenseYmd !== exportDateFilters.expenseStartDate) return false;
      } else if (edMode === "Custom Date") {
        if (!exportDateFilters.expenseStartDate || !exportDateFilters.expenseEndDate) return false;
        if (!expenseYmd) return false;
        if (expenseYmd < exportDateFilters.expenseStartDate || expenseYmd > exportDateFilters.expenseEndDate) return false;
      }

      const pdMode = exportDateFilters.paidDateMode;
      if (pdMode === "Single Date") {
        if (!exportDateFilters.paidStartDate) return false;
        if (paidYmd !== exportDateFilters.paidStartDate) return false;
      } else if (pdMode === "Custom Date") {
        if (!exportDateFilters.paidStartDate || !exportDateFilters.paidEndDate) return false;
        if (!paidYmd) return false;
        if (paidYmd < exportDateFilters.paidStartDate || paidYmd > exportDateFilters.paidEndDate) return false;
      }

      return true;
    };

    const filteredByDate = baseRecords.filter(applyDateFilters);

    const rows = filteredByDate.map((record) => {
      const row: any[] = [];

      for (const col of headers) {
        switch (col) {
          case "Email":
            row.push(record.creator_email || "—");
            break;
          case "Unique ID":
            row.push(record.unique_id || "N/A");
            break;
          case "Expense Type":
            row.push(record.expense_type || "—");
            break;
          case "Event Name":
            row.push(record.event_title || "N/A");
            break;
          case "Location":
            row.push(record.location || "—");
            break;
          case "Amount":
            row.push(record.approved_amount || record.amount || "—");
            break;
          case "TDS Deduction": {
            const tdsAmount = getTdsAmount(record);
            const percentage = Number(record.tds_deduction_percentage ?? 0);
            row.push(
              percentage && tdsAmount !== null
                ? `${percentage}% (${formatCurrency(tdsAmount)})`
                : tdsAmount !== null
                  ? formatCurrency(tdsAmount)
                  : "N/A"
            );
            break;
          }
          case "Security Deposit": {
            const securityDepositAmount = getSecurityDepositAmount(record);
            row.push(
              securityDepositAmount !== null
                ? formatCurrency(securityDepositAmount)
                : "N/A"
            );
            break;
          }
          case "Actual Amount": {
            const actualAmount = getActualAmount(record);
            row.push(actualAmount !== null ? formatCurrency(actualAmount) : "N/A");
            break;
          }
          case "Date of Expense":
            row.push(
              record.date ? new Date(record.date).toLocaleDateString("en-IN") : "—"
            );
            break;
          case "Status":
            row.push(record.status || "—");
            break;
          case "UTR":
            row.push(record.utr || "—");
            break;
          case "Paid Date":
            row.push(
              record.paid_approval_time
                ? new Date(record.paid_approval_time).toLocaleDateString("en-GB", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })
                : "—"
            );
            break;
          case "Payment Status":
            row.push(record.payment_status || "—");
            break;
          case "Timestamp":
            row.push(formatDateTime(record.updated_at || record.created_at) || "—");
            break;
          case "Paid by bank":
            row.push(record.paid_by_bank || "—");
            break;
          default:
            row.push("—");
        }
      }

      return row;
    });

    const data = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);

    // Set column widths
    ws["!cols"] = headers.map(() => ({ wch: 20 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Advance Payment Records");

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = buildExportFileName("xlsx");
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportXLSX = () => {
    exportToXLSX();
    setShowFormatModal(false);
    setExportLocationFilter("All Locations");
    setExportRangeLabel("");
    setExportDateRangeLabel("");
  };

  const handleExportCSV = () => {
    exportToCSV();
    setShowFormatModal(false);
    setExportLocationFilter("All Locations");
    setExportRangeLabel("");
    setExportDateRangeLabel("");
  };

  const handleQuickExportConfirm = () => {
    if (!quickExportDate) return;

    let startDate: Date;
    let endDate: Date;
    let dateRangeLabel = "";

    if (quickExportMode === "weekly") {
      const [startStr, endStr] = quickExportDate.split("|");
      if (!startStr || !endStr) return;
      startDate = new Date(startStr);
      endDate = new Date(endStr);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return;
      
      // Format: 02_Mar_2026-08_Mar_2026 (start and end both shown)
      const formatter = new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const startFormatted = formatter.format(startDate).replace(/ /g, "_");
      const endFormatted = formatter.format(endDate).replace(/ /g, "_");
      dateRangeLabel = `${startFormatted}_To_${endFormatted}`;
    } else {
      const [yearStr, monthStr] = quickExportDate.split("-");
      if (!yearStr || !monthStr) return;
      const year = Number(yearStr);
      const monthIndex = Number(monthStr) - 1;
      if (Number.isNaN(year) || Number.isNaN(monthIndex)) return;
      startDate = new Date(year, monthIndex, 1);
      endDate = new Date(year, monthIndex + 1, 0);
      
      // Format: January_2026
      const formatter = new Intl.DateTimeFormat("en-GB", {
        month: "long",
        year: "numeric",
      });
      dateRangeLabel = formatter.format(startDate).replace(/ /g, "_");
    }

    // Set export bank type based on the currently active tab
    if (activeTab === "all") {
      setExportBankType("ALL_RECORDS");
    } else {
      const bankMap = {
        ngidfc: "NGIDFC Current" as const,
        fcidfc: "FCIDFC Current" as const,
        kotak: "KOTAK" as const,
      };
      setExportBankType(bankMap[activeTab as keyof typeof bankMap] || "ALL_RECORDS");
    }

    // Label for file name based on quick export type
    setExportRangeLabel(quickExportMode === "weekly" ? "Weekly" : "Monthly");
    setExportDateRangeLabel(dateRangeLabel);
    setExportLocationFilter(quickExportLocation);

    // Pre-fill export date filters based on Date of Expense
    setExportDateFilters((prev) => ({
      ...prev,
      expenseDateMode: "Custom Date",
      expenseStartDate: formatDateForInput(startDate),
      expenseEndDate: formatDateForInput(endDate),
      paidDateMode: "All Dates",
      paidStartDate: "",
      paidEndDate: "",
    }));

    setShowQuickExportModal(false);
    setShowExportBankModal(false);
    setShowExportDateModal(false);
    setShowFormatModal(true);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex flex-col sm:flex-row sm:items-center justify-start">Advance Payment Records</h1>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Tabs */}
        <div className="w-full overflow-x-auto lg:w-auto">
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList className="bg-muted rounded-lg w-max min-w-max">
              <TabsTrigger value="all" className="cursor-pointer whitespace-nowrap text-xs sm:text-sm px-3 sm:px-4">All Expense</TabsTrigger>
              <TabsTrigger value="ngidfc" className="cursor-pointer whitespace-nowrap text-xs sm:text-sm px-3 sm:px-4">NGIDFC Record</TabsTrigger>
              <TabsTrigger value="fcidfc" className="cursor-pointer whitespace-nowrap text-xs sm:text-sm px-3 sm:px-4">FCIDFC Records</TabsTrigger>
              <TabsTrigger value="kotak" className="cursor-pointer whitespace-nowrap text-xs sm:text-sm px-3 sm:px-4">KOTAK Records</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        {/* Actions */}
        <div className="flex w-full flex-wrap gap-2 lg:w-auto">
          {isExportEnabled && (
            <>
              <Button
                onClick={() => setShowExportBankModal(true)}
                variant="outline"
                className="flex w-full items-center gap-2 sm:w-auto"
              >
                <Download className="w-4 h-4" />
                Export
              </Button>
              <Button
                onClick={() => {
                  setQuickExportMode("weekly");
                  setQuickExportLocation("All Locations");
                  setQuickExportDate("");
                  setShowQuickExportModal(true);
                }}
                className="w-full sm:w-auto flex items-center gap-2 cursor-pointer text-xs sm:text-sm"
                variant="outline"
              >
                <Download className="w-4 h-4" />
                Weekly / Monthly
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => setFilterOpen((s) => !s)}
            className="flex w-full items-center gap-2 sm:w-auto"
          >
            <Filter className="w-4 h-4" />
            Filters
          </Button>
        </div>
      </div>

      {/* Filter panel */}
      {filterOpen && (
        <div className="p-4 rounded-md border shadow-sm bg-white">
          <div className="grid grid-cols-4 gap-4">
            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Expense Type</label>
              <Select
                value={filters.expenseType || "All Expense Type"}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, expenseType: v }))
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
                  {expenseTypes
                    .filter((t) => String(t).toLowerCase().includes(searchQuery.expenseType.toLowerCase()))
                    .map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Event</label>
              <Select
                value={filters.eventName || "All Events"}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, eventName: v }))
                }
              >
                <SelectTrigger className="mt-1 w-full bg-white">
                  <SelectValue placeholder="All Events" />
                </SelectTrigger>
                <SelectContent
                  searchPlaceholder="Search event..."
                  searchValue={searchQuery.eventName}
                  onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, eventName: v }))}
                >
                  <SelectItem value="All Events">All Events</SelectItem>
                  {eventNames
                    .filter((t) => String(t).toLowerCase().includes(searchQuery.eventName.toLowerCase()))
                    .map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div> */}

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Email</label>
              <Select
                value={filters.email || "All Emails"}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, email: v }))
                }
              >
                <SelectTrigger className="mt-1 w-full bg-white">
                  <SelectValue placeholder="All Emails" />
                </SelectTrigger>
                <SelectContent
                  searchPlaceholder="Search email..."
                  searchValue={searchQuery.email}
                  onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, email: v }))}
                >
                  <SelectItem value="All Emails">All Emails</SelectItem>
                  {creators
                    .filter((t) => String(t).toLowerCase().includes(searchQuery.email.toLowerCase()))
                    .map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Unique ID</label>
              <Select
                value={filters.uniqueId || "All Unique IDs"}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, uniqueId: v }))
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
                  {uniqueIds
                    .filter((id) => String(id).toLowerCase().includes(searchQuery.uniqueId.toLowerCase()))
                    .map((id) => (
                    <SelectItem key={id} value={id}>
                      {id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Project of Expense</label>
              <Select
                value={filters.location || "All Locations"}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, location: v }))
                }
              >
                <SelectTrigger className="mt-1 w-full bg-white">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent
                  searchPlaceholder="Search project..."
                  searchValue={searchQuery.location}
                  onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, location: v }))}
                >
                  <SelectItem value="All Locations">All Projects</SelectItem>
                  {locations
                    .filter((t) => String(t).toLowerCase().includes(searchQuery.location.toLowerCase()))
                    .map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Bills</label>
              <Select
                value={filters.bills || "All Receipt/Voucher"}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, bills: v }))
                }
              >
                <SelectTrigger className="mt-1 w-full bg-white">
                  <SelectValue placeholder="All Receipt/Voucher" />
                </SelectTrigger>
                <SelectContent
                  searchPlaceholder="Search bills..."
                  searchValue={searchQuery.bills}
                  onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, bills: v }))}
                >
                  <SelectItem value="All Receipt/Voucher">All Receipt/Voucher</SelectItem>
                  {["Receipt", "Voucher"]
                    .filter((b) => b.toLowerCase().includes(searchQuery.bills.toLowerCase()))
                    .map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {bankOptions.length > 0 && (
              <div className="col-span-3 sm:col-span-1">
                <label className="text-sm font-medium">Paid by Bank</label>
                <Select
                  value={filters.paidByBank || "All Banks"}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, paidByBank: v }))
                  }
                >
                  <SelectTrigger className="mt-1 w-full bg-white">
                    <SelectValue placeholder="All Banks" />
                  </SelectTrigger>
                  <SelectContent
                    searchPlaceholder="Search bank..."
                    searchValue={searchQuery.paidByBank}
                    onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, paidByBank: v }))}
                  >
                    <SelectItem value="All Banks">All Banks</SelectItem>
                    {bankOptions
                      .filter((bank) => String(bank).toLowerCase().includes(searchQuery.paidByBank.toLowerCase()))
                      .map((bank) => (
                      <SelectItem key={bank} value={bank}>
                        {bank}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Date of expense</label>
              <Select
                value={filters.dateMode || "All Dates"}
                onValueChange={(v) => {
                  const mode = v;
                  setFilters((f) => {
                    if (mode === "All Dates")
                      return {
                        ...f,
                        dateMode: mode,
                        startDate: "",
                        endDate: "",
                      };
                    if (mode === "Single Date")
                      return {
                        ...f,
                        dateMode: mode,
                        startDate: f.startDate || "",
                        endDate: f.startDate || "",
                      };
                    return { ...f, dateMode: mode };
                  });
                }}
              >
                <SelectTrigger className="mt-1 w-full bg-white">
                  <SelectValue placeholder="All Dates" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Dates">All Dates</SelectItem>
                  <SelectItem value="Single Date">Single Date</SelectItem>
                  <SelectItem value="Custom Date">Custom Date</SelectItem>
                </SelectContent>
              </Select>

              {/* Conditional inputs shown below the Date selector */}
              <div className="mt-2">
                {filters.dateMode === "Single Date" ? (
                  <>
                    <label className="text-sm font-medium">Select Date</label>
                    <Select
                      value={filters.startDate || "none"}
                      onValueChange={(v) =>
                        setFilters((f) => ({
                          ...f,
                          startDate: v === "none" ? "" : v,
                          endDate: v === "none" ? "" : v,
                        }))
                      }
                    >
                      <SelectTrigger className="mt-1 w-full bg-white">
                        <SelectValue placeholder="Select Date" />
                      </SelectTrigger>
                      <SelectContent
                        searchPlaceholder="Search date..."
                        searchValue={searchQuery.startDate}
                        onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, startDate: v }))}
                      >
                        <SelectItem value="none">Select Date</SelectItem>
                        {expenseDateOptions
                          .filter((date) => formatDateForDisplay(date).toLowerCase().includes(searchQuery.startDate.toLowerCase()))
                          .map((date) => (
                          <SelectItem key={date} value={date}>
                            {formatDateForDisplay(date)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : filters.dateMode === "Custom Date" ? (
                  <>
                    <label className="text-sm font-medium">Start Date</label>
                    <input
                      type="date"
                      className="mt-1 block w-full border rounded px-3 py-2"
                      value={filters.startDate}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, startDate: e.target.value }))
                      }
                    />
                    <label className="text-sm font-medium mt-2 block">
                      End Date
                    </label>
                    <input
                      type="date"
                      className="mt-1 block w-full border rounded px-3 py-2"
                      value={filters.endDate}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, endDate: e.target.value }))
                      }
                    />
                  </>
                ) : null}
              </div>
            </div>

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Paid date</label>
              <Select
                value={filters.paidDateMode || "All Dates"}
                onValueChange={(v) => {
                  const mode = v;
                  setFilters((f) => {
                    if (mode === "All Dates")
                      return {
                        ...f,
                        paidDateMode: mode,
                        paidStartDate: "",
                        paidEndDate: "",
                      };
                    if (mode === "Single Date")
                      return {
                        ...f,
                        paidDateMode: mode,
                        paidStartDate: f.paidStartDate || "",
                        paidEndDate: f.paidStartDate || "",
                      };
                    return { ...f, paidDateMode: mode };
                  });
                }}
              >
                <SelectTrigger className="mt-1 w-full bg-white">
                  <SelectValue placeholder="All Dates" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All Dates">All Dates</SelectItem>
                  <SelectItem value="Single Date">Single Date</SelectItem>
                  <SelectItem value="Custom Date">Custom Date</SelectItem>
                </SelectContent>
              </Select>

              <div className="mt-2">
                {filters.paidDateMode === "Single Date" ? (
                  <>
                    <label className="text-sm font-medium">Select Date</label>
                    <Select
                      value={filters.paidStartDate || "none"}
                      onValueChange={(v) =>
                        setFilters((f) => ({
                          ...f,
                          paidStartDate: v === "none" ? "" : v,
                          paidEndDate: v === "none" ? "" : v,
                        }))
                      }
                    >
                      <SelectTrigger className="mt-1 w-full bg-white">
                        <SelectValue placeholder="Select Paid Date" />
                      </SelectTrigger>
                      <SelectContent
                        searchPlaceholder="Search date..."
                        searchValue={searchQuery.paidStartDate}
                        onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, paidStartDate: v }))}
                      >
                        <SelectItem value="none">Select Paid Date</SelectItem>
                        {paidDateFilterOptions
                          .filter((date) => formatDateForDisplay(date).toLowerCase().includes(searchQuery.paidStartDate.toLowerCase()))
                          .map((date) => (
                          <SelectItem key={date} value={date}>
                            {formatDateForDisplay(date)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </>
                ) : filters.paidDateMode === "Custom Date" ? (
                  <>
                    <label className="text-sm font-medium">Start Date</label>
                    <input
                      type="date"
                      className="mt-1 block w-full border rounded px-3 py-2"
                      value={filters.paidStartDate}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, paidStartDate: e.target.value }))
                      }
                    />
                    <label className="text-sm font-medium mt-2 block">
                      End Date
                    </label>
                    <input
                      type="date"
                      className="mt-1 block w-full border rounded px-3 py-2"
                      value={filters.paidEndDate}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, paidEndDate: e.target.value }))
                      }
                    />
                  </>
                ) : null}
              </div>
            </div>

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">TDS Deduction</label>
              <Select
                value={filters.tdsDeduction || "All TDS Deductions"}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, tdsDeduction: v }))
                }
              >
                <SelectTrigger className="mt-1 w-full bg-white">
                  <SelectValue placeholder="All TDS Deductions" />
                </SelectTrigger>
                <SelectContent
                  searchPlaceholder="Search TDS..."
                  searchValue={searchQuery.tdsDeduction}
                  onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, tdsDeduction: v }))}
                >
                  <SelectItem value="All TDS Deductions">All TDS Deductions</SelectItem>
                  {tdsDeductionOptions
                    .filter((opt) => formatTdsDeductionOptionLabel(opt).toLowerCase().includes(searchQuery.tdsDeduction.toLowerCase()))
                    .map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {formatTdsDeductionOptionLabel(opt)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Security Deposit</label>
              <Select
                value={filters.securityDeposit || "All Security Deposits"}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, securityDeposit: v }))
                }
              >
                <SelectTrigger className="mt-1 w-full bg-white">
                  <SelectValue placeholder="All Security Deposits" />
                </SelectTrigger>
                <SelectContent
                  searchPlaceholder="Search security deposit..."
                  searchValue={searchQuery.securityDeposit}
                  onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, securityDeposit: v }))}
                >
                  <SelectItem value="All Security Deposits">All Security Deposits</SelectItem>
                  {securityDepositOptions
                    .filter((opt) => (opt === "N/A" ? "N/A" : formatCurrency(Number(opt))).toLowerCase().includes(searchQuery.securityDeposit.toLowerCase()))
                    .map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt === "N/A" ? "N/A" : formatCurrency(Number(opt))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {utrValues.length > 0 && (
              <div className="col-span-3 sm:col-span-1">
                <label className="text-sm font-medium">UTR</label>
                <Select
                  value={filters.utr || "All UTRs"}
                  onValueChange={(v) =>
                    setFilters((f) => ({ ...f, utr: v }))
                  }
                >
                  <SelectTrigger className="mt-1 w-full bg-white">
                    <SelectValue placeholder="All UTRs" />
                  </SelectTrigger>
                  <SelectContent
                    searchPlaceholder="Search UTR..."
                    searchValue={searchQuery.utr}
                    onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, utr: v }))}
                  >
                    <SelectItem value="All UTRs">All UTRs</SelectItem>
                    {utrValues
                      .filter((u) => String(u).toLowerCase().includes(searchQuery.utr.toLowerCase()))
                      .map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Amount Range</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  className="block w-full border rounded px-3 py-2"
                  value={filters.minAmount}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      minAmount: e.target.value,
                    }))
                  }
                />
                <input
                  type="number"
                  placeholder="Max"
                  className="block w-full border rounded px-3 py-2"
                  value={filters.maxAmount}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      maxAmount: e.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Actual Amount Range</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  placeholder="Min"
                  className="block w-full border rounded px-3 py-2"
                  value={filters.actualMinAmount}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      actualMinAmount: e.target.value,
                    }))
                  }
                />
                <input
                  type="number"
                  placeholder="Max"
                  className="block w-full border rounded px-3 py-2"
                  value={filters.actualMaxAmount}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      actualMaxAmount: e.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-3">
            <Button className="cursor-pointer" onClick={clearFilters}>
              Clear
            </Button>
            <Button
              className="cursor-pointer"
              onClick={() => setFilterOpen(false)}
            >
              Close
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-md border shadow-sm bg-white overflow-x-auto">
        <Table className="w-full text-sm">
          <TableHeader className="bg-gray-300">
            <TableRow>
              <TableHead className="text-center py-3">S.No.</TableHead>
              <TableHead className="text-center py-3">Timestamp</TableHead>
              <TableHead className="text-center py-3">Email</TableHead>
              <TableHead className="text-center py-3">Unique ID</TableHead>
              <TableHead className="text-center py-3">Expense Type</TableHead>
              <TableHead className="text-center py-3">Event Name</TableHead>
              <TableHead className="text-center py-3">Project of Expense</TableHead>
              <TableHead className="text-center py-3">Amount</TableHead>
              <TableHead className="text-center py-3">TDS Deduction</TableHead>
              <TableHead className="text-center py-3">Security Deposit</TableHead>
              <TableHead className="text-center py-3">Actual Amount</TableHead>
              <TableHead className="text-center py-3">Bills</TableHead>
              <TableHead className="text-center py-3">Date of expense</TableHead>
              <TableHead className="text-center py-3">Status</TableHead>
              <TableHead className="text-center py-3">
                <div className="flex items-center justify-center gap-2">
                  <span>UTR</span>
                  {!isPasswordVerified ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs cursor-pointer"
                      onClick={() => {
                        setPasswordModal({ open: true, expenseId: "unlock" });
                        setEnteredPassword("");
                      }}
                    >
                      Unlock
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs text-red-600 border-red-300 hover:bg-red-50 cursor-pointer"
                      onClick={() => {
                        setIsPasswordVerified(false);
                        // Close any open UTR editing fields
                        setEditingFields((prev) => {
                          const updated = { ...prev };
                          Object.keys(updated).forEach((key) => {
                            if (updated[key].utr) {
                              updated[key] = { ...updated[key], utr: false };
                            }
                          });
                          return updated;
                        });
                        toast.success("UTR editing locked");
                      }}
                    >
                      Lock
                    </Button>
                  )}
                </div>
              </TableHead>
              <TableHead className="text-center py-3">Paid date</TableHead>
              <TableHead className="text-center py-3">Payment Status</TableHead>
              <TableHead className="text-center py-3">Paid by bank</TableHead>
              <TableHead className="text-center py-3">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableSkeleton colSpan={19} rows={5} />
            ) : filteredRecords.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={19}
                  className="text-center py-12 text-gray-500"
                >
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-lg font-medium text-gray-700">
                      No Advance Payment Records Found
                    </p>
                    <p className="text-sm text-gray-500">
                      Mark expenses as advance payment from the Records tab to see them here.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              pagination.paginatedData.map((record, index) => (
                <TableRow
                  key={record.id}
                  ref={highlightedExpenseId === record.id ? highlightedRowRef : null}
                  className={`${highlightedExpenseId === record.id
                    ? "border-2 border-yellow-400 bg-yellow-50"
                    : ""
                    }`}
                >
                  <TableCell className="text-center py-2">
                    {record.serialNumber ?? pagination.getItemNumber(index)}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {formatDateTime(record.updated_at || record.created_at)}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {record.creator_email}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {record.unique_id || "N/A"}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {record.expense_type}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {record.event_title || "N/A"}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {record.location || "N/A"}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    ₹{record.approved_amount}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {(() => {
                      const tdsAmount = getTdsAmount(record);
                      const percentage = Number(record.tds_deduction_percentage ?? 0);

                      if (percentage && tdsAmount !== null) {
                        return (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-sm">{percentage}%</span>
                            <span className="text-xs text-muted-foreground">
                              {formatCurrency(tdsAmount)}
                            </span>
                          </div>
                        );
                      }

                      if (tdsAmount !== null) {
                        return formatCurrency(tdsAmount);
                      }

                      return "N/A";
                    })()}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {(() => {
                      const securityDepositAmount = getSecurityDepositAmount(record);
                      return securityDepositAmount !== null
                        ? formatCurrency(securityDepositAmount)
                        : "N/A";
                    })()}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {(() => {
                      const actualAmount = getActualAmount(record);
                      return actualAmount !== null
                        ? formatCurrency(actualAmount)
                        : "N/A";
                    })()}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {record.receipt ? (
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 h-auto font-normal cursor-pointer text-blue-600"
                        onClick={() => {
                          if (record.receipt?.path) {
                            expenses
                              .getReceiptUrl(record.receipt.path)
                              .then(({ url, error }) => {
                                if (error) {
                                  console.error(
                                    "Error getting receipt URL:",
                                    error
                                  );
                                  toast.error("Failed to load receipt");
                                } else if (url) {
                                  window.open(url, "_blank");
                                }
                              });
                          }
                        }}
                      >
                        View Receipt
                      </Button>
                    ) : record.hasVoucher ? (
                      <Button
                        variant="link"
                        size="sm"
                        className="p-0 h-auto font-normal cursor-pointer text-blue-600"
                        onClick={() =>
                          router.push(
                            `/org/${slug}/expenses/${record.id}/voucher?from=advance-payment`
                          )
                        }
                      >
                        View Voucher
                      </Button>
                    ) : (
                      "No receipt or voucher"
                    )}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {new Date(record.date).toLocaleDateString("en-IN")}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {record.status}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {editingFields[record.id]?.utr ? (
                      <div className="flex items-center justify-center space-x-2 w-40 mx-auto">
                        <input
                          type="text"
                          className="border px-2 py-1 rounded text-sm text-center w-full"
                          value={record.utr || ""}
                          onChange={(e) => {
                            const updated = records.map((r) =>
                              r.id === record.id
                                ? { ...r, utr: e.target.value }
                                : r
                            );
                            setRecords(updated);
                            // keep filtered view in sync
                            setFilteredRecords((prev) =>
                              prev.map((r: any) =>
                                r.id === record.id
                                  ? { ...r, utr: e.target.value }
                                  : r
                              )
                            );
                          }}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              // Save UTR when Enter is pressed
                              const { error } = await supabase
                                .from("expense_new")
                                .update({ utr: record.utr })
                                .eq("id", record.id);

                              if (error) {
                                toast.error("Failed to update UTR");
                              } else {
                                toast.success("UTR updated");
                                setEditingFields((prev) => ({
                                  ...prev,
                                  [record.id]: {
                                    ...prev[record.id],
                                    utr: false,
                                  },
                                }));
                              }
                            }
                          }}
                        />
                        <div className="w-16">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-full px-1 text-sm"
                            onClick={async () => {
                              // Update UTR in Supabase when saving
                              const { error } = await supabase
                                .from("expense_new")
                                .update({ utr: record.utr })
                                .eq("id", record.id);

                              if (error) {
                                toast.error("Failed to update UTR");
                              } else {
                                toast.success("UTR updated");
                                setEditingFields((prev) => ({
                                  ...prev,
                                  [record.id]: {
                                    ...prev[record.id],
                                    utr: false,
                                  },
                                }));
                              }
                            }}
                            title="Save"
                          >
                            <Save className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center space-x-2 w-40 mx-auto">
                        <span className="truncate max-w-[100px] text-sm">
                          {record.utr || "—"}
                        </span>
                        <div className="w-16">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-full px-1 text-sm cursor-pointer"
                            onClick={() => {
                              if (isPasswordVerified) {
                                setEditingFields((prev) => ({
                                  ...prev,
                                  [record.id]: {
                                    ...(prev[record.id] || {}),
                                    utr: true,
                                  },
                                }));
                              } else {
                                setPasswordModal({
                                  open: true,
                                  expenseId: record.id,
                                });
                                setEnteredPassword("");
                              }
                            }}
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {record.paid_approval_time ? new Date(record.paid_approval_time).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    <ExpenseStatusBadge
                      status={record.payment_status}
                      className="text-xs"
                    />
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {record.paid_by_bank || "N/A"}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    <div className="flex items-center justify-center gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                router.push(
                                  `/org/${slug}/advance-payment/${record.id}?tab=${activeTab}`
                                )
                              }
                              className="flex items-center gap-2 border border-gray-300 text-black cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>View details</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openEditModal(record)}
                              className="flex items-center gap-2 border border-gray-300 text-black cursor-pointer"
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Edit record</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {filteredRecords.length > 0 && (
        <Pagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          itemsPerPage={100}
          onPageChange={pagination.setCurrentPage}
          isLoading={loading}
          itemLabel="Records"
        />
      )}

      {/* Edit record modal */}
      <Dialog
        open={editModal.open}
        onOpenChange={(open) =>
          setEditModal((prev) => ({ open, record: open ? prev.record : null }))
        }
      >
        <DialogContent className="max-w-xl sm:max-w-1xl">
          <DialogHeader>
            <DialogTitle>Edit advance payment record</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
            <div className="grid gap-3 text-sm">
              <div>
                <label className="text-sm font-medium">Unique ID</label>
                <input
                  type="text"
                  className="mt-1 block w-full border rounded px-3 py-2 bg-white"
                  value={editForm.unique_id}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, unique_id: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">Expense Type</label>
                <select
                  className="mt-1 block w-full border rounded px-3 py-2 bg-white"
                  value={editForm.expense_type}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      expense_type: e.target.value,
                    }))
                  }
                >
                  <option value="">Select expense type</option>
                  {expenseTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Event Name</label>
                <select
                  className="mt-1 block w-full border rounded px-3 py-2 bg-white"
                  value={editForm.event_id}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      event_id: e.target.value,
                    }))
                  }
                >
                  <option value="">Select event</option>
                  {eventOptions.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title}
                    </option>
                  ))}
                  {editModal.record?.event_id &&
                    eventOptions.every((ev) => ev.id !== editModal.record?.event_id) && (
                      <option value={editModal.record.event_id}>
                        {editModal.record.event_title || "Current event"}
                      </option>
                    )}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Location</label>
                <select
                  className="mt-1 block w-full border rounded px-3 py-2 bg-white"
                  value={editForm.location}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      location: e.target.value,
                    }))
                  }
                >
                  <option value="">Select location</option>
                  {locations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  className="mt-1 block w-full border rounded px-3 py-2"
                  value={editForm.approved_amount}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      approved_amount: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <label className="text-sm font-medium">UTR</label>
                <input
                  type="text"
                  className="mt-1 block w-full border rounded px-3 py-2"
                  value={editForm.utr}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, utr: e.target.value }))
                  }
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Finance-only changes here will not alter the creator&apos;s submitted expense fields.
            </p>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setEditModal({ open: false, record: null })}
              className="cursor-pointer"
              disabled={savingEdit}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              className="cursor-pointer"
              disabled={savingEdit}
            >
              {savingEdit ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Modal for UTR Editing */}
      <Dialog
        open={passwordModal.open}
        onOpenChange={() => setPasswordModal({ open: false, expenseId: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter Password to Unlock UTR Editing</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <input
              type="password"
              className="w-full border px-3 py-2 rounded mb-0"
              placeholder="Password"
              value={enteredPassword}
              onChange={(e) => setEnteredPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (enteredPassword === ADMIN_PASSWORD) {
                    setIsPasswordVerified(true);
                    if (
                      passwordModal.expenseId &&
                      passwordModal.expenseId !== "unlock"
                    ) {
                      const id = passwordModal.expenseId;
                      setEditingFields((prev) => ({
                        ...prev,
                        [id]: { ...(prev[id] || {}), utr: true },
                      }));
                    }
                    setPasswordModal({ open: false, expenseId: null });
                    toast.success("UTR editing unlocked");
                  } else {
                    toast.error("Incorrect password");
                  }
                }
              }}
            />
            <p className="text-sm text-gray-600">
              Reach out to admin for password to unlock UTR editing.
            </p>
          </div>
          <DialogFooter className="mt-4">
            <Button
              onClick={() => {
                if (enteredPassword === ADMIN_PASSWORD) {
                  setIsPasswordVerified(true);
                  if (
                    passwordModal.expenseId &&
                    passwordModal.expenseId !== "unlock"
                  ) {
                    const id = passwordModal.expenseId;
                    setEditingFields((prev) => ({
                      ...prev,
                      [id]: { ...(prev[id] || {}), utr: true },
                    }));
                  }
                  setPasswordModal({ open: false, expenseId: null });
                  toast.success("UTR editing unlocked");
                } else {
                  toast.error("Incorrect password");
                }
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Column Selection Modal */}
      <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Columns to Export</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-[50vh] overflow-y-auto">
            {allColumns.map((col) => (
              <div key={col} className="flex items-center space-x-2">
                <Checkbox
                  id={col}
                  checked={selectedColumns.includes(col)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedColumns((prev) => [...prev, col]);
                    } else {
                      setSelectedColumns((prev) =>
                        prev.filter((c) => c !== col)
                      );
                    }
                  }}
                />
                <label
                  htmlFor={col}
                  className="text-sm font-medium cursor-pointer"
                >
                  {col}
                </label>
              </div>
            ))}
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setShowExportModal(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowExportModal(false);
                setShowFormatModal(true);
              }}
              className="cursor-pointer"
            >
              Next
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bank selection modal (pre-export) */}
      <Dialog open={showExportBankModal} onOpenChange={setShowExportBankModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Advance Pyament Records to Export</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center">
              <input
                type="radio"
                id="all_records"
                name="export_bank"
                checked={exportBankType === "ALL_RECORDS"}
                onChange={() => setExportBankType("ALL_RECORDS")}
              />
              <label htmlFor="all_records" className="ml-2 cursor-pointer">All Records</label>
            </div>
            <div className="flex items-center">
              <input
                type="radio"
                id="ngidfc"
                name="export_bank"
                checked={exportBankType === "NGIDFC Current"}
                onChange={() => setExportBankType("NGIDFC Current")}
              />
              <label htmlFor="ngidfc" className="ml-2 cursor-pointer">NG Records (NGIDFC Current)</label>
            </div>
            <div className="flex items-center">
              <input
                type="radio"
                id="fcidfc"
                name="export_bank"
                checked={exportBankType === "FCIDFC Current"}
                onChange={() => setExportBankType("FCIDFC Current")}
              />
              <label htmlFor="fcidfc" className="ml-2 cursor-pointer">FC Records (FCIDFC Current)</label>
            </div>
            <div className="flex items-center">
              <input
                type="radio"
                id="kotak"
                name="export_bank"
                checked={exportBankType === "KOTAK"}
                onChange={() => setExportBankType("KOTAK")}
              />
              <label htmlFor="kotak" className="ml-2 cursor-pointer">KOTAK Records</label>
            </div>
            <div className="flex items-center">
              <input
                type="radio"
                id="no_bank"
                name="export_bank"
                checked={exportBankType === "NO_BANK"}
                onChange={() => setExportBankType("NO_BANK")}
              />
              <label htmlFor="no_bank" className="ml-2 cursor-pointer">No Bank Records (Not paid by bank)</label>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowExportBankModal(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setShowExportBankModal(false);
                if (exportBankType === "ALL_RECORDS") {
                  setExportDateFilters({
                    expenseDateMode: "All Dates",
                    expenseStartDate: "",
                    expenseEndDate: "",
                    paidDateMode: "All Dates",
                    paidStartDate: "",
                    paidEndDate: "",
                  });
                  setShowFormatModal(true);
                  return;
                }
                setShowExportDateModal(true);
              }}
              disabled={exportBankType === ""}
            >
              Next
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Date Selection Modal */}
      <Dialog open={showExportDateModal} onOpenChange={setShowExportDateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Date Range</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Date of Expense</label>
              <select
                className="mt-1 block w-full border rounded px-3 py-2 bg-white"
                value={exportDateFilters.expenseDateMode}
                onChange={(e) => {
                  const mode = e.target.value;
                  setExportDateFilters((prev) => {
                    if (mode === "Single Date") {
                      return {
                        ...prev,
                        expenseDateMode: mode,
                        expenseStartDate: prev.expenseStartDate || "",
                        expenseEndDate: prev.expenseStartDate || "",
                      };
                    }
                    if (mode === "Custom Date") {
                      return {
                        ...prev,
                        expenseDateMode: mode,
                      };
                    }
                    return {
                      ...prev,
                      expenseDateMode: mode,
                      expenseStartDate: "",
                      expenseEndDate: "",
                    };
                  });
                }}
              >
                <option>All Dates</option>
                <option>Single Date</option>
                <option>Custom Date</option>
              </select>

              <div className="mt-2">
                {exportDateFilters.expenseDateMode === "Single Date" ? (
                  <>
                    <label className="text-sm font-medium">Select Date</label>
                    <select
                      className="mt-1 block w-full border rounded px-3 py-2 bg-white"
                      value={exportDateFilters.expenseStartDate}
                      onChange={(e) =>
                        setExportDateFilters((prev) => ({
                          ...prev,
                          expenseStartDate: e.target.value,
                          expenseEndDate: e.target.value,
                        }))
                      }
                    >
                      <option value="">Select Date</option>
                      {expenseDateOptions.map((date) => (
                        <option key={date} value={date}>
                          {formatDateForDisplay(date)}
                        </option>
                      ))}
                    </select>
                  </>
                ) : exportDateFilters.expenseDateMode === "Custom Date" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm font-medium">From</label>
                      <input
                        type="date"
                        className="mt-1 block w-full border rounded px-3 py-2"
                        value={exportDateFilters.expenseStartDate}
                        onChange={(e) =>
                          setExportDateFilters((prev) => ({
                            ...prev,
                            expenseStartDate: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">To</label>
                      <input
                        type="date"
                        className="mt-1 block w-full border rounded px-3 py-2"
                        value={exportDateFilters.expenseEndDate}
                        onChange={(e) =>
                          setExportDateFilters((prev) => ({
                            ...prev,
                            expenseEndDate: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Paid Date</label>
              <select
                className="mt-1 block w-full border rounded px-3 py-2 bg-white"
                value={exportDateFilters.paidDateMode}
                onChange={(e) => {
                  const mode = e.target.value;
                  setExportDateFilters((prev) => {
                    if (mode === "Single Date") {
                      return {
                        ...prev,
                        paidDateMode: mode,
                        paidStartDate: prev.paidStartDate || "",
                        paidEndDate: prev.paidStartDate || "",
                      };
                    }
                    if (mode === "Custom Date") {
                      return {
                        ...prev,
                        paidDateMode: mode,
                      };
                    }
                    return {
                      ...prev,
                      paidDateMode: mode,
                      paidStartDate: "",
                      paidEndDate: "",
                    };
                  });
                }}
              >
                <option>All Dates</option>
                <option>Single Date</option>
                <option>Custom Date</option>
              </select>

              <div className="mt-2">
                {exportDateFilters.paidDateMode === "Single Date" ? (
                  <>
                    <label className="text-sm font-medium">Select Date</label>
                    <select
                      className="mt-1 block w-full border rounded px-3 py-2 bg-white"
                      value={exportDateFilters.paidStartDate}
                      onChange={(e) =>
                        setExportDateFilters((prev) => ({
                          ...prev,
                          paidStartDate: e.target.value,
                          paidEndDate: e.target.value,
                        }))
                      }
                    >
                      <option value="">Select Date</option>
                      {paidDateOptions.map((date) => (
                        <option key={date} value={date}>
                          {formatDateForDisplay(date)}
                        </option>
                      ))}
                    </select>
                  </>
                ) : exportDateFilters.paidDateMode === "Custom Date" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-sm font-medium">From</label>
                      <input
                        type="date"
                        className="mt-1 block w-full border rounded px-3 py-2"
                        value={exportDateFilters.paidStartDate}
                        onChange={(e) =>
                          setExportDateFilters((prev) => ({
                            ...prev,
                            paidStartDate: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">To</label>
                      <input
                        type="date"
                        className="mt-1 block w-full border rounded px-3 py-2"
                        value={exportDateFilters.paidEndDate}
                        onChange={(e) =>
                          setExportDateFilters((prev) => ({
                            ...prev,
                            paidEndDate: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <DialogFooter className="mt-4 flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowExportDateModal(false);
                setShowExportBankModal(true);
              }}
              className="cursor-pointer"
            >
              Back
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowExportDateModal(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                // basic validation
                const { expenseDateMode, expenseStartDate, expenseEndDate, paidDateMode, paidStartDate, paidEndDate } = exportDateFilters;
                if (expenseDateMode === "Single Date" && !expenseStartDate) {
                  toast.error("Please select expense date");
                  return;
                }
                if (expenseDateMode === "Custom Date" && (!expenseStartDate || !expenseEndDate)) {
                  toast.error("Please select expense date range");
                  return;
                }
                if (paidDateMode === "Single Date" && !paidStartDate) {
                  toast.error("Please select paid date");
                  return;
                }
                if (paidDateMode === "Custom Date" && (!paidStartDate || !paidEndDate)) {
                  toast.error("Please select paid date range");
                  return;
                }

                setShowExportDateModal(false);
                setShowFormatModal(true);
              }}
              className="cursor-pointer"
            >
              Next
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Format Selection Modal */}
      <Dialog open={showFormatModal} onOpenChange={setShowFormatModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Export Format</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Choose the format for your export file:
            </p>
          </div>
          <DialogFooter className="mt-4 flex gap-2">
            <Button
              onClick={handleExportCSV}
              className="cursor-pointer"
            >
              Export as CSV
            </Button>
            <Button
              onClick={handleExportXLSX}
              className="cursor-pointer"
            >
              Export as XLSX
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick Weekly/Monthly Export Modal */}
      <Dialog open={showQuickExportModal} onOpenChange={setShowQuickExportModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Weekly / Monthly Export</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Export Type</label>
              <RadioGroup
                className="mt-2 flex flex-wrap gap-6"
                value={quickExportMode}
                onValueChange={(v) => setQuickExportMode(v as "weekly" | "monthly")}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem id="weekly-export" value="weekly" />
                  <Label htmlFor="weekly-export" className="text-sm cursor-pointer">
                    Weekly Export
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem id="monthly-export" value="monthly" />
                  <Label htmlFor="monthly-export" className="text-sm cursor-pointer">
                    Monthly Export
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <div>
              <label className="text-sm font-medium">Project of Expense (Date of Expense)</label>
              <select
                className="mt-1 block w-full border rounded px-3 py-2 bg-white"
                value={quickExportLocation}
                onChange={(e) => setQuickExportLocation(e.target.value)}
              >
                <option value="All Locations">All Projects</option>
                {quickExportLocationOptions.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium">
                {quickExportMode === "monthly"
                  ? "Month (Date of Expense)"
                  : "Week (Date of Expense)"}
              </label>
              {quickExportMode === "weekly" ? (
                <select
                  className="mt-1 block w-full border rounded px-3 py-2 bg-white"
                  value={quickExportDate}
                  onChange={(e) => setQuickExportDate(e.target.value)}
                >
                  <option value="">Select week</option>
                  {weeklyExpenseOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <select
                  className="mt-1 block w-full border rounded px-3 py-2 bg-white"
                  value={quickExportDate}
                  onChange={(e) => setQuickExportDate(e.target.value)}
                >
                  <option value="">Select month</option>
                  {monthlyExpenseOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-xs text-gray-500 mt-1">
                {quickExportMode === "weekly"
                  ? "Select the week (based on Date of Expense) whose records you want to export."
                  : "Select the month (based on Date of Expense) whose records you want to export."}
              </p>
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setShowQuickExportModal(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={handleQuickExportConfirm}
              disabled={!quickExportDate}
              className="cursor-pointer"
            >
              Next
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
