"use client";

import { useOrgStore } from "@/store/useOrgStore";
import { expenses } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import supabase from "@/lib/supabase";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Eye, Download, Pencil, Save } from "lucide-react";
import { useRouter } from "next/navigation";

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
import { Pagination, usePagination } from "@/components/pagination";

const formatCurrency = (amount: number) => {
  if (isNaN(amount) || amount === null || amount === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);
};

export default function PaymentProcessingOnly() {
  const { organization } = useOrgStore();
  const orgId = organization?.id;
  const [processingExpenses, setProcessingExpenses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // const [editingFields, setEditingFields] = useState<Record<string, { remarks: boolean; debit: boolean }>>({});
  const [editingFields, setEditingFields] = useState<
    Record<string, { utr?: boolean; debit?: boolean }>
  >({});
  const [showConfirmAllPaid, setShowConfirmAllPaid] = useState(false);
  const [confirmExpenseId, setConfirmExpenseId] = useState<string | null>(null);

  const router = useRouter();

  const [showExportModal, setShowExportModal] = useState(false);
  const [showFormatModal, setShowFormatModal] = useState(false);

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

  // Use pagination hook
  const pagination = usePagination(processingExpenses);

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
            // Prefer bank's email when we matched bank details (especially when matched by unique_id)
            bank_email:
              bankByUnique?.email || matchedBank?.email || exp.email || "-",
          };
        });

        setProcessingExpenses(enrichedExpenses);
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

  const exportToCSV = () => {
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

    const rows = processingExpenses.map((exp) => {
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
            row.push(exp.approved_amount ?? exp.amount ?? "—");
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
    link.setAttribute("download", "payment_processing.csv");
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportToXLSX = () => {
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

    const rows = processingExpenses.map((exp) => {
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
            row.push(exp.approved_amount ?? exp.amount ?? "N/A");
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
    link.download = "payment_processing.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  };

  // Validate that if Transaction Date column is selected, all rows have a value_date
  const validateTransactionDatesForExport = () => {
    if (selectedColumns.includes("Transaction Date")) {
      const missing = processingExpenses.filter(
        (exp) => !exp.value_date || exp.value_date === ""
      );
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

  const handleExportXLSX = () => {
    if (!validateTransactionDatesForExport()) return;
    exportToXLSX();
    setShowFormatModal(false);
  };

  const handleExportCSV = () => {
    if (!validateTransactionDatesForExport()) return;
    exportToCSV();
    setShowFormatModal(false);
  };

  const expenseToConfirm = confirmExpenseId
    ? processingExpenses.find((exp) => exp.id === confirmExpenseId)
    : null;

  const handleMarkAsPaid = async () => {
    if (!orgId || processingExpenses.length === 0) {
      toast.warning("No expenses to mark as paid.");
      return;
    }

    try {
      setLoading(true);
      const ids = processingExpenses.map((e) => e.id);

      // Only update payment_status
      const { error } = await supabase
        .from("expense_new")
        .update({ payment_status: "paid" })
        .in("id", ids);

      if (error) throw error;

      toast.success("All expenses marked as paid.");
      setProcessingExpenses([]); // clear current list (will reload on refresh)
    } catch (error: any) {
      toast.error("Failed to mark as paid", { description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsPaidIndividual = async (expenseId: string) => {
    try {
      setLoading(true);

      const { error } = await supabase
        .from("expense_new")
        .update({ payment_status: "paid" })
        .eq("id", expenseId);

      if (error) throw error;

      toast.success("Expense marked as paid");

      // Remove the paid expense from state
      setProcessingExpenses((prev) =>
        prev.filter((exp) => exp.id !== expenseId)
      );
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

      <div className="rounded-md border shadow-sm bg-white overflow-x-auto">
        <Table className="w-full text-sm">
          <TableHeader className="bg-gray-300">
            <TableRow>
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
              <TableHead className="px-4 py-3 text-center">Location</TableHead>
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
              <TableHead className="px-4 py-3 text-center">Unique ID</TableHead>
              <TableHead className="px-4 py-3 text-center">Status</TableHead>
              <TableHead className="px-4 py-3 text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableSkeleton colSpan={19} rows={5} />
            ) : processingExpenses.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={19}
                  className="text-center py-6 text-muted-foreground"
                >
                  No expenses in payment processing.
                </TableCell>
              </TableRow>
            ) : (
              pagination.paginatedData.map((expense, index) => (
                <TableRow
                  key={expense.id}
                  className="hover:bg-gray-50 transition-colors"
                >
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
                    <select
                      className="border px-2 py-1 rounded bg-white text-sm"
                      value={expense.payment_type}
                      onChange={(e) => {
                        const updated = processingExpenses.map((exp) =>
                          exp.id === expense.id
                            ? { ...exp, payment_type: e.target.value }
                            : exp
                        );
                        setProcessingExpenses(updated);
                      }}
                    >
                      <option value="IFT">IFT - Within Bank Payment</option>
                      <option value="NEFT">
                        NEFT - Inter-Bank(NEFT) Payment
                      </option>
                      <option value="RTGS">
                        RTGS - Inter-Bank(RTGS) Payment
                      </option>
                    </select>
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
                          : ""
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
                    {formatCurrency(expense.approved_amount)}
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
                                `/org/${orgId}/finance/payments/${expense.id}`
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
      {processingExpenses.length > 0 && (
        <Pagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          totalItems={pagination.totalItems}
          onPageChange={pagination.setCurrentPage}
          isLoading={loading}
          itemLabel="Expenses"
        />
      )}

      {/* Export Modal */}
      <Dialog open={showExportModal} onOpenChange={setShowExportModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Columns to Export</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 max-h-[300px] overflow-auto mt-2">
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

          <DialogFooter className="mt-4">
            <Button
              onClick={() => {
                // Close columns modal and open format chooser
                setShowExportModal(false);
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
      {/* Confirm Mark All as Paid */}
      <Dialog open={showConfirmAllPaid} onOpenChange={setShowConfirmAllPaid}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark all as Paid?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            This will mark all expenses in the list as paid.
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
