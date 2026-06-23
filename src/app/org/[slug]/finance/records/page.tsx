"use client";

import React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { formatCurrency, formatDateTime } from "@/lib/utils";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

const normalizeCustomFieldKey = (key: string) =>
  key.toLowerCase().replace(/[\s_-]+/g, "");

const getCustomFieldValue = (
  customFields: unknown,
  targetKey: string
): string | null => {
  if (!customFields) return null;

  let parsedCustomFields: unknown = customFields;
  if (typeof parsedCustomFields === "string") {
    try {
      parsedCustomFields = JSON.parse(parsedCustomFields);
    } catch {
      return null;
    }
  }

  if (!parsedCustomFields || typeof parsedCustomFields !== "object") return null;

  const fields = parsedCustomFields as Record<string, unknown>;
  const normalizedTargetKey = normalizeCustomFieldKey(targetKey);

  for (const [key, value] of Object.entries(fields)) {
    if (normalizeCustomFieldKey(key) === normalizedTargetKey) {
      if (typeof value === "string") return value;
      if (value === null || value === undefined) return null;
      return String(value);
    }
  }

  return null;
};

export default function PaymentRecords() {
  const RECORDS_PER_PAGE = 100;
  const [records, setRecords] = useState<any[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { slug } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [highlightedExpenseId, setHighlightedExpenseId] = useState<string | null>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);
  const hasReturnNavigationParams =
    Number(searchParams.get("page")) > 0 || Boolean(searchParams.get("expID"));
  const isRestoringViewedExpenseRef = useRef(hasReturnNavigationParams);

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
    startDate: "",
    endDate: "",
    dateMode: "All Dates",
    paidStartDate: "",
    paidEndDate: "",
    paidDateMode: "All Dates",
    minAmount: "",
    maxAmount: "",
    minActualAmount: "",
    maxActualAmount: "",
    tdsDeduction: "All TDS Deductions",
    securityDeposit: "All Security Deposits",
    paidByBank: "All Banks",
  });
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

  // Bank filter tabs: All, NGIDFC Current, FCIDFC Current
  const [activeTab, setActiveTab] = useState<"all" | "ngidfc" | "fcidfc" | "kotak">("all");
  const BANK_STRING_MAP: Record<"ngidfc" | "fcidfc" | "kotak", "NGIDFC Current" | "FCIDFC Current" | "KOTAK"> =
  {
    ngidfc: "NGIDFC Current",
    fcidfc: "FCIDFC Current",
    kotak: "KOTAK",
  };

  useEffect(() => {
    const tabParam = searchParams.get("activeTab");
    if (tabParam === "ngidfc" || tabParam === "fcidfc" || tabParam === "kotak" || tabParam === "all") {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    isRestoringViewedExpenseRef.current = hasReturnNavigationParams;
  }, [hasReturnNavigationParams]);

  const handleBankTabChange = (value: "all" | "ngidfc" | "fcidfc" | "kotak") => {
    setActiveTab(value);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", params.get("tab") || "records");
    params.set("activeTab", value);
    params.delete("expID");
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  // Use pagination hook
  const pagination = usePagination(filteredRecords, RECORDS_PER_PAGE);

  // Reset page when filters change
  useEffect(() => {
    if (!isRestoringViewedExpenseRef.current) {
      pagination.resetPage();
    }
  }, [filters]);

  // Handle expID from URL parameter
  useEffect(() => {
    const expID = searchParams.get("expID");
    if (expID) {
      setHighlightedExpenseId(expID);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!highlightedExpenseId) return;

    const timer = window.setTimeout(() => {
      setHighlightedExpenseId(null);
    }, 10000);

    return () => window.clearTimeout(timer);
  }, [highlightedExpenseId]);

  useEffect(() => {
    const pageParam = Number(searchParams.get("page"));
    if (Number.isInteger(pageParam) && pageParam > 0) {
      pagination.setCurrentPage(Math.min(pageParam, pagination.totalPages));
    }
  }, [searchParams, pagination.totalPages, pagination.setCurrentPage]);

  // Move to the page containing the highlighted row
  useEffect(() => {
    const hasRequestedPage = Number(searchParams.get("page")) > 0;

    if (highlightedExpenseId && filteredRecords.length > 0 && !hasRequestedPage) {
      const recordIndex = filteredRecords.findIndex(r => r.id === highlightedExpenseId);
      if (recordIndex !== -1) {
        const pageNumber = Math.floor(recordIndex / RECORDS_PER_PAGE) + 1;
        pagination.setCurrentPage(pageNumber);
      }
    }
  }, [highlightedExpenseId, filteredRecords, searchParams, RECORDS_PER_PAGE, pagination.setCurrentPage]);

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
  const [markAdvanceModal, setMarkAdvanceModal] = useState<{
    open: boolean;
    id: string | null;
  }>({ open: false, id: null });
  const [markAdvanceLoading, setMarkAdvanceLoading] = useState(false);
  const [editModal, setEditModal] = useState<{
    open: boolean;
    record: any | null;
  }>({ open: false, record: null });
  const [editForm, setEditForm] = useState({
    expense_type: "",
    event_id: "",
    location: "",
    amount: "",
    utr: "",
    unique_id: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Export state
  const [showExportModal, setShowExportModal] = useState(false);
  const [showExportDateModal, setShowExportDateModal] = useState(false);
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [exportBankType, setExportBankType] = useState<
    "ALL_RECORDS" | "NGIDFC Current" | "FCIDFC Current" | "KOTAK" | "NO_BANK" | ""
  >("");
  const [exportDateFilters, setExportDateFilters] = useState({
    expenseDateMode: "All Dates",
    expenseStartDate: "",
    expenseEndDate: "",
    paidDateMode: "All Dates",
    paidStartDate: "",
    paidEndDate: "",
  });
  const [exportRangeLabel, setExportRangeLabel] = useState<"" | "Weekly" | "Monthly">("");
  const [showQuickExportModal, setShowQuickExportModal] = useState(false);
  const [quickExportMode, setQuickExportMode] = useState<"weekly" | "monthly">("weekly");
  const [quickExportDate, setQuickExportDate] = useState("");
  const [exportLocationFilter, setExportLocationFilter] = useState("All Locations");
  const [quickExportLocation, setQuickExportLocation] = useState("All Locations");

  const ADMIN_PASSWORD = "admin"; // your password

  const getBaseAmount = (record: any) =>
    Number(record.approved_amount ?? record.amount ?? 0);

  const getTdsAmount = (record: any) => {
    const stored = record.tds_deduction_amount;
    if (stored !== null && stored !== undefined && stored !== "") {
      return Number(stored);
    }
    const percentage = Number(record.tds_deduction_percentage ?? 0);
    if (!percentage) return null;
    const base = getBaseAmount(record);
    return Number(((base * percentage) / 100).toFixed(2));
  };

  const getSecurityDepositAmount = (record: any) => {
    const amount = record.security_deposit_amount;
    if (amount === null || amount === undefined || amount === "") {
      return null;
    }
    return Number(amount);
  };

  const hasTdsDeduction = (record: any) => {
    const stored = record.tds_deduction_amount;
    if (stored !== null && stored !== undefined && stored !== "") {
      return true;
    }
    return Number(record.tds_deduction_percentage ?? 0) > 0;
  };

  const getTdsDeductionPercentage = (record: any) =>
    Number(record.tds_deduction_percentage ?? 0);

  const getTdsDeductionOptionValue = (record: any) => {
    if (!hasTdsDeduction(record)) return "N/A";

    const percentage = getTdsDeductionPercentage(record);
    const amount = getTdsAmount(record) ?? 0;
    return `${percentage}|${amount.toFixed(2)}`;
  };

  const formatTdsDeductionOptionLabel = (optionValue: string) => {
    if (optionValue === "N/A") return "N/A";

    const [percentageText, amountText] = optionValue.split("|");
    const percentage = Number(percentageText);
    const amount = Number(amountText);
    const percentageLabel =
      Number.isFinite(percentage) && percentage > 0 ? `${percentage}%` : "—";

    return `${percentageLabel} (${formatCurrency(amount)})`;
  };

  const hasSecurityDeposit = (record: any) => {
    const amount = record.security_deposit_amount;
    return !(amount === null || amount === undefined || amount === "");
  };

  const getActualAmount = (record: any) => {
    const stored = record.actual_amount;
    if (stored !== null && stored !== undefined && stored !== "") {
      return Number(stored);
    }
    const base = getBaseAmount(record);
    const tdsAmount = getTdsAmount(record);
    const securityDepositAmount = getSecurityDepositAmount(record);
    if (
      !base &&
      !tdsAmount &&
      !record.tds_deduction_percentage &&
      !securityDepositAmount
    ) {
      return null;
    }
    return Number(
      (base - (tdsAmount ?? 0) - (securityDepositAmount ?? 0)).toFixed(2)
    );
  };

  const formatKotakVoucherDate = (dateValue?: string | Date | null) => {
    if (!dateValue) return "—";
    try {
      const d = new Date(dateValue);
      const day = d.toLocaleString("en-GB", {
        day: "2-digit",
        timeZone: "Asia/Kolkata",
      });
      const month = d.toLocaleString("en-GB", {
        month: "2-digit",
        timeZone: "Asia/Kolkata",
      });
      const year = d.toLocaleString("en-GB", {
        year: "numeric",
        timeZone: "Asia/Kolkata",
      });
      return `${day}-${month}-${year}`;
    } catch (err) {
      return "—";
    }
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

  const formatDateForDisplay = (dateValue?: string) => {
    if (!dateValue) return "";
    const [year, month, day] = dateValue.split("-");
    if (!year || !month || !day) return dateValue;
    return `${day}-${month}-${year}`;
  };

  const formatDateForInput = (date: Date) => {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const getMonthYearLabelForDateRange = (start?: string, end?: string) => {
    if (!start || !end) return null;

    const [startYear, startMonth, startDay] = start.split("-").map(Number);
    const [endYear, endMonth, endDay] = end.split("-").map(Number);
    if (
      !startYear ||
      !startMonth ||
      !startDay ||
      !endYear ||
      !endMonth ||
      !endDay
    ) {
      return null;
    }

    const isSameMonth = startYear === endYear && startMonth === endMonth;
    const isFirstDay = startDay === 1;
    const lastDayOfMonth = new Date(startYear, startMonth, 0).getDate();
    const isLastDay = endDay === lastDayOfMonth;

    if (!isSameMonth || !isFirstDay || !isLastDay) return null;

    const monthName = new Date(startYear, startMonth - 1, 1).toLocaleString("en-US", {
      month: "long",
    });
    return `${monthName}_${startYear}`;
  };

  const isDateWithinRange = (
    value: string | Date | null | undefined,
    mode: string,
    start: string,
    end: string
  ) => {
    if (mode === "All Dates") return true;
    const dateValue = toDateOnly(value);
    if (!dateValue) return false;
    if (mode === "Single Date") {
      if (!start) return true;
      return dateValue === start;
    }
    if (mode === "Custom Date") {
      if (!start || !end) return false;
      return dateValue >= start && dateValue <= end;
    }
    return true;
  };

  const validateExportDateFilters = () => {
    const {
      expenseDateMode,
      expenseStartDate,
      expenseEndDate,
      paidDateMode,
      paidStartDate,
      paidEndDate,
    } = exportDateFilters;

    if (expenseDateMode === "Single Date" && !expenseStartDate) {
      toast.error("Please select a single expense date");
      return false;
    }
    if (expenseDateMode === "Custom Date") {
      if (!expenseStartDate || !expenseEndDate) {
        toast.error("Please select both expense date range values");
        return false;
      }
      if (expenseStartDate > expenseEndDate) {
        toast.error("Expense date range is invalid");
        return false;
      }
    }

    if (paidDateMode === "Single Date" && !paidStartDate) {
      toast.error("Please select a single paid date");
      return false;
    }
    if (paidDateMode === "Custom Date") {
      if (!paidStartDate || !paidEndDate) {
        toast.error("Please select both paid date range values");
        return false;
      }
      if (paidStartDate > paidEndDate) {
        toast.error("Paid date range is invalid");
        return false;
      }
    }

    return true;
  };

  const getAllTabFilteredRecords = () => {
    return records.filter((r: any) => {
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
      if (!isDateWithinRange(r.date, filters.dateMode, filters.startDate, filters.endDate))
        return false;
      if (
        !isDateWithinRange(
          r.paid_approval_time,
          filters.paidDateMode,
          filters.paidStartDate,
          filters.paidEndDate
        )
      )
        return false;
      const amt = Number(r.approved_amount) || 0;
      if (filters.minAmount !== "" && amt < Number(filters.minAmount))
        return false;
      if (filters.maxAmount !== "" && amt > Number(filters.maxAmount))
        return false;
      const actualAmount = getActualAmount(r);
      if (
        filters.minActualAmount !== "" &&
        (actualAmount === null || actualAmount < Number(filters.minActualAmount))
      ) {
        return false;
      }
      if (
        filters.maxActualAmount !== "" &&
        (actualAmount === null || actualAmount > Number(filters.maxActualAmount))
      ) {
        return false;
      }
      if (
        filters.tdsDeduction !== "All TDS Deductions" &&
        !(
          (filters.tdsDeduction === "N/A" && !hasTdsDeduction(r)) ||
          (filters.tdsDeduction !== "N/A" &&
            filters.tdsDeduction === getTdsDeductionOptionValue(r))
        )
      ) {
        return false;
      }
      const securityDepositAmount = getSecurityDepositAmount(r);
      if (
        filters.securityDeposit !== "All Security Deposits" &&
        !(
          (filters.securityDeposit === "N/A" && !hasSecurityDeposit(r)) ||
          (filters.securityDeposit !== "N/A" &&
            securityDepositAmount === Number(filters.securityDeposit))
        )
      ) {
        return false;
      }

      return true;
    });
  };

  const getAllRecordsTableExportData = () => {
    const headers = [
      "S.No.",
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
      "Bills",
      "Date of expense",
      "Status",
      "UTR",
      "Paid date",
      "Payment Status",
      "Paid by bank",
      "Advance Payment",
    ];

    const rows = getExportRecords().map((record: any, index: number) => {
      const tdsPercent = record.tds_deduction_percentage;
      const tdsAmount = getTdsAmount(record);
      const tdsDisplay = tdsPercent
        ? `${tdsPercent}% (${tdsAmount !== null ? formatCurrency(tdsAmount) : "—"})`
        : tdsAmount !== null
          ? formatCurrency(tdsAmount)
          : "N/A";
      const securityDepositAmount = getSecurityDepositAmount(record);
      const securityDepositDisplay =
        securityDepositAmount !== null
          ? formatCurrency(securityDepositAmount)
          : "N/A";

      const actualAmount = getActualAmount(record);
      const billsDisplay = record.receipt
        ? "View Receipt"
        : record.hasVoucher
          ? "View Voucher"
          : "No receipt or voucher";

      const hasAdvancePrefix =
        record.unique_id?.toLowerCase().startsWith("advance_") ||
        record.unique_id?.startsWith("Advance_");
      const isMarkedAsAdvance = record.custom_fields?.marked_as_advance === true;
      const isAdvance = isMarkedAsAdvance || hasAdvancePrefix;
      const advanceDisplay = isAdvance ? "Mark as Advance" : "Regular Payment";

      return [
        record.serialNumber ?? index + 1,
        formatDateTime(record.updated_at || record.created_at),
        record.creator_email || "",
        record.unique_id || "N/A",
        record.expense_type || "",
        record.event_title || "N/A",
        record.location || "N/A",
        `₹${record.approved_amount ?? 0}`,
        tdsDisplay,
        securityDepositDisplay,
        actualAmount !== null ? formatCurrency(actualAmount) : "—",
        billsDisplay,
        record.date ? new Date(record.date).toLocaleDateString("en-IN") : "—",
        record.status || "",
        record.utr || "—",
        record.paid_approval_time
          ? new Date(record.paid_approval_time).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
          : "—",
        record.payment_status || "",
        record.paid_by_bank || "N/A",
        advanceDisplay,
      ];
    });

    return { headers, rows };
  };

  const getExportRecords = () => {
    const baseRecords = exportBankType === "ALL_RECORDS"
      ? getAllTabFilteredRecords()
      : exportBankType
        ? filteredRecords.filter((r) =>
          exportBankType === "NO_BANK"
            ? !(r.paid_by_bank || "").trim()
            : (r.paid_by_bank || "") === exportBankType
        )
        : filteredRecords;

    return baseRecords.filter((record) => {
      const matchesExpenseDate = isDateWithinRange(
        record.date,
        exportDateFilters.expenseDateMode,
        exportDateFilters.expenseStartDate,
        exportDateFilters.expenseEndDate
      );
      const matchesPaidDate = isDateWithinRange(
        record.paid_approval_time,
        exportDateFilters.paidDateMode,
        exportDateFilters.paidStartDate,
        exportDateFilters.paidEndDate
      );
      const matchesLocation =
        exportLocationFilter === "All Locations" ||
        (record.location || "") === exportLocationFilter;

      return matchesExpenseDate && matchesPaidDate && matchesLocation;
    });
  };

  const expenseDateOptions = useMemo(() => {
    const baseRecords = exportBankType === "ALL_RECORDS"
      ? getAllTabFilteredRecords()
      : exportBankType
        ? filteredRecords.filter((record) =>
          exportBankType === "NO_BANK"
            ? !(record.paid_by_bank || "").trim()
            : (record.paid_by_bank || "") === exportBankType
        )
        : filteredRecords;
    const uniqueDates = new Set<string>();
    baseRecords.forEach((record) => {
      const dateOnly = toDateOnly(record.date);
      if (dateOnly) uniqueDates.add(dateOnly);
    });
    return Array.from(uniqueDates).sort((a, b) => a.localeCompare(b));
  }, [filteredRecords, exportBankType, records, filters]);

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

  const paidDateOptions = useMemo(() => {
    const baseRecords = exportBankType === "ALL_RECORDS"
      ? getAllTabFilteredRecords()
      : exportBankType
        ? filteredRecords.filter((record) =>
          exportBankType === "NO_BANK"
            ? !(record.paid_by_bank || "").trim()
            : (record.paid_by_bank || "") === exportBankType
        )
        : filteredRecords;
    const uniqueDates = new Set<string>();
    baseRecords.forEach((record) => {
      const dateOnly = toDateOnly(record.paid_approval_time);
      if (dateOnly) uniqueDates.add(dateOnly);
    });
    return Array.from(uniqueDates).sort((a, b) => a.localeCompare(b));
  }, [filteredRecords, exportBankType, records, filters]);

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

        const { data, error } = await supabase
          .from("expense_new")
          .select("*")
          .eq("payment_status", "paid")
          .eq("org_id", orgId)
          // Show records with missing paid_approval_time first, then the rest ascending
          .order("paid_approval_time", { ascending: true, nullsFirst: true })
          // Stable tie-breaker to prevent random ordering when timestamps match
          .order("created_at", { ascending: true });

        if (error) throw error;

        const rows = data || [];

        // Fetch vouchers for these records (if any)
        try {
          const expenseIds = rows.map((r: any) => r.id).filter(Boolean);
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
            rows.forEach((r: any) => {
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
            rows
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

        const sortByPaidApprovalTime = (list: any[]) =>
          [...list].sort((a, b) => {
            const aTime = a.paid_approval_time
              ? new Date(a.paid_approval_time).getTime()
              : null;
            const bTime = b.paid_approval_time
              ? new Date(b.paid_approval_time).getTime()
              : null;

            // nulls first (show items missing paid_approval_time at the top)
            if (aTime === null && bTime === null) {
              // stable fallback to avoid random shuffles
              const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
              const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
              if (aCreated !== bCreated) return aCreated - bCreated;
              return String(a.id || "").localeCompare(String(b.id || ""));
            }
            // nulls first => missing paid_approval_time appears at top
            if (aTime === null) return -1;
            if (bTime === null) return 1;
            if (aTime !== bTime) return aTime - bTime; // ascending

            // stable tie-breaker when paid timestamps match
            const aCreated = a.created_at ? new Date(a.created_at).getTime() : 0;
            const bCreated = b.created_at ? new Date(b.created_at).getTime() : 0;
            if (aCreated !== bCreated) return aCreated - bCreated;
            return String(a.id || "").localeCompare(String(b.id || ""));
          });

        const withTitles = rows.map((r: any) => ({
          ...r,
          event_title: r.event_id ? eventTitleMap[r.event_id] || "N/A" : "N/A",
        }));

        // Fetch bank details to enrich records with user's unique_id (if available)
        try {
          const { data: bankData, error: bankError } = await supabase
            .from("bank_details")
            .select("*");
          if (bankError) throw bankError;

          const bankDetailsByUniqueId = new Map<string, any>();
          const bankDetailsByEmail = new Map<string, any>();

          bankData?.forEach((bankDetail: any) => {
            const uniqueId = String(bankDetail.unique_id || "").trim();
            const advanceUniqueId = String(bankDetail.advance_unique_id || "").trim();
            const directPaymentUniqueId = String(bankDetail.direct_payment_unique_id || "").trim();
            // const email = String(bankDetail.email || "").trim().toLowerCase();

            if (uniqueId) {
              bankDetailsByUniqueId.set(uniqueId, bankDetail);
            }
            if (advanceUniqueId) {
              bankDetailsByUniqueId.set(advanceUniqueId, bankDetail);
            }
            if (directPaymentUniqueId) {
              bankDetailsByUniqueId.set(directPaymentUniqueId, bankDetail);
            }

            // if (email) {
            //   bankDetailsByEmail.set(email, bankDetail);
            // }
          });

          const enriched = withTitles.map((r: any) => {
            const uniqueId = String(r.unique_id || "").trim();
            // const email = String(r.creator_email || "").trim().toLowerCase();
            // Match bank details strictly by unique_id only (preferred by user)
            const matched = bankDetailsByUniqueId.get(uniqueId) || null;

            const matchedAccountHolder = matched?.account_holder || null;
            return {
              ...r,
              unique_id: r.unique_id || matched?.unique_id || "N/A",
              account_holder:
                matchedAccountHolder ||
                null,
              beneficiary_name:
                matchedAccountHolder ||
                "N/A",
            };
          });

          const sorted = sortByPaidApprovalTime(enriched);
          const sortedWithSerial = sorted.map((r: any, index: number) => {
            // If expense is already marked as advance payment, use the stored original serial number
            // This ensures the S.No. matches between records tab and advance payment records page
            const isMarkedAsAdvance = r.custom_fields?.marked_as_advance === true;
            const originalSerialNumber = r.custom_fields?.original_serial_number;
            return {
              ...r,
              serialNumber: isMarkedAsAdvance && originalSerialNumber !== null && originalSerialNumber !== undefined
                ? originalSerialNumber
                : index + 1,
            };
          });

          setRecords(sortedWithSerial);
          setFilteredRecords(sortedWithSerial);
          setEventTitleLookup(eventTitleMap);
          setEventOptions(eventsDataList);
        } catch (bankErr) {
          // If bank details fetch fails, fall back to existing titles and default Unique ID
          const fallback = sortByPaidApprovalTime(
            withTitles.map((r: any) => ({
              ...r,
              unique_id: r.unique_id || "N/A",
            }))
          );
          const fallbackWithSerial = fallback.map((r: any, index: number) => {
            // If expense is already marked as advance payment, use the stored original serial number
            // This ensures the S.No. matches between records tab and advance payment records page
            const isMarkedAsAdvance = r.custom_fields?.marked_as_advance === true;
            const originalSerialNumber = r.custom_fields?.original_serial_number;
            return {
              ...r,
              serialNumber: isMarkedAsAdvance && originalSerialNumber !== null && originalSerialNumber !== undefined
                ? originalSerialNumber
                : index + 1,
            };
          });
          setRecords(fallbackWithSerial);
          setFilteredRecords(fallbackWithSerial);
          setEventTitleLookup(eventTitleMap);
          setEventOptions(eventsDataList);
        }
      } catch (err: any) {
        toast.error("Failed to load records", { description: err.message });
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
  const activeTabRecords = useMemo(() => {
    return records.filter((r: any) => {
      if (activeTab === "all") return true;
      const expected = BANK_STRING_MAP[activeTab];
      return (r.paid_by_bank || "") === expected;
    });
  }, [records, activeTab]);
  const dateOfExpenseOptions = useMemo(() => {
    const uniqueDates = new Set<string>();
    activeTabRecords.forEach((r: any) => {
      const dateOnly = toDateOnly(r.date);
      if (dateOnly) uniqueDates.add(dateOnly);
    });
    return Array.from(uniqueDates).sort((a, b) => a.localeCompare(b));
  }, [activeTabRecords]);
  const paidDateFilterOptions = useMemo(() => {
    const uniqueDates = new Set<string>();
    activeTabRecords.forEach((r: any) => {
      const dateOnly = toDateOnly(r.paid_approval_time);
      if (dateOnly) uniqueDates.add(dateOnly);
    });
    return Array.from(uniqueDates).sort((a, b) => a.localeCompare(b));
  }, [activeTabRecords]);
  const tdsDeductionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          activeTabRecords.map((record: any) =>
            getTdsDeductionOptionValue(record)
          )
        )
      ).sort((a, b) => {
        if (a === "N/A") return 1;
        if (b === "N/A") return -1;
        const [aPercentage, aAmount] = a.split("|");
        const [bPercentage, bAmount] = b.split("|");
        const percentageDiff = Number(aPercentage) - Number(bPercentage);
        if (percentageDiff !== 0) return percentageDiff;
        return Number(aAmount) - Number(bAmount);
      }),
    [activeTabRecords]
  );
  const securityDepositOptions = useMemo(
    () =>
      Array.from(
        new Set(
          activeTabRecords.map((record: any) =>
            hasSecurityDeposit(record)
              ? String(getSecurityDepositAmount(record))
              : "N/A"
          )
        )
      ).sort((a, b) => {
        if (a === "N/A") return 1;
        if (b === "N/A") return -1;
        return Number(a) - Number(b);
      }),
    [activeTabRecords]
  );
  const paidByBankOptions = Array.from(
    new Set(records.map((r: any) => r.paid_by_bank).filter(Boolean))
  );
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

  const applyFilters = () => {
    const fr = records.filter((r: any) => {
      // Bank tab filtering via expense_new.paid_by_bank
      if (activeTab !== "all") {
        const expected = BANK_STRING_MAP[activeTab];
        if ((r.paid_by_bank || "") !== expected) return false;
      }
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
      if (filters.bills !== "All Bills") {
        if (filters.bills === "Receipt" && !r.receipt) return false;
        if (filters.bills === "Voucher" && !r.hasVoucher) return false;
      }
      if (filters.paidByBank !== "All Banks") {
        const paidByBank = (r.paid_by_bank || "").trim();
        if (filters.paidByBank === "No Bank Records (Not paid by bank)") {
          if (paidByBank) return false;
        } else if (paidByBank !== filters.paidByBank) {
          return false;
        }
      }
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
      if (!isDateWithinRange(r.date, filters.dateMode, filters.startDate, filters.endDate))
        return false;
      if (
        !isDateWithinRange(
          r.paid_approval_time,
          filters.paidDateMode,
          filters.paidStartDate,
          filters.paidEndDate
        )
      )
        return false;
      const amt = Number(r.approved_amount) || 0;
      if (filters.minAmount !== "" && amt < Number(filters.minAmount))
        return false;
      if (filters.maxAmount !== "" && amt > Number(filters.maxAmount))
        return false;
      const actualAmount = getActualAmount(r);
      if (
        filters.minActualAmount !== "" &&
        (actualAmount === null || actualAmount < Number(filters.minActualAmount))
      ) {
        return false;
      }
      if (
        filters.maxActualAmount !== "" &&
        (actualAmount === null || actualAmount > Number(filters.maxActualAmount))
      ) {
        return false;
      }
      if (
        filters.tdsDeduction !== "All TDS Deductions" &&
        !(
          (filters.tdsDeduction === "N/A" && !hasTdsDeduction(r)) ||
          (filters.tdsDeduction !== "N/A" &&
            filters.tdsDeduction === getTdsDeductionOptionValue(r))
        )
      ) {
        return false;
      }
      const securityDepositAmount = getSecurityDepositAmount(r);
      if (
        filters.securityDeposit !== "All Security Deposits" &&
        !(
          (filters.securityDeposit === "N/A" && !hasSecurityDeposit(r)) ||
          (filters.securityDeposit !== "N/A" &&
            securityDepositAmount === Number(filters.securityDeposit))
        )
      ) {
        return false;
      }

      return true;
    });

    setFilteredRecords(fr);
  };

  // Auto-apply filters when filter values change or when records update
  useEffect(() => {
    // only apply when records are loaded
    if (!loading) applyFilters();
  }, [filters, records, activeTab]);

  // Reset to page 1 when filters change
  useEffect(() => {
    if (!isRestoringViewedExpenseRef.current) {
      pagination.resetPage();
    }
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
      dateMode: "All Dates",
      startDate: "",
      endDate: "",
      paidDateMode: "All Dates",
      paidStartDate: "",
      paidEndDate: "",
      minAmount: "",
      maxAmount: "",
      minActualAmount: "",
      maxActualAmount: "",
      tdsDeduction: "All TDS Deductions",
      securityDeposit: "All Security Deposits",
      paidByBank: "All Banks",
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
    setFilteredRecords(records);
  };

  const sendBackToPaymentProcessing = async () => {
    const id = sendBackModal.id;
    if (!id) return;
    try {
      setSendBackLoading(true);

      const { error } = await supabase
        .from("expense_new")
        .update({ payment_status: "pending" })
        .eq("id", id);

      if (error) throw error;

      setRecords((prev) => prev.filter((r) => r.id !== id));
      setFilteredRecords((prev) => prev.filter((r: any) => r.id !== id));
      toast.success("Sent back to Payment Processing");
      setSendBackModal({ open: false, id: null });
    } catch (err: any) {
      toast.error("Failed to send back", { description: err.message });
    } finally {
      setSendBackLoading(false);
    }
  };

  const markAsAdvancePayment = async () => {
    const id = markAdvanceModal.id;
    if (!id) return;
    try {
      setMarkAdvanceLoading(true);

      // Get the current record
      const record = records.find((r) => r.id === id);
      if (!record) {
        toast.error("Record not found");
        return;
      }

      // Keep the original unique_id - DO NOT change it
      // Only add a flag in custom_fields to mark this as advance payment
      // Store the original serial number so it can be displayed on the Advance Payment Records page
      const currentCustomFields = record.custom_fields || {};
      const originalSerialNumber = record.serialNumber || null;
      const updatedCustomFields = {
        ...currentCustomFields,
        marked_as_advance: true,
        marked_as_advance_at: new Date().toISOString(),
        original_serial_number: originalSerialNumber, // Store the original S.No. from records tab
      };

      const { error } = await supabase
        .from("expense_new")
        .update({
          custom_fields: updatedCustomFields,
        })
        .eq("id", id);

      if (error) throw error;

      // Update local state with the marked_as_advance flag
      const updateList = (list: any[]) =>
        list.map((r: any) =>
          r.id === id ? { ...r, custom_fields: updatedCustomFields } : r
        );

      setRecords((prev) => updateList(prev));
      setFilteredRecords((prev) => updateList(prev));
      toast.success("Marked as Advance Payment");
      setMarkAdvanceModal({ open: false, id: null });
    } catch (err: any) {
      toast.error("Failed to mark as advance payment", {
        description: err.message,
      });
    } finally {
      setMarkAdvanceLoading(false);
    }
  };

  const openEditModal = (record: any) => {
    setEditForm({
      expense_type: record.expense_type || "",
      event_id: record.event_id || "",
      location: record.location || "",
      amount:
        record.amount !== undefined
          ? String(record.amount)
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

    const parsedAmount = Number(editForm.amount);
    if (
      editForm.amount !== "" &&
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
        editForm.amount === ""
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
    const formatExportDateForName = (dateValue?: string) => {
      if (!dateValue) return "";
      const [year, month, day] = dateValue.split("-");
      if (!year || !month || !day) return dateValue;
      return `${day}-${month}-${year}`;
    };

    const getExportFileBaseName = () => {
      const bankLabel = exportBankType
        ? exportBankType === "NGIDFC Current"
          ? "NG Records"
          : exportBankType === "FCIDFC Current"
            ? "FC Records"
            : exportBankType === "ALL_RECORDS"
              ? "All Records"
              : exportBankType === "NO_BANK"
                ? "No Bank Records"
                : "KOTAK Records"
        : "All Records";

      const segments: string[] = [bankLabel];

      if (exportRangeLabel) {
        segments.push(exportRangeLabel);
      }

      if (exportLocationFilter !== "All Locations") {
        segments.push(`Project_of_expense_${exportLocationFilter}`);
      }

      if (exportDateFilters.expenseDateMode !== "All Dates") {
        const dateLabel = "Date-of-Expense";
        const monthlyLabel =
          exportRangeLabel === "Monthly" &&
            exportDateFilters.expenseDateMode === "Custom Date"
            ? getMonthYearLabelForDateRange(
              exportDateFilters.expenseStartDate,
              exportDateFilters.expenseEndDate
            )
            : null;
        const formattedRange = `${formatExportDateForName(
          exportDateFilters.expenseStartDate
        )}_to_${formatExportDateForName(exportDateFilters.expenseEndDate)}`;
        const dateValue =
          monthlyLabel
            ? monthlyLabel
            :
            (exportDateFilters.expenseDateMode === "Single Date"
              ? formatExportDateForName(exportDateFilters.expenseStartDate)
              : formattedRange);
        segments.push(`${dateLabel}_${dateValue}`);
      }

      if (exportDateFilters.paidDateMode !== "All Dates") {
        const dateLabel = "Paid-Date";
        const dateValue =
          exportDateFilters.paidDateMode === "Single Date"
            ? formatExportDateForName(exportDateFilters.paidStartDate)
            : `${formatExportDateForName(
              exportDateFilters.paidStartDate
            )}_to_${formatExportDateForName(exportDateFilters.paidEndDate)}`;
        segments.push(`${dateLabel}_${dateValue}`);
      }

      if (segments.length === 1) {
        segments.push("All-Dates");
      }

      return segments.join("_");
    };

    if (exportBankType === "ALL_RECORDS") {
      const { headers, rows } = getAllRecordsTableExportData();
      const csvRows: string[] = [];
      csvRows.push(headers.map((h) => `"${h}"`).join(","));
      csvRows.push(
        ...rows.map((row: Array<string | number>) =>
          row
            .map((cell: string | number) =>
              `"${String(cell).replace(/"/g, '""')}"`
            )
            .join(",")
        )
      );
      const csvContent = csvRows.join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `${getExportFileBaseName()}.csv`);
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    const isKotakExport = exportBankType === "KOTAK";
    const bankRefNoMap = exportBankType && exportBankType !== "NO_BANK"
      ? new Map(
        filteredRecords
          .filter((record) => (record.paid_by_bank || "") === exportBankType)
          .map((record, idx) => [record.id, idx + 1])
      )
      : null;
    const headers = isKotakExport
      ? [
        "Voucher Date",
        "Voucher Type Name",
        "Voucher Number",
        "Ledger Name",
        "Ledger Amount",
        "Ledger Amount Dr/Cr",
        "Voucher Narration",
        "Category Name",
        "Cost Allocation for - Cost Center",
        "Cost Allocation for - Amount",
      ]
      : [
        "Voucher Date",
        "Voucher Type Name",
        "Voucher Number",
        "Ledger Name",
        "Ledger Amount",
        "Ledger Amount Dr/Cr",
        "Voucher Narration",
        "Category Name",
        "Cost Allocation for - Cost Center",
        "Cost Allocation for - Amount",
      ];

    const exportRecords = getExportRecords();

    const formatAmountValue = (value: number | null | undefined) => {
      if (value === null || value === undefined || isNaN(Number(value))) return "";
      return Number(value).toFixed(2);
    };

    const rows = exportRecords.flatMap((record, index) => {
      const baseAmount = getBaseAmount(record);
      const tdsAmount = getTdsAmount(record);
      const securityDepositAmount = getSecurityDepositAmount(record);
      const actualAmount = getActualAmount(record);
      const beneficiaryName =
        record.beneficiary_name ||
        record.creator_name ||
        record.creator?.full_name ||
        record.creator_email ||
        "N/A";
      const expenseCreditPerson =
        record.expense_credit_person ||
        getCustomFieldValue(record.custom_fields, "expense_credit_person") ||
        "N/A";
      const tdsPercent = record.tds_deduction_percentage;
      const tdsLine =
        tdsAmount !== null || tdsPercent
          ? `TDS${tdsPercent ? ` ${tdsPercent}%` : ""}`
          : "";

      if (isKotakExport) {
        const voucherDate = formatKotakVoucherDate(record.paid_approval_time);
        const serialNumber = record.serialNumber ?? index + 1;
        const refNo = bankRefNoMap?.get(record.id) ?? serialNumber;
        const narration = `Being paid to for ${expenseCreditPerson} PD Row no. - ${serialNumber} & REF NO. - ${refNo}`;
        const ledgerAmount = formatAmountValue(actualAmount ?? baseAmount);

        return [
          [
            voucherDate,
            "Expense Kotak",
            "",
            record.expense_type || "—",
            ledgerAmount,
            "Dr",
            narration,
            "Project",
            record.location || "N/A",
            ledgerAmount,
          ],
          [
            "",
            "",
            "",
            expenseCreditPerson,
            ledgerAmount,
            "Cr",
            "",
            "",
            "",
            "",
          ],
        ];
      }

      const voucherDate = record.paid_approval_time
        ? formatKotakVoucherDate(record.paid_approval_time)
        : "—";
      const serialNumber = record.serialNumber ?? index + 1;
      const refNo =
        exportBankType === "NO_BANK"
          ? "N/A"
          : bankRefNoMap?.get(record.id) ?? serialNumber;
      const narration = `Being paid to for ${beneficiaryName} PD Row no. - ${serialNumber} & REF NO. - ${refNo}`;

      const voucherTypeName = exportBankType === "NGIDFC Current"
        ? "Expense IDFC"
        : exportBankType === "FCIDFC Current"
          ? "Expense SBI FC"
          : "Expense";

      const rowsForRecord: any[] = [
        [
          voucherDate,
          voucherTypeName,
          "",
          record.expense_type || "—",
          formatAmountValue(baseAmount),
          "Dr",
          narration,
          "Project",
          record.location || "N/A",
          formatAmountValue(baseAmount),
        ],
        [
          "",
          "",
          "",
          beneficiaryName,
          formatAmountValue(actualAmount ?? baseAmount),
          "Cr",
          "",
          "",
          "",
          "",
        ],
      ];

      if (tdsLine && tdsAmount !== null) {
        rowsForRecord.push([
          "",
          "",
          "",
          tdsLine,
          formatAmountValue(tdsAmount),
          "Cr",
          "",
          "",
          "",
          "",
        ]);
      }

      if (securityDepositAmount !== null) {
        rowsForRecord.push([
          "",
          "",
          "",
          "Security Deposit",
          formatAmountValue(securityDepositAmount),
          "Cr",
          "",
          "",
          "",
          "",
        ]);
      }

      return rowsForRecord;
    });

    const csvRows: string[] = [];
    csvRows.push(headers.map((h) => `"${h}"`).join(","));
    csvRows.push(
      ...rows.map((row: Array<string | number>) =>
        row
          .map((cell: string | number) =>
            `"${String(cell).replace(/"/g, '""')}"`
          )
          .join(",")
      )
    );
    const csvContent = csvRows.join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${getExportFileBaseName()}.csv`);
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToXLSX = () => {
    const formatExportDateForName = (dateValue?: string) => {
      if (!dateValue) return "";
      const [year, month, day] = dateValue.split("-");
      if (!year || !month || !day) return dateValue;
      return `${day}-${month}-${year}`;
    };

    const getExportFileBaseName = () => {
      const bankLabel = exportBankType
        ? exportBankType === "NGIDFC Current"
          ? "NG Records"
          : exportBankType === "FCIDFC Current"
            ? "FC Records"
            : exportBankType === "ALL_RECORDS"
              ? "All Records"
              : exportBankType === "NO_BANK"
                ? "No Bank Records"
                : "KOTAK Records"
        : "All Records";

      const segments: string[] = [bankLabel];

      if (exportRangeLabel) {
        segments.push(exportRangeLabel);
      }

      if (exportLocationFilter !== "All Locations") {
        segments.push(`Project_of_expense_${exportLocationFilter}`);
      }

      if (exportDateFilters.expenseDateMode !== "All Dates") {
        const dateLabel = "Date-of-Expense";
        const monthlyLabel =
          exportRangeLabel === "Monthly" &&
            exportDateFilters.expenseDateMode === "Custom Date"
            ? getMonthYearLabelForDateRange(
              exportDateFilters.expenseStartDate,
              exportDateFilters.expenseEndDate
            )
            : null;
        const formattedRange = `${formatExportDateForName(
          exportDateFilters.expenseStartDate
        )}_to_${formatExportDateForName(exportDateFilters.expenseEndDate)}`;
        const dateValue =
          monthlyLabel
            ? monthlyLabel
            :
            (exportDateFilters.expenseDateMode === "Single Date"
              ? formatExportDateForName(exportDateFilters.expenseStartDate)
              : formattedRange);
        segments.push(`${dateLabel}_${dateValue}`);
      }

      if (exportDateFilters.paidDateMode !== "All Dates") {
        const dateLabel = "Paid-Date";
        const dateValue =
          exportDateFilters.paidDateMode === "Single Date"
            ? formatExportDateForName(exportDateFilters.paidStartDate)
            : `${formatExportDateForName(
              exportDateFilters.paidStartDate
            )}_to_${formatExportDateForName(exportDateFilters.paidEndDate)}`;
        segments.push(`${dateLabel}_${dateValue}`);
      }

      if (segments.length === 1) {
        segments.push("All-Dates");
      }

      return segments.join("_");
    };

    if (exportBankType === "ALL_RECORDS") {
      const { headers, rows } = getAllRecordsTableExportData();
      const data = [headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(data);

      const minWidth = 12;
      const maxWidth = 80;
      const padding = 2;

      ws["!cols"] = headers.map((_, colIndex) => {
        const maxLen = data.reduce((acc, row) => {
          const cellValue = row?.[colIndex];
          const cellText = cellValue === null || cellValue === undefined ? "" : String(cellValue);
          return Math.max(acc, cellText.length);
        }, 0);

        const width = Math.min(Math.max(maxLen + padding, minWidth), maxWidth);
        return { wch: width };
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "All Records");

      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${getExportFileBaseName()}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }

    const isKotakExport = exportBankType === "KOTAK";
    const bankRefNoMap = exportBankType && exportBankType !== "NO_BANK"
      ? new Map(
        filteredRecords
          .filter((record) => (record.paid_by_bank || "") === exportBankType)
          .map((record, idx) => [record.id, idx + 1])
      )
      : null;
    const headers = isKotakExport
      ? [
        "Voucher Date",
        "Voucher Type Name",
        "Voucher Number",
        "Ledger Name",
        "Ledger Amount",
        "Ledger Amount Dr/Cr",
        "Voucher Narration",
        "Category Name",
        "Cost Allocation for - Cost Center",
        "Cost Allocation for - Amount",
      ]
      : [
        "Voucher Date",
        "Voucher Type Name",
        "Voucher Number",
        "Ledger Name",
        "Ledger Amount",
        "Ledger Amount Dr/Cr",
        "Voucher Narration",
        "Category Name",
        "Cost Allocation for - Cost Center",
        "Cost Allocation for - Amount",
      ];

    const exportRecords = getExportRecords();

    const formatAmountValue = (value: number | null | undefined) => {
      if (value === null || value === undefined || isNaN(Number(value))) return "";
      return Number(value).toFixed(2);
    };

    const rows = exportRecords.flatMap((record, index) => {
      const baseAmount = getBaseAmount(record);
      const tdsAmount = getTdsAmount(record);
      const securityDepositAmount = getSecurityDepositAmount(record);
      const actualAmount = getActualAmount(record);
      const beneficiaryName =
        record.beneficiary_name ||
        record.creator_name ||
        record.creator?.full_name ||
        record.creator_email ||
        "N/A";
      const expenseCreditPerson =
        record.expense_credit_person ||
        getCustomFieldValue(record.custom_fields, "expense_credit_person") ||
        "N/A";
      const tdsPercent = record.tds_deduction_percentage;
      const tdsLine =
        tdsAmount !== null || tdsPercent
          ? `TDS${tdsPercent ? ` ${tdsPercent}%` : ""}`
          : "";

      if (isKotakExport) {
        const voucherDate = formatKotakVoucherDate(record.paid_approval_time);
        const serialNumber = record.serialNumber ?? index + 1;
        const refNo = bankRefNoMap?.get(record.id) ?? serialNumber;
        const narration = `Being paid to for ${expenseCreditPerson} PD Row no. - ${serialNumber} & REF NO. - ${refNo}`;
        const ledgerAmount = formatAmountValue(actualAmount ?? baseAmount);

        return [
          [
            voucherDate,
            "Expense Kotak",
            "",
            record.expense_type || "—",
            ledgerAmount,
            "Dr",
            narration,
            "Project",
            record.location || "N/A",
            ledgerAmount,
          ],
          [
            "",
            "",
            "",
            expenseCreditPerson,
            ledgerAmount,
            "Cr",
            "",
            "",
            "",
            "",
          ],
        ];
      }

      const voucherDate = record.paid_approval_time
        ? formatKotakVoucherDate(record.paid_approval_time)
        : "—";
      const serialNumber = record.serialNumber ?? index + 1;
      const refNo =
        exportBankType === "NO_BANK"
          ? "N/A"
          : bankRefNoMap?.get(record.id) ?? serialNumber;
      const narration = `Being paid to for ${beneficiaryName} PD Row no. - ${serialNumber} & REF NO. - ${refNo}`;

      const voucherTypeName = exportBankType === "NGIDFC Current"
        ? "Expense IDFC"
        : exportBankType === "FCIDFC Current"
          ? "Expense SBI FC"
          : "Expense";

      const rowsForRecord: any[] = [
        [
          voucherDate,
          voucherTypeName,
          "",
          record.expense_type || "—",
          formatAmountValue(baseAmount),
          "Dr",
          narration,
          "Project",
          record.location || "N/A",
          formatAmountValue(baseAmount),
        ],
        [
          "",
          "",
          "",
          beneficiaryName,
          formatAmountValue(actualAmount ?? baseAmount),
          "Cr",
          "",
          "",
          "",
          "",
        ],
      ];

      if (tdsLine && tdsAmount !== null) {
        rowsForRecord.push([
          "",
          "",
          "",
          tdsLine,
          formatAmountValue(tdsAmount),
          "Cr",
          "",
          "",
          "",
          "",
        ]);
      }

      if (securityDepositAmount !== null) {
        rowsForRecord.push([
          "",
          "",
          "",
          "Security Deposit",
          formatAmountValue(securityDepositAmount),
          "Cr",
          "",
          "",
          "",
          "",
        ]);
      }

      return rowsForRecord;
    });

    const data = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);

    const minWidth = 12;
    const maxWidth = 80;
    const padding = 2;

    ws["!cols"] = headers.map((_, colIndex) => {
      const maxLen = data.reduce((acc, row) => {
        const cellValue = row?.[colIndex];
        const cellText = cellValue === null || cellValue === undefined ? "" : String(cellValue);
        return Math.max(acc, cellText.length);
      }, 0);

      const width = Math.min(Math.max(maxLen + padding, minWidth), maxWidth);
      return { wch: width };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payment Records");

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${getExportFileBaseName()}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportXLSX = () => {
    exportToXLSX();
    setShowFormatModal(false);
  };

  const handleExportCSV = () => {
    exportToCSV();
    setShowFormatModal(false);
  };

  const handleQuickExportConfirm = () => {
    if (!quickExportDate) return;

    let startDate: Date;
    let endDate: Date;

    if (quickExportMode === "weekly") {
      const [startStr, endStr] = quickExportDate.split("|");
      if (!startStr || !endStr) return;
      startDate = new Date(startStr);
      endDate = new Date(endStr);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return;
    } else {
      const [yearStr, monthStr] = quickExportDate.split("-");
      if (!yearStr || !monthStr) return;
      const year = Number(yearStr);
      const monthIndex = Number(monthStr) - 1;
      if (Number.isNaN(year) || Number.isNaN(monthIndex)) return;
      startDate = new Date(year, monthIndex, 1);
      endDate = new Date(year, monthIndex + 1, 0);
    }

    // Set export bank type based on the currently active tab
    if (activeTab === "all") {
      setExportBankType("ALL_RECORDS");
    } else {
      setExportBankType(BANK_STRING_MAP[activeTab as "ngidfc" | "fcidfc" | "kotak"]);
    }

    // Label for file name based on quick export type
    setExportRangeLabel(quickExportMode === "weekly" ? "Weekly" : "Monthly");
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
    setShowExportModal(false);
    setShowExportDateModal(false);
    setShowFormatModal(true);
  };

  const handleExportDateNext = () => {
    if (!validateExportDateFilters()) return;
    setShowExportDateModal(false);
    setShowFormatModal(true);
  };

  return (
    <div className="space-y-4">

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Bank Tabs */}
        <div className="w-full overflow-x-auto lg:w-auto">
          <Tabs value={activeTab} onValueChange={(v) => handleBankTabChange(v as any)}>
            <TabsList className="w-max min-w-max">
              <TabsTrigger value="all" className="cursor-pointer">All Records</TabsTrigger>
              <TabsTrigger value="ngidfc" className="cursor-pointer">NG Records</TabsTrigger>
              <TabsTrigger value="fcidfc" className="cursor-pointer">FC Records</TabsTrigger>
              <TabsTrigger value="kotak" className="cursor-pointer">KOTAK Records</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex w-full flex-wrap gap-2 lg:w-auto">
          <Button
            onClick={() => {
              setExportRangeLabel("");
              setExportLocationFilter("All Locations");
              setShowExportModal(true);
            }}
            className="w-full sm:w-auto flex items-center gap-2 cursor-pointer text-sm"
            variant="outline"
          >
            <Download className="w-4 h-4" />
            Export Data
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
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => setFilterOpen((s) => !s)}>
            <Filter className="mr-2 h-4 w-4" />
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
                <SelectTrigger className="mt-1 w-full bg-gray-50 dark:bg-gray-800">
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

            <div className="col-span-3 sm:col-span-1">
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
            </div>

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

            {paidByBankOptions.length > 0 && (
              <div className="col-span-3 sm:col-span-1">
                <label className="text-sm font-medium">Paid by bank</label>
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
                    <SelectItem value="No Bank Records (Not paid by bank)">
                      No Bank Records (Not paid by bank)
                    </SelectItem>
                    {paidByBankOptions
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

              {/* Conditional inputs shown below the Date of expense selector */}
              <div className="mt-2">
                {filters.dateMode === "Single Date" ? (
                  <>
                    <label className="text-sm font-medium">Select Date of expense</label>
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
                        <SelectValue placeholder="Select Date of expense" />
                      </SelectTrigger>
                      <SelectContent
                        searchPlaceholder="Search date..."
                        searchValue={searchQuery.startDate}
                        onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, startDate: v }))}
                      >
                        <SelectItem value="none">Select Date of expense</SelectItem>
                        {dateOfExpenseOptions
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
                    <label className="text-sm font-medium">Select Paid date</label>
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
                        <SelectValue placeholder="Select Paid date" />
                      </SelectTrigger>
                      <SelectContent
                        searchPlaceholder="Search date..."
                        searchValue={searchQuery.paidStartDate}
                        onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, paidStartDate: v }))}
                      >
                        <SelectItem value="none">Select Paid date</SelectItem>
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
                    .map((option) => (
                    <SelectItem key={option} value={option}>
                      {formatTdsDeductionOptionLabel(option)}
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
                    .map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "N/A" ? "N/A" : formatCurrency(Number(option))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-3 sm:col-span-1">
              <label className="text-sm font-medium">Amount Range</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={0}
                  placeholder="Min"
                  className="w-full border rounded px-3 py-2"
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
                  min={0}
                  placeholder="Max"
                  className="w-full border rounded px-3 py-2"
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
                  min={0}
                  placeholder="Min"
                  className="w-full border rounded px-3 py-2"
                  value={filters.minActualAmount}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      minActualAmount: e.target.value,
                    }))
                  }
                />
                <input
                  type="number"
                  min={0}
                  placeholder="Max"
                  className="w-full border rounded px-3 py-2"
                  value={filters.maxActualAmount}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      maxActualAmount: e.target.value,
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

      <div className="rounded-md border shadow-sm bg-white max-h-[100vh] overflow-x-auto overflow-y-auto">
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
              <TableHead className="text-center py-3">Advance Payment</TableHead>
              <TableHead className="text-center py-3">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableSkeleton colSpan={20} rows={5} />
            ) : filteredRecords.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={20}
                  className="text-center py-6 text-gray-500"
                >
                  No payment records found.
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
                    {activeTab === "all" ? (record.serialNumber ?? pagination.getItemNumber(index)) : pagination.getItemNumber(index)}
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
                    ₹{record.amount}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    {(() => {
                      const tdsPercent = record.tds_deduction_percentage;
                      const tdsAmount = getTdsAmount(record);

                      if (tdsPercent) {
                        return (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-sm">{tdsPercent}%</span>
                            <span className="text-xs text-muted-foreground">
                              {tdsAmount !== null
                                ? formatCurrency(tdsAmount)
                                : "—"}
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
                      const securityDepositAmount =
                        getSecurityDepositAmount(record);
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
                            `/org/${slug}/expenses/${record.id}/voucher?from=records`
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
                    {(() => {
                      const hasAdvancePrefix =
                        record.unique_id?.toLowerCase().startsWith("advance_") ||
                        record.unique_id?.startsWith("Advance_");
                      const isMarkedAsAdvance = record.custom_fields?.marked_as_advance === true;
                      const isAdvance = isMarkedAsAdvance || hasAdvancePrefix;

                      if (isAdvance) {
                        // If marked as advance (green button) or has advance prefix but not marked (blue button)
                        return (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="inline-flex">
                                  <Button
                                    size="sm"
                                    variant={isMarkedAsAdvance ? "outline" : "default"}
                                    onClick={() =>
                                      setMarkAdvanceModal({ open: true, id: record.id })
                                    }
                                    disabled={isMarkedAsAdvance}
                                    className={`flex items-center gap-2 ${isMarkedAsAdvance
                                        ? "border border-gray-300 text-green-600 bg-gray-100 cursor-not-allowed"
                                        : "cursor-pointer border border-gray-300 bg-white text-black hover:bg-gray-100"
                                      }`}
                                  >
                                    {isMarkedAsAdvance && <CheckCircle className="w-5 h-5 " />}
                                    {isMarkedAsAdvance ? "Mark as Advance" : "Mark as Advance"}
                                  </Button>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  {isMarkedAsAdvance ? "Added on Advance Payment" : "Mark as Advance"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      }

                      return (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="inline-flex">
                                <Select
                                  value={"regular"}
                                  onValueChange={(val) => {
                                    if (val === "advance") {
                                      setMarkAdvanceModal({ open: true, id: record.id });
                                    }
                                  }}
                                >
                                  <SelectTrigger size="sm" className="w-40">
                                    <SelectValue placeholder="Regular Payment" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="regular">Regular Payment</SelectItem>
                                    <SelectItem value="advance">Mark as Advance</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Mark as Advance Payment</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-center py-2">
                    <div className="flex items-center justify-center gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const params = new URLSearchParams();
                                params.set("activeTab", activeTab);
                                params.set("page", String(pagination.currentPage));
                                router.push(
                                  `/org/${slug}/finance/records/${record.id}?${params.toString()}`
                                );
                              }}
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
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setSendBackModal({ open: true, id: record.id })
                              }
                              className="flex items-center gap-2 border border-gray-300 text-black cursor-pointer"
                            >
                              <Undo2 className="w-4 h-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Back to Payment Processing</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDeleteModal({ open: true, id: record.id })
                        }
                        className="flex items-center gap-2 border border-gray-300 hover:bg-red-100 text-red-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
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
          itemsPerPage={RECORDS_PER_PAGE}
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
            <DialogTitle>Edit payment record</DialogTitle>
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
                <label className="text-sm font-medium">Project of Expense</label>
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
                  value={editForm.amount}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      amount: e.target.value,
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

      {/* Send back to Payment Processing modal */}
      <Dialog
        open={sendBackModal.open}
        onOpenChange={() => setSendBackModal({ open: false, id: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send back to Payment Processing</DialogTitle>
          </DialogHeader>
          <div>
            <p>
              Move this record back to Payment Processing? It will be removed
              from Payment Records.
            </p>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setSendBackModal({ open: false, id: null })}
              className="cursor-pointer"
              disabled={sendBackLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={sendBackToPaymentProcessing}
              className="cursor-pointer"
              disabled={sendBackLoading}
            >
              {sendBackLoading ? "Sending..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Advance Payment modal */}
      <Dialog
        open={markAdvanceModal.open}
        onOpenChange={() => setMarkAdvanceModal({ open: false, id: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Advance Payment</DialogTitle>
          </DialogHeader>
          <div>
            <p>
              Are you sure you want to mark this expense as an advance payment?
            </p>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setMarkAdvanceModal({ open: false, id: null })}
              className="cursor-pointer"
              disabled={markAdvanceLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={markAsAdvancePayment}
              className="cursor-pointer"
              disabled={markAdvanceLoading}
            >
              {markAdvanceLoading ? "Marking..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation modal */}
      <Dialog
        open={deleteModal.open}
        onOpenChange={() => setDeleteModal({ open: false, id: null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Payment Record</DialogTitle>
          </DialogHeader>
          <div>
            <p>
              Are you sure you want to delete this payment record? This action
              cannot be undone.
            </p>
          </div>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setDeleteModal({ open: false, id: null })}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const id = deleteModal.id;
                if (!id) return;
                try {
                  // Mark the record as removed so it doesn't reappear in Payment Processing
                  const { error } = await supabase
                    .from("expense_new")
                    .update({ payment_status: "removed" })
                    .eq("id", id);

                  if (error) throw error;

                  // Remove from local UI list
                  setRecords((prev) => prev.filter((r) => r.id !== id));
                  setFilteredRecords((prev) =>
                    prev.filter((r: any) => r.id !== id)
                  );
                  toast.success("Record removed from Payment Records");
                } catch (err: any) {
                  toast.error("Failed to remove record", {
                    description: err.message,
                  });
                } finally {
                  setDeleteModal({ open: false, id: null });
                }
              }}
              className="cursor-pointer"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Modal - Bank Type Selection */}
      <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Records to Export</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="export-all-records"
                checked={exportBankType === "ALL_RECORDS"}
                onCheckedChange={(checked) =>
                  setExportBankType(checked ? "ALL_RECORDS" : "")
                }
              />
              <label htmlFor="export-all-records" className="text-sm font-medium cursor-pointer">
                All Records
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="export-ng"
                checked={exportBankType === "NGIDFC Current"}
                onCheckedChange={(checked) =>
                  setExportBankType(checked ? "NGIDFC Current" : "")
                }
              />
              <label htmlFor="export-ng" className="text-sm font-medium cursor-pointer">
                NG Records (NGIDFC Current)
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="export-fc"
                checked={exportBankType === "FCIDFC Current"}
                onCheckedChange={(checked) =>
                  setExportBankType(checked ? "FCIDFC Current" : "")
                }
              />
              <label htmlFor="export-fc" className="text-sm font-medium cursor-pointer">
                FC Records (FCIDFC Current)
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="export-kotak"
                checked={exportBankType === "KOTAK"}
                onCheckedChange={(checked) =>
                  setExportBankType(checked ? "KOTAK" : "")
                }
              />
              <label htmlFor="export-kotak" className="text-sm font-medium cursor-pointer">
                KOTAK Records
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="export-no-bank"
                checked={exportBankType === "NO_BANK"}
                onCheckedChange={(checked) =>
                  setExportBankType(checked ? "NO_BANK" : "")
                }
              />
              <label htmlFor="export-no-bank" className="text-sm font-medium cursor-pointer">
                No Bank Records (Not paid by bank)
              </label>
            </div>
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
              disabled={!exportBankType}
              className="cursor-pointer"
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
                setShowExportModal(true);
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
              onClick={handleExportDateNext}
              className="cursor-pointer"
            >
              Next
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
    </div>
  );
}