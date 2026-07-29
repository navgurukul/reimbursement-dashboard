"use client";

import { useOrgStore } from "@/store/useOrgStore";
import { expenses } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import supabase from "@/lib/supabase";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useEffect, useMemo, useState, useRef } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Eye, Download, Pencil, Save, Filter } from "lucide-react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { auth, profiles } from "@/lib/db";

import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { ExpenseStatusBadge } from "@/components/ExpenseStatusBadge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Pagination, usePagination } from "@/components/pagination";

const formatCurrency = (amount: number) => {
  if (isNaN(amount) || amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);
};

const calculateTdsAmount = (
  baseAmount: number | null | undefined,
  percentage: number | null | undefined
) => {
  if (!percentage || !baseAmount) return null;
  const amount = (baseAmount * percentage) / 100;
  return Number(amount.toFixed(2));
};

const calculateActualAmount = (
  baseAmount: number | null | undefined,
  tdsAmount: number | null | undefined,
  securityDepositAmount: number | null | undefined
) => {
  if (baseAmount === null || baseAmount === undefined) return null;
  const amount =
    Number(baseAmount) - (tdsAmount ?? 0) - (securityDepositAmount ?? 0);
  return Number(amount.toFixed(2));
};

const isDirectPaymentUniqueId = (value: unknown) =>
  String(value || "").trim().toLowerCase().includes("direct payment");

const hasValue = (value: unknown) =>
  value !== null && value !== undefined && value !== "";

export default function PaymentProcessingOnly() {
  const { organization } = useOrgStore();
  const orgId = organization?.id;
  const params = useParams();
  const slug = params?.slug as string;
  const [processingExpenses, setProcessingExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // const [editingFields, setEditingFields] = useState<Record<string, { remarks: boolean; debit: boolean }>>({});
  const [editingFields, setEditingFields] = useState<
    Record<string, { utr?: boolean; debit?: boolean }>
  >({});
  const [paidByBank, setPaidByBank] = useState<Record<string, string>>({});
  const [showConfirmAllPaid, setShowConfirmAllPaid] = useState(false);
  const [confirmExpenseId, setConfirmExpenseId] = useState<string | null>(null);
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState({
    expenseType: "",
    createdBy: "",
    email: "",
    eventName: "",
    location: "",
    approvedBy: "",
    uniqueId: "",
    tdsDeduction: "",
    securityDeposit: "",
  });
  const [filters, setFilters] = useState({
    expenseType: "All Expense Type",
    createdBy: "All Creators",
    email: "All Emails",
    eventName: "All Events",
    location: "All Locations",
    approvedBy: "All Approvers",
    uniqueId: "All Unique IDs",
    minAmount: "",
    maxAmount: "",
    tdsDeduction: "All TDS Deductions",
    securityDeposit: "All Security Deposits",
    minActualAmount: "",
    maxActualAmount: "",
  });

  const router = useRouter();

  const [showExportModal, setShowExportModal] = useState(false);
  const [showColumnsModal, setShowColumnsModal] = useState(false);
  const [showFormatModal, setShowFormatModal] = useState(false);
  const [selectedBankType, setSelectedBankType] = useState<"NGIDFC" | "FCIDCF" | "KOTAK" | "">("");

  const allColumns = [
    "beneficiary name",
    "Beneficiary Account Number",
    "IFSC",
    "Transaction Type",
    "Debit Account No.",
    "Transaction Date",
    "Amount",
    "Currency",
    "Beneficiary Email ID",
    "Remark",
  ];
  const [selectedColumns, setSelectedColumns] = useState<string[]>([
    ...allColumns,
  ]);

  const ADMIN_PASSWORD = "admin"; // your password

  const [passwordModal, setPasswordModal] = useState({
    open: false,
    expenseId: null as null | string,
  });
  const [enteredPassword, setEnteredPassword] = useState("");
  const [isPasswordVerified, setIsPasswordVerified] = useState(false);
  
  const searchParams = useSearchParams();
  const [highlightedExpenseId, setHighlightedExpenseId] = useState<string | null>(null);
  const highlightedRowRef = useRef<HTMLTableRowElement>(null);

  const getBaseAmount = (expense: any) =>
    Number(expense.approved_amount ?? expense.amount ?? 0);

  const getTdsDeductionAmount = (expense: any) => {
    const storedAmount = expense.tds_deduction_amount;
    if (storedAmount !== null && storedAmount !== undefined && storedAmount !== "") {
      return Number(storedAmount);
    }

    const percentage = Number(expense.tds_deduction_percentage ?? 0);
    if (!percentage) return 0;

    return calculateTdsAmount(getBaseAmount(expense), percentage) ?? 0;
  };

  const getSecurityDepositAmount = (expense: any) => {
    if (
      expense.security_deposit_amount === null ||
      expense.security_deposit_amount === undefined ||
      expense.security_deposit_amount === ""
    ) {
      return 0;
    }

    return Number(expense.security_deposit_amount);
  };

  const getStoredActualAmount = (expense: any) => {
    if (
      expense.actual_amount === null ||
      expense.actual_amount === undefined ||
      expense.actual_amount === ""
    ) {
      return null;
    }

    return Number(expense.actual_amount);
  };

  const hasTdsDeduction = (expense: any) => {
    const storedAmount = expense.tds_deduction_amount;
    if (storedAmount !== null && storedAmount !== undefined && storedAmount !== "") {
      return true;
    }
    return Number(expense.tds_deduction_percentage ?? 0) > 0;
  };

  const getTdsDeductionPercentage = (expense: any) =>
    Number(expense.tds_deduction_percentage ?? 0);

  const getTdsDeductionOptionValue = (expense: any) => {
    if (!hasTdsDeduction(expense)) return "N/A";

    const percentage = getTdsDeductionPercentage(expense);
    const amount = getTdsDeductionAmount(expense);
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

  const hasSecurityDeposit = (expense: any) =>
    !(
      expense.security_deposit_amount === null ||
      expense.security_deposit_amount === undefined ||
      expense.security_deposit_amount === ""
    );

  const getActualAmountValue = (expense: any) => {
    const storedActualAmount = getStoredActualAmount(expense);
    if (storedActualAmount !== null) {
      return storedActualAmount;
    }

    const actualAmount = calculateActualAmount(
      expense.amount ?? 0,
      getTdsDeductionAmount(expense),
      getSecurityDepositAmount(expense)
    );

    return actualAmount ?? 0;
  };

  const getExportAmountValue = (expense: any, fallback: string) => {
    const hasApprovedAmount = hasValue(expense.approved_amount);
    const hasRequestedAmount = hasValue(expense.amount);

    if (!hasApprovedAmount && !hasRequestedAmount) {
      return fallback;
    }

    return getActualAmountValue(expense);
  };

  const expenseTypeOptions = useMemo(
    () => Array.from(new Set(processingExpenses.map((e) => e.expense_type).filter(Boolean))),
    [processingExpenses]
  );
  const createdByOptions = useMemo(
    () => Array.from(new Set(processingExpenses.map((e) => e.creator_name).filter(Boolean))),
    [processingExpenses]
  );
  const emailOptions = useMemo(
    () =>
      Array.from(
        new Set(
          processingExpenses
            .map((e) => e.bank_email || e.email)
            .filter(Boolean)
        )
      ),
    [processingExpenses]
  );
  const eventNameOptions = useMemo(
    () => Array.from(new Set(processingExpenses.map((e) => e.event_title).filter(Boolean))),
    [processingExpenses]
  );
  const locationOptions = useMemo(
    () => Array.from(new Set(processingExpenses.map((e) => e.location).filter(Boolean))),
    [processingExpenses]
  );
  const approvedByOptions = useMemo(
    () => Array.from(new Set(processingExpenses.map((e) => e.approver_name).filter(Boolean))),
    [processingExpenses]
  );
  const uniqueIdOptions = useMemo(
    () => Array.from(new Set(processingExpenses.map((e) => e.unique_id).filter(Boolean))),
    [processingExpenses]
  );
  const tdsDeductionOptions = useMemo(
    () =>
      Array.from(
        new Set(
          processingExpenses.map((expense) => getTdsDeductionOptionValue(expense))
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
    [processingExpenses]
  );
  const securityDepositOptions = useMemo(
    () =>
      Array.from(
        new Set(
          processingExpenses.map((expense) =>
            hasSecurityDeposit(expense)
              ? String(getSecurityDepositAmount(expense))
              : "N/A"
          )
        )
      ).sort((a, b) => {
        if (a === "N/A") return 1;
        if (b === "N/A") return -1;
        return Number(a) - Number(b);
      }),
    [processingExpenses]
  );

  const filteredProcessingExpenses = useMemo(() => {
    return processingExpenses.filter((expense) => {
      if (
        filters.expenseType !== "All Expense Type" &&
        (expense.expense_type || "") !== filters.expenseType
      ) {
        return false;
      }

      if (
        filters.createdBy !== "All Creators" &&
        (expense.creator_name || "") !== filters.createdBy
      ) {
        return false;
      }

      if (
        filters.email !== "All Emails" &&
        (expense.bank_email || expense.email || "") !== filters.email
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
        filters.location !== "All Locations" &&
        (expense.location || "") !== filters.location
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
        filters.uniqueId !== "All Unique IDs" &&
        (expense.unique_id || "") !== filters.uniqueId
      ) {
        return false;
      }

      const amount = getBaseAmount(expense);
      if (filters.minAmount !== "" && amount < Number(filters.minAmount)) return false;
      if (filters.maxAmount !== "" && amount > Number(filters.maxAmount)) return false;

      const tdsDeduction = getTdsDeductionAmount(expense);
      if (
        filters.tdsDeduction !== "All TDS Deductions" &&
        !(
          (filters.tdsDeduction === "N/A" && !hasTdsDeduction(expense)) ||
          (filters.tdsDeduction !== "N/A" &&
            filters.tdsDeduction === getTdsDeductionOptionValue(expense))
        )
      ) {
        return false;
      }

      const securityDeposit = getSecurityDepositAmount(expense);
      if (
        filters.securityDeposit !== "All Security Deposits" &&
        !(
          (filters.securityDeposit === "N/A" && !hasSecurityDeposit(expense)) ||
          (filters.securityDeposit !== "N/A" &&
            securityDeposit === Number(filters.securityDeposit))
        )
      ) {
        return false;
      }

      const actualAmount = getActualAmountValue(expense);
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

      return true;
    });
  }, [processingExpenses, filters]);

  const clearFilters = () => {
    setFilters({
      expenseType: "All Expense Type",
      createdBy: "All Creators",
      email: "All Emails",
      eventName: "All Events",
      location: "All Locations",
      approvedBy: "All Approvers",
      uniqueId: "All Unique IDs",
      minAmount: "",
      maxAmount: "",
      tdsDeduction: "All TDS Deductions",
      securityDeposit: "All Security Deposits",
      minActualAmount: "",
      maxActualAmount: "",
    });
    setSearchQuery({
      expenseType: "",
      createdBy: "",
      email: "",
      eventName: "",
      location: "",
      approvedBy: "",
      uniqueId: "",
      tdsDeduction: "",
      securityDeposit: "",
    });
  };

  const getPaidByBankLabelForAccountType = (
    accountType: "NGIDFC" | "FCIDCF" | "KOTAK" | ""
  ) => {
    if (accountType === "NGIDFC") return "NGIDFC Current";
    if (accountType === "FCIDCF") return "FCIDFC Current";
    if (accountType === "KOTAK") return "KOTAK";
    return "";
  };

  const getExportFileName = (extension: "csv" | "xlsx") => {
    const accountTypeSuffix = selectedBankType
      ? selectedBankType.toLowerCase()
      : "all";
    return `payment_processing_${accountTypeSuffix}.${extension}`;
  };

  const getExpensesForSelectedAccountType = () => {
    const bankLabel = getPaidByBankLabelForAccountType(selectedBankType);
    if (!bankLabel) return [];

    return processingExpenses.filter(
      (expense) => (paidByBank[expense.id] || "") === bankLabel
    );
  };

  const validateSelectedAccountTypeForExport = () => {
    const bankLabel = getPaidByBankLabelForAccountType(selectedBankType);
    if (!bankLabel) {
      toast.error("Please select an account type before exporting.");
      return false;
    }

    const expensesForSelectedType = getExpensesForSelectedAccountType();
    if (expensesForSelectedType.length === 0) {
      toast.error(
        `No expenses found with “${bankLabel}” selected in the “Paid By Bank” column.`
      );
      return false;
    }

    return true;
  };

  // Use pagination hook
  const pagination = usePagination(filteredProcessingExpenses);

  useEffect(() => {
    async function fetchExpensesAndBankDetails() {
      if (!orgId) return;

      try {
        setLoading(true);

        const { data: expenseData, error: expenseError } =
          await expenses.getByOrg(orgId);
        if (expenseError) throw expenseError;

        let filteredExpenses = (expenseData || [])
          // .filter((exp: any) => exp.status === "finance_approved")
          .filter(
            (exp: any) =>
              exp.status === "finance_approved" &&
              (!exp.payment_status || exp.payment_status === "pending")
          )
          .map((exp: any) => ({
            ...exp,
            email: exp.creator_email || "-",
            creator_name: exp.creator?.full_name || "—",
            approver_name: exp.approver?.full_name || "—",
            payment_type: exp.payment_type || "NEFT",
            // unique_id: exp.unique_id || "N/A",
          }));

        // Sort by finance_approve_time in ascending order (earliest first)
        if (filteredExpenses.length > 0) {
          filteredExpenses.sort((a: any, b: any) => {
            const timeA = a.finance_approve_time ? new Date(a.finance_approve_time).getTime() : 0;
            const timeB = b.finance_approve_time ? new Date(b.finance_approve_time).getTime() : 0;
            // Put null/undefined timestamps at the end
            if (!timeA && !timeB) return 0;
            if (!timeA) return 1;
            if (!timeB) return -1;
            return timeA - timeB;
          });
        }

        // Bulk fetch event titles for displayed expenses
        const eventIds = [
          ...new Set(
            filteredExpenses
              .map((e: any) => e.event_id)
              .filter((id: any) => typeof id === "string" && id.length > 0)
          ),
        ];

        if (eventIds.length > 0) {
          const { data: eventsData, error: evErr } = await supabase
            .from("expense_events")
            .select("id,title")
            .in("id", eventIds);
          const titleMap: Record<string, string> = {};
          if (!evErr && eventsData) {
            eventsData.forEach((ev: { id: string; title: string }) => {
              titleMap[ev.id] = ev.title;
            });
          }
          filteredExpenses = filteredExpenses.map((e: any) => ({
            ...e,
            event_title: e.event_id ? titleMap[e.event_id] || "N/A" : "N/A",
          }));
        } else {
          filteredExpenses = filteredExpenses.map((e: any) => ({
            ...e,
            event_title: "N/A",
          }));
        }

        const { data: bankData, error: bankError } = await supabase
          .from("bank_details")
          .select("*");
        if (bankError) throw bankError;

        const enrichedExpenses = filteredExpenses.map((exp) => {
          // If the expense itself has a unique_id, prefer bank details by that unique_id.
          // Otherwise fall back to the previous behavior (lookup by email).
          const bankByUnique = exp.unique_id
            ? bankData?.find((bank) => bank.unique_id === exp.unique_id)
            : null;
          const matchedBank =
            bankByUnique || bankData?.find((bank) => bank.email === exp.email);

          // Decide which unique id to display: expense-specific first, then bank's unique_id, then N/A
          const displayUniqueId = exp.unique_id
            ? exp.unique_id
            : matchedBank?.unique_id || "N/A";

          // Initialize value_date to today's date if not already set
          const defaultDate = new Date().toISOString().split("T")[0];

          return {
            ...exp,
            beneficiary_name:
              exp.beneficiary_name || matchedBank?.account_holder || "N/A",
            account_number:
              exp.account_number || matchedBank?.account_number || "N/A",
            ifsc: exp.ifsc || matchedBank?.ifsc_code || "N/A",
            debit_account: exp.debit_account || "10064244213",
            utr: exp.utr || "N/A",
            unique_id: displayUniqueId || "N/A",
            value_date: exp.value_date || defaultDate,
            // Prefer bank's email when we matched bank details (especially when matched by unique_id)
            bank_email:
              bankByUnique?.email || matchedBank?.email || exp.email || "-",
            tds_deduction_percentage: exp.tds_deduction_percentage ?? null,
            tds_deduction_amount: exp.tds_deduction_amount ?? null,
          };
        });

        setProcessingExpenses(enrichedExpenses);
        setPaidByBank((prev) => {
          const next = { ...prev };
          enrichedExpenses.forEach((exp) => {
            if (!next[exp.id] && isDirectPaymentUniqueId(exp.unique_id)) {
              next[exp.id] = "KOTAK";
            }
          });
          return next;
        });
      } catch (error: any) {
        toast.error("Failed to load data", {
          description: error.message,
        });
      } finally {
        setLoading(false);
      }
    }

    fetchExpensesAndBankDetails();
  }, [orgId]);

  // Handle expID from URL parameter
  useEffect(() => {
    const expID = searchParams.get("expID");
    if (expID) {
      setHighlightedExpenseId(expID);
      // Clear the expID after 10 seconds
      const timer = setTimeout(() => {
        setHighlightedExpenseId(null);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  // Scroll to highlighted row when it's set
  useEffect(() => {
    if (highlightedExpenseId && filteredProcessingExpenses.length > 0) {
      // Find which page the highlighted expense is on
      const recordIndex = filteredProcessingExpenses.findIndex(r => r.id === highlightedExpenseId);
      if (recordIndex !== -1) {
        const itemsPerPage = 10;
        const pageNumber = Math.floor(recordIndex / itemsPerPage) + 1;
        pagination.setCurrentPage(pageNumber);
        
        // Scroll to the highlighted row after pagination updates
        setTimeout(() => {
          highlightedRowRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        }, 200);
      }
    }
  }, [highlightedExpenseId, filteredProcessingExpenses, pagination.setCurrentPage]);

  const handlePageChange = (nextPage: number) => {
    if (nextPage === pagination.currentPage) return;

    pagination.setCurrentPage(nextPage);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("tab", "payments");
    nextParams.set("page", String(nextPage));
    nextParams.delete("expID");

    router.replace(`?${nextParams.toString()}`, { scroll: false });
  };

  const exportToCSV = (expensesToExport: any[]) => {
    const headers = selectedColumns;

    // Descriptions for each column to match the provided Excel template
    const descriptionsMap: Record<string, string> = {
      "beneficiary name": "Enter Beneficiary name. MANDATORY",
      "Beneficiary Account Number":
        "Enter Beneficiary account number. This can be IDFC FIRST Bank account or other Bank account. MANDATORY",
      IFSC: "Enter beneficiary bank IFSC code. Required only for Inter bank (NEFT/RTGS) payment.",
      "Transaction Type":
        "Enter Payment type: IFT- Within Bank Payment, NEFT- Inter-Bank(NEFT) Payment, RTGS- Inter-Bank(RTGS) Payment. MANDATORY",
      "Debit Account No.":
        "Enter Debit account number. This should be IDFC FIRST Bank account number only. User should have access to do transaction on this account. MANDATORY",
      "Transaction Date":
        "Enter transaction value date. Should be today's date or future date. MANDATORY DD/MM/YYYY format",
      Amount: "Enter Payment amount. MANDATORY",
      Currency: "Enter transaction currency. Should be INR only. MANDATORY",
      "Beneficiary Email ID": "Enter beneficiary email id. OPTIONAL",
      Remark: "Enter Remarks OPTIONAL",
    };

    const rows = expensesToExport.map((exp) => {
      const row: any[] = [];

      for (const col of headers) {
        switch (col) {
          case "beneficiary name":
            row.push(exp.beneficiary_name || "N/A");
            break;
          case "Beneficiary Account Number":
            row.push(exp.account_number || "N/A");
            break;
          case "IFSC":
            row.push(exp.ifsc || "N/A");
            break;
          case "Transaction Type":
            row.push(exp.payment_type || "N/A");
            break;
          case "Debit Account No.":
            row.push(exp.debit_account || "—");
            break;
          case "Transaction Date":
            row.push(
              exp.value_date
                ? new Date(exp.value_date).toLocaleDateString("en-IN")
                : "—"
            );
            break;
          case "Amount":
            row.push(getExportAmountValue(exp, "N/A"));
            break;
          case "Currency":
            row.push(exp.currency || "INR");
            break;
          case "Beneficiary Email ID":
            row.push(exp.bank_email || exp.email || "—");
            break;
          case "Remark":
            {
              const createdBy =
                exp.creator_name || exp.creator?.full_name || "—";
              const approvedBy =
                exp.approver_name || exp.approver?.full_name || "—";
              const location = exp.location || "—";
              const remark = `${location}, ${createdBy}, ${approvedBy}`;
              row.push(remark);
            }
            break;
          default:
            row.push("—");
        }
      }

      return row;
    });

    // Build CSV with header row + description row + data rows
    const csvRows: string[] = [];
    csvRows.push(headers.map((h) => `"${h}"`).join(","));
    csvRows.push(
      headers
        .map((h) => `"${(descriptionsMap[h] || "").replace(/"/g, '""')}"`)
        .join(",")
    );
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
    link.setAttribute("download", getExportFileName("csv"));
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToXLSX = (expensesToExport: any[]) => {
    const headers = selectedColumns;

    const descriptionsMap: Record<string, string> = {
      "beneficiary name": "Enter Beneficiary name. MANDATORY",
      "Beneficiary Account Number":
        "Enter Beneficiary account number. This can be IDFC FIRST Bank account or other Bank account. MANDATORY",
      IFSC: "Enter beneficiary bank IFSC code. Required only for Inter bank (NEFT/RTGS) payment.",
      "Transaction Type":
        "Enter Payment type: IFT- Within Bank Payment, NEFT- Inter-Bank(NEFT) Payment, RTGS- Inter-Bank(RTGS) Payment. MANDATORY",
      "Debit Account No.":
        "Enter Debit account number. This should be IDFC FIRST Bank account number only. User should have access to do transaction on this account. MANDATORY",
      "Transaction Date":
        "Enter transaction value date. Should be today's date or future date. MANDATORY DD/MM/YYYY format",
      Amount: "Enter Payment amount. MANDATORY",
      Currency: "Enter transaction currency. Should be INR only. MANDATORY",
      "Beneficiary Email ID": "Enter beneficiary email id. OPTIONAL",
      Remark: "Enter Remarks OPTIONAL",
    };

    const rows = expensesToExport.map((exp) => {
      const row: any[] = [];

      for (const col of headers) {
        switch (col) {
          case "beneficiary name":
            row.push(exp.beneficiary_name || "N/A");
            break;
          case "Beneficiary Account Number":
            row.push(exp.account_number || "N/A");
            break;
          case "IFSC":
            row.push(exp.ifsc || "N/A");
            break;
          case "Transaction Type":
            row.push(exp.payment_type || "N/A");
            break;
          case "Debit Account No.":
            row.push(exp.debit_account || "N/A");
            break;
          case "Transaction Date":
            row.push(
              exp.value_date
                ? new Date(exp.value_date).toLocaleDateString("en-IN")
                : "N/A"
            );
            break;
          case "Amount":
            row.push(getExportAmountValue(exp, "N/A"));
            break;
          case "Currency":
            row.push(exp.currency || "INR");
            break;
          case "Beneficiary Email ID":
            row.push(exp.bank_email || exp.email || "N/A");
            break;
          case "Remark":
            {
              const createdBy =
                exp.creator_name || exp.creator?.full_name || "—";
              const approvedBy =
                exp.approver_name || exp.approver?.full_name || "—";
              const location = exp.location || "—";
              const remark = `${location}, ${createdBy}, ${approvedBy}`;
              row.push(remark);
            }
            break;
          default:
            row.push("—");
        }
      }

      return row;
    });

    // Include a second row of descriptions so Excel shows the guidance below headers
    const descRow = headers.map((h) => descriptionsMap[h] || "");
    const data = [headers, descRow, ...rows];

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Optionally set column widths for better readability
    ws["!cols"] = headers.map(() => ({ wch: 30 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Payments");

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = getExportFileName("xlsx");
    link.click();
    URL.revokeObjectURL(url);
  };

  // Validate that if Transaction Date column is selected, all rows have a value_date
  const validateTransactionDatesForExport = (expensesToExport: any[]) => {
    if (selectedColumns.includes("Transaction Date")) {
      const missing = expensesToExport.filter((exp) => {
        return !exp.value_date || exp.value_date.trim() === "";
      });
      if (missing.length > 0) {
        // Show a clear notification and prevent the export
        toast.error(
          "Please add Transaction Date for all expenses before exporting.",
          {}
        );
        return false;
      }
    }

    return true;
  };

  const handleTdsChange = async (expenseId: string, value: string) => {
    const percentage = value ? Number.parseInt(value, 10) : null;
    const updatedExpenses = processingExpenses.map((exp) => {
      if (exp.id !== expenseId) return exp;
      const baseAmount = exp.approved_amount ?? exp.amount ?? 0;
      const tdsAmount = calculateTdsAmount(baseAmount, percentage);
      const securityDepositAmount =
        exp.security_deposit_amount !== null &&
        exp.security_deposit_amount !== undefined
          ? Number(exp.security_deposit_amount)
          : null;
      const actualAmount = calculateActualAmount(
        baseAmount,
        tdsAmount,
        securityDepositAmount
      );
      return {
        ...exp,
        tds_deduction_percentage: percentage,
        tds_deduction_amount: tdsAmount,
        actual_amount: actualAmount,
      };
    });

    setProcessingExpenses(updatedExpenses);

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

  const handleExportXLSX = () => {
    if (!validateSelectedAccountTypeForExport()) return;
    const expensesToExport = getExpensesForSelectedAccountType();
    if (!validateTransactionDatesForExport(expensesToExport)) return;
    exportToXLSX(expensesToExport);
    setShowFormatModal(false);
    // setSelectedBankType("");
  };

  const handleExportCSV = () => {
    if (!validateSelectedAccountTypeForExport()) return;
    const expensesToExport = getExpensesForSelectedAccountType();
    if (!validateTransactionDatesForExport(expensesToExport)) return;
    exportToCSV(expensesToExport);
    setShowFormatModal(false);
    // setSelectedBankType("");
  };

  const expenseToConfirm = confirmExpenseId
    ? processingExpenses.find((exp) => exp.id === confirmExpenseId)
    : null;

  const markExpensesPaidWithTimestamp = async (ids: string[], bankData?: Record<string, string>) => {
    const paidAt = new Date().toISOString();
    
    // Create update payload with paid_by_bank for each expense
    const updatePromises = ids.map((id) => {
      const expense = processingExpenses.find((exp) => exp.id === id);
      const payload = {
        payment_status: "paid",
        paid_approval_time: paidAt,
        paid_by_bank: bankData?.[id] || null,
        tds_deduction_percentage: expense?.tds_deduction_percentage ?? null,
        tds_deduction_amount: expense?.tds_deduction_amount ?? null,
      };

      return supabase
        .from("expense_new")
        .update(payload)
        .eq("id", id);
    });

    let lastError: any = null;

    // Execute all updates
    const results = await Promise.all(updatePromises);
    
    // Check for errors
    for (const result of results) {
      if (result.error) {
        lastError = result.error;
        break;
      }
    }

    if (lastError) {
      throw lastError;
    }

    return paidAt;
  };

  const sendPaymentProcessedEmail = async (expense: any) => {
    const creatorEmail =
      expense.creator_email || expense.email || expense.bank_email || null;

    if (!creatorEmail) {
      console.warn(
        `Skipping email for expense ${expense.id}: no creator email available.`
      );
      return;
    }

    const creatorName = expense.creator_name || expense.creator?.full_name;

    const { data: userData } = await auth.getUser();
    const currentUserId = userData.user?.id || "";
    let approverName = userData.user?.email || "Finance Team";
    if (currentUserId) {
      const profRes = await profiles.getByUserId(currentUserId);
      const fullName = (profRes as any)?.data?.full_name as string | undefined;
      if (fullName) approverName = fullName;
    }

    try {
      await fetch("/api/expenses/notify-creator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expenseId: expense.id,
          creatorEmail,
          creatorName,
          approverName,
          orgName: organization?.name || null,
          slug,
          amount: expense.amount,
          approvedAmount: expense.approved_amount ?? expense.amount,
          expenseType: expense.expense_type,
          status: "payment_processed",
          decisionStage: "finance",
        }),
      });
    } catch (notifyErr) {
      console.error(
        `Failed to send payment notification for expense ${expense.id}:`,
        notifyErr
      );
    }
  };

  const handleMarkAsPaid = async () => {
    if (!orgId || processingExpenses.length === 0) {
      toast.warning("No expenses to mark as paid.");
      return;
    }

    const expensesToProcess = Array.from(selectedExpenses);
    if (expensesToProcess.length === 0) {
      toast.warning("No expense selected. Please select at least one checkbox to mark the expense(s) as paid.");
      return;
    }

    // Check if all selected expenses have a bank selected
    const missingBank = expensesToProcess.filter((id) => !paidByBank[id] || paidByBank[id] === "");
    if (missingBank.length > 0) {
      toast.error("Please choose a bank for the selected expenses before marking them as paid.");
      return;
    }

    try {
      setLoading(true);

      await markExpensesPaidWithTimestamp(expensesToProcess, paidByBank);

      // Send email notifications to all creators
      try {
        await Promise.allSettled(
          expensesToProcess.map((id) => {
            const expense = processingExpenses.find((exp) => exp.id === id);
            return expense ? sendPaymentProcessedEmail(expense) : Promise.resolve();
          })
        );
      } catch (notifyErr) {
        console.error("Failed to send payment notifications:", notifyErr);
        // Don't fail the mark as paid operation if email fails
      }

      toast.success("Selected expenses marked as paid. Email notifications have been sent to the expense creators.");
      
      setProcessingExpenses((prev) => prev.filter((exp) => !selectedExpenses.has(exp.id)));
      
      setPaidByBank((prev) => {
        const next = { ...prev };
        expensesToProcess.forEach(id => delete next[id]);
        return next;
      });
      setSelectedExpenses(new Set());
    } catch (error: any) {
      toast.error("Failed to mark as paid", { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsPaidIndividual = async (expenseId: string) => {
    // Check if bank is selected for this expense
    if (!paidByBank[expenseId] || paidByBank[expenseId] === "") {
      toast.error("Please select a bank from the “Paid By Bank” column before marking the expense as paid.");
      return;
    }

    try {
      setLoading(true);

      await markExpensesPaidWithTimestamp([expenseId], paidByBank);

      // Get the expense details to send notification
      const expense = processingExpenses.find((exp) => exp.id === expenseId);
      if (expense) {
        try {
          await sendPaymentProcessedEmail(expense);
        } catch (notifyErr) {
          console.error("Failed to send payment notification:", notifyErr);
          // Don't fail the mark as paid operation if email fails
        }
      }

      toast.success("Expense has been marked as paid. Email notification has been sent to the expense creator.");

      // Remove the paid expense from state
      setProcessingExpenses((prev) =>
        prev.filter((exp) => exp.id !== expenseId)
      );
      // Remove from paidByBank state
      setPaidByBank((prev) => {
        const updated = { ...prev };
        delete updated[expenseId];
        return updated;
      });
    } catch (error: any) {
      toast.error("Failed to mark as paid", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3">
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => setFilterOpen((s) => !s)}>
            <Filter className="mr-2 h-4 w-4" />
            Filters
          </Button>
          <Button onClick={() => setShowConfirmAllPaid(true)}>
            Mark all as Paid
          </Button>
          <Button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 cursor-pointer text-sm sm:text-base"
            variant="outline"
          >
            <Download className="w-4 h-4" />
            Export csv or .xlsx
          </Button>
        </div>
      </div>

      {filterOpen && (
        <div className="p-4 rounded-md border shadow-sm bg-white">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <label className="text-sm font-medium">Created By</label>
              <Select
                value={filters.createdBy || "All Creators"}
                onValueChange={(v) =>
                  setFilters((prev) => ({ ...prev, createdBy: v }))
                }
              >
                <SelectTrigger className="mt-1 w-full bg-white">
                  <SelectValue placeholder="All Creators" />
                </SelectTrigger>
                <SelectContent
                  searchPlaceholder="Search creator..."
                  searchValue={searchQuery.createdBy}
                  onSearchChange={(v) => setSearchQuery((prev) => ({ ...prev, createdBy: v }))}
                >
                  <SelectItem value="All Creators">All Creators</SelectItem>
                  {createdByOptions
                    .filter((opt) => String(opt).toLowerCase().includes(searchQuery.createdBy.toLowerCase()))
                    .map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">Email</label>
              <Select
                value={filters.email || "All Emails"}
                onValueChange={(v) =>
                  setFilters((prev) => ({ ...prev, email: v }))
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
                  {emailOptions
                    .filter((opt) => String(opt).toLowerCase().includes(searchQuery.email.toLowerCase()))
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
                  searchPlaceholder="Search event..."
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
                  searchPlaceholder="Search project..."
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
              <label className="text-sm font-medium">TDS Deduction</label>
              <Select
                value={filters.tdsDeduction || "All TDS Deductions"}
                onValueChange={(v) =>
                  setFilters((prev) => ({ ...prev, tdsDeduction: v }))
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

            <div>
              <label className="text-sm font-medium">Security Deposit</label>
              <Select
                value={filters.securityDeposit || "All Security Deposits"}
                onValueChange={(v) =>
                  setFilters((prev) => ({ ...prev, securityDeposit: v }))
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

      <div className="rounded-md border shadow-sm bg-white overflow-x-auto">
        <Table className="w-full text-sm">
          <TableHeader className="bg-gray-300">
            <TableRow>
              <TableHead className="px-4 py-3 text-center">
                <Checkbox
                className="border border-black cursor-pointer"
                  checked={
                    filteredProcessingExpenses.length > 0 &&
                    filteredProcessingExpenses.every((exp) => selectedExpenses.has(exp.id))
                  }
                  onCheckedChange={(checked) => {
                    if (checked) {
                      const newSelected = new Set(selectedExpenses);
                      filteredProcessingExpenses.forEach((exp) => newSelected.add(exp.id));
                      setSelectedExpenses(newSelected);
                    } else {
                      const newSelected = new Set(selectedExpenses);
                      filteredProcessingExpenses.forEach((exp) => newSelected.delete(exp.id));
                      setSelectedExpenses(newSelected);
                    }
                  }}
                />
              </TableHead>
              <TableHead className="px-4 py-3 text-center">S.No.</TableHead>
              <TableHead className="px-4 py-3 text-center">Timestamp</TableHead>
              <TableHead className="px-4 py-3 text-center">
                Expense Type
              </TableHead>
              <TableHead className="px-4 py-3 text-center">
                Created By
              </TableHead>
              <TableHead className="px-4 py-3 text-center">Email</TableHead>
              <TableHead className="px-4 py-3 text-center">
                Event Name
              </TableHead>
              <TableHead className="px-4 py-3 text-center">Project of Expense</TableHead>
              <TableHead className="px-4 py-3 text-center">
                Approved By
              </TableHead>
              <TableHead className="px-4 py-3 text-center">
                Beneficiary Name
              </TableHead>
              <TableHead className="px-4 py-3 text-center">
                Account Number
              </TableHead>
              <TableHead className="px-4 py-3 text-center">IFSC</TableHead>
              <TableHead className="px-4 py-3 text-center">
                Payment Type
              </TableHead>
              <TableHead className="px-4 py-3 text-center">
                Debit Account
              </TableHead>
              <TableHead className="px-4 py-3 text-center">
                Transaction Date
              </TableHead>
              <TableHead className="px-4 py-3 text-center">Amount</TableHead>
              <TableHead className="px-4 py-3 text-center">
                TDS Deduction
              </TableHead>
              <TableHead className="px-4 py-3 text-center">
                Security Deposit 
              </TableHead>
              <TableHead className="px-4 py-3 text-center">
                Actual Amount
              </TableHead>
              <TableHead className="px-4 py-3 text-center">Currency</TableHead>
              <TableHead className="px-4 py-3 text-center">
                <div className="flex items-center justify-center gap-2">
                  <span>UTR</span>
                  {!isPasswordVerified ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-xs"
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
                      className="h-6 px-2 text-xs text-red-600 border-red-300 hover:bg-red-50"
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
              <TableHead className="px-4 py-3 text-center">Paid by Bank</TableHead>
              <TableHead className="px-4 py-3 text-center">Unique ID</TableHead>
              <TableHead className="px-4 py-3 text-center">Status</TableHead>
              <TableHead className="px-4 py-3 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableSkeleton colSpan={25} rows={5} />
            ) : filteredProcessingExpenses.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={25}
                  className="text-center py-6 text-muted-foreground"
                >
                  {processingExpenses.length === 0
                    ? "No expenses in payment processing."
                    : "No expenses match selected filters."}
                </TableCell>
              </TableRow>
            ) : (
              pagination.paginatedData.map((expense, index) => (
                <TableRow
                  key={expense.id}
                  ref={highlightedExpenseId === expense.id ? highlightedRowRef : null}
                  className={`hover:bg-gray-50 transition-colors ${
                    highlightedExpenseId === expense.id 
                      ? "border-2 border-yellow-400 bg-yellow-50" 
                      : ""
                  }`}
                >
                  <TableCell className="px-4 py-3 text-center">
                    <Checkbox
                      className="border border-black cursor-pointer"
                      checked={selectedExpenses.has(expense.id)}
                      onCheckedChange={(checked) => {
                        const newSelected = new Set(selectedExpenses);
                        if (checked) {
                          newSelected.add(expense.id);
                        } else {
                          newSelected.delete(expense.id);
                        }
                        setSelectedExpenses(newSelected);
                      }}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {pagination.getItemNumber(index)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {formatDateTime(expense.created_at)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {expense.expense_type || "N/A"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {expense.creator_name}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {expense.bank_email || expense.email}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {expense.event_title || "N/A"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {expense.location || "N/A"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {expense.approver_name}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {expense.beneficiary_name}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {expense.account_number}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {expense.ifsc}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    <Select
                      value={expense.payment_type || "NEFT"}
                      onValueChange={(value) => {
                        const updated = processingExpenses.map((exp) =>
                          exp.id === expense.id
                            ? { ...exp, payment_type: value }
                            : exp
                        );
                        setProcessingExpenses(updated);
                      }}
                    >
                      <SelectTrigger className="w-[280px] h-8 text-sm bg-white mx-auto">
                        <SelectValue placeholder="Payment Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IFT">IFT - Within Bank Payment</SelectItem>
                        <SelectItem value="NEFT">NEFT - Inter-Bank(NEFT) Payment</SelectItem>
                        <SelectItem value="RTGS">RTGS - Inter-Bank(RTGS) Payment</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>

                  <TableCell className="px-4 py-3 text-center">
                    {editingFields[expense.id]?.debit ? (
                      <div className="flex items-center space-x-2 w-40">
                        <input
                          type="text"
                          className="border px-2 py-1 rounded text-sm text-center w-full"
                          value={expense.debit_account}
                          onChange={(e) => {
                            const updated = processingExpenses.map((exp) =>
                              exp.id === expense.id
                                ? { ...exp, debit_account: e.target.value }
                                : exp
                            );
                            setProcessingExpenses(updated);
                          }}
                        />
                        <div className="w-16">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-full px-1 text-sm"
                            onClick={() =>
                              setEditingFields((prev) => ({
                                ...prev,
                                [expense.id]: {
                                  ...prev[expense.id],
                                  debit: false,
                                },
                              }))
                            }
                            title="Save"
                          >
                            <Save className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2 w-40">
                        <span className="text-sm">{expense.debit_account}</span>
                        <div className="w-16">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-full px-1 text-sm"
                            onClick={() =>
                              setEditingFields((prev) => ({
                                ...prev,
                                [expense.id]: {
                                  ...(prev[expense.id] || {}),
                                  debit: true,
                                },
                              }))
                            }
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="px-4 py-3 text-center">
                    <input
                      type="date"
                      className="border px-2 py-1 rounded text-sm"
                      value={
                        expense.value_date
                          ? new Date(expense.value_date)
                              .toISOString()
                              .split("T")[0]
                          : new Date().toISOString().split("T")[0]
                      }
                      onChange={(e) => {
                        const updated = processingExpenses.map((exp) =>
                          exp.id === expense.id
                            ? { ...exp, value_date: e.target.value }
                            : exp
                        );
                        setProcessingExpenses(updated);
                      }}
                    />
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {formatCurrency(expense.amount)}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <Select
                        value={
                          expense.tds_deduction_percentage
                            ? String(expense.tds_deduction_percentage)
                            : "none"
                        }
                        onValueChange={(value) =>
                          handleTdsChange(expense.id, value === "none" ? "" : value)
                        }
                      >
                        <SelectTrigger className="w-[110px] h-8 text-sm bg-white">
                          <SelectValue placeholder="Select %" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Select %</SelectItem>
                          {Array.from({ length: 50 }, (_, idx) => idx + 1).map(
                            (percent) => (
                              <SelectItem key={percent} value={String(percent)}>
                                {percent}%
                              </SelectItem>
                            )
                          )}
                        </SelectContent>
                      </Select>
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
                    {expense.security_deposit_amount !== null &&
                    expense.security_deposit_amount !== undefined
                      ? formatCurrency(Number(expense.security_deposit_amount))
                      : "N/A"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {(() => {
                      const actualAmount = getActualAmountValue(expense);

                      return actualAmount !== null
                        ? formatCurrency(actualAmount)
                        : "N/A";
                    })()}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {expense.currency || "INR"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    {editingFields[expense.id]?.utr ? (
                      <div className="flex items-center justify-center space-x-2 w-40 mx-auto">
                        <input
                          type="text"
                          className="border px-2 py-1 rounded text-sm text-center w-full"
                          value={expense.utr}
                          onChange={(e) => {
                            const updated = processingExpenses.map((exp) =>
                              exp.id === expense.id
                                ? { ...exp, utr: e.target.value }
                                : exp
                            );
                            setProcessingExpenses(updated);
                          }}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter") {
                              // Save UTR when Enter is pressed
                              const { error } = await supabase
                                .from("expense_new")
                                .update({ utr: expense.utr })
                                .eq("id", expense.id);

                              if (error) {
                                toast.error("Failed to update UTR");
                              } else {
                                toast.success("UTR updated");
                                setEditingFields((prev) => ({
                                  ...prev,
                                  [expense.id]: {
                                    ...prev[expense.id],
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
                                .update({ utr: expense.utr })
                                .eq("id", expense.id);

                              if (error) {
                                toast.error("Failed to update UTR");
                              } else {
                                toast.success("UTR updated");
                                setEditingFields((prev) => ({
                                  ...prev,
                                  [expense.id]: {
                                    ...prev[expense.id],
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
                          {expense.utr || "—"}
                        </span>
                        <div className="w-16">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-full px-1 text-sm"
                            onClick={() => {
                              if (isPasswordVerified) {
                                setEditingFields((prev) => ({
                                  ...prev,
                                  [expense.id]: {
                                    ...(prev[expense.id] || {}),
                                    utr: true,
                                  },
                                }));
                              } else {
                                setPasswordModal({
                                  open: true,
                                  expenseId: expense.id,
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

                  <TableCell className="px-4 py-3 text-center">
                    <Select
                      value={paidByBank[expense.id] || "none"}
                      onValueChange={(value) => {
                        const selectedBank = value === "none" ? "" : value;
                        setPaidByBank((prev) => ({
                          ...prev,
                          [expense.id]: selectedBank,
                        }));

                        let newDebitAccount = expense.debit_account;
                        if (selectedBank === "NGIDFC Current") {
                          newDebitAccount = "10064244213";
                        } else if (selectedBank === "FCIDFC Current") {
                          newDebitAccount = "10268100007";
                        }

                        if (newDebitAccount !== expense.debit_account) {
                          setProcessingExpenses((prev) =>
                            prev.map((exp) =>
                              exp.id === expense.id
                                ? { ...exp, debit_account: newDebitAccount }
                                : exp
                            )
                          );
                        }
                      }}
                    >
                      <SelectTrigger className="w-[160px] h-8 text-sm bg-white mx-auto">
                        <SelectValue placeholder="Select Bank" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Select Bank</SelectItem>
                        <SelectItem value="NGIDFC Current">NGIDFC Current</SelectItem>
                        <SelectItem value="FCIDFC Current">FCIDFC Current</SelectItem>
                        <SelectItem value="KOTAK">KOTAK</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>

                  <TableCell className="px-4 py-3 text-center">
                    {expense.unique_id || "N/A"}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center">
                    <ExpenseStatusBadge
                      status="finance_approved"
                      className="border border-green-300"
                    />
                  </TableCell>
                  <TableCell className="px-4 py-3 text-center space-x-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() =>
                              router.push(
                                `/org/${slug}/finance/payments/${expense.id}`
                              )
                            }
                            className="cursor-pointer"
                          >
                            <Eye className="w-4 h-4 text-gray-700" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>View Expense</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setConfirmExpenseId(expense.id)}
                            className="text-green-600 hover:text-green-800 transition-transform hover:scale-110 cursor-pointer"
                          >
                            <CheckCircle className="w-5 h-5 " />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Mark as Paid</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {filteredProcessingExpenses.length > 0 && (
        <Pagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          onPageChange={handlePageChange}
          isLoading={loading}
          itemLabel="Expenses"
        />
      )}

      {/* Export Modal - Bank Type Selection */}
      <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Account Type</DialogTitle>
              Only expenses with a selected bank in 'Paid by Bank' will be exported.
          </DialogHeader>

          <div className="space-y-6">
            {/* Bank Type Selection */}
            <div className="space-y-3">
              <RadioGroup value={selectedBankType} onValueChange={(value) => setSelectedBankType(value as "NGIDFC" | "FCIDCF" | "KOTAK")}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="NGIDFC" id="ngidfc" />
                  <Label htmlFor="ngidfc" className="font-normal cursor-pointer">NGIDFC Current</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="FCIDCF" id="fcidcf" />
                  <Label htmlFor="fcidcf" className="font-normal cursor-pointer">FCIDCF Current</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="KOTAK" id="kotak" />
                  <Label htmlFor="kotak" className="font-normal cursor-pointer">KOTAK</Label>
                </div>
              </RadioGroup>
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
                if (!validateSelectedAccountTypeForExport()) return;
                setShowExportModal(false);
                setShowColumnsModal(true);
              }}
              disabled={!selectedBankType}
              className="cursor-pointer"
            >
              Next
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Columns Selection Modal */}
      <Dialog open={showColumnsModal} onOpenChange={setShowColumnsModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Columns to Export</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-3 max-h-[300px] overflow-auto">
              {allColumns.map((col) => (
                <div key={col} className="flex items-center gap-2">
                  <Checkbox
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
                  <span>{col}</span>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setShowColumnsModal(false);
                setShowExportModal(true);
              }}
              className="cursor-pointer"
            >
              Back
            </Button>
            <Button
              onClick={() => {
                setShowColumnsModal(false);
                setShowFormatModal(true);
              }}
              disabled={selectedColumns.length === 0}
              className="cursor-pointer"
            >
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Format chooser modal: CSV or Excel */}
      <Dialog open={showFormatModal} onOpenChange={setShowFormatModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Choose export format</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Which format would you like to download?
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  handleExportXLSX();
                }}
                disabled={selectedColumns.length === 0}
                className="cursor-pointer"
              >
                Microsoft Excel (.xlsx)
              </Button>
              <Button
                onClick={() => {
                  handleExportCSV();
                }}
                disabled={selectedColumns.length === 0}
                className="cursor-pointer"
              >
                CSV
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Confirm Mark as Paid */}
      <Dialog open={showConfirmAllPaid} onOpenChange={setShowConfirmAllPaid}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Paid?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            This will mark all selected expenses as paid.
          </p>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setShowConfirmAllPaid(false)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await handleMarkAsPaid();
                setShowConfirmAllPaid(false);
              }}
              className="bg-gray-800 text-white cursor-pointer"
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Confirm single expense */}
      <Dialog
        open={!!confirmExpenseId}
        onOpenChange={() => setConfirmExpenseId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark as Paid?</DialogTitle>
            <DialogDescription>
              {expenseToConfirm
                ? `This action will move payment records from the Payment Processing section.`
                : "Mark this expense as paid? This will move it out of Payment Processing and cannot be undone."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setConfirmExpenseId(null)}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (confirmExpenseId) {
                  await handleMarkAsPaidIndividual(confirmExpenseId);
                }
                setConfirmExpenseId(null);
              }}
              className="bg-gray-800 text-white cursor-pointer"
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
    </div>
  );
}
