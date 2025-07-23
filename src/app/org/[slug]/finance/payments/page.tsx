"use client";

import { useOrgStore } from "@/store/useOrgStore";
import { expenses } from "@/lib/db";
import supabase from "@/lib/supabase";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, Download } from "lucide-react";
import { useRouter } from "next/navigation";


import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

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
  const [editingFields, setEditingFields] = useState<Record<string, { remarks: boolean; debit: boolean }>>({});

  const router = useRouter();

  const [showExportModal, setShowExportModal] = useState(false);

  const allColumns = [
    "Created By", "Email", "Approved By", "Beneficiary Name", "Account Number", "IFSC",
    "Payment Type", "Debit Account", "Transaction Date", "Amount", "Currency",
    "Remarks", "Unique ID", "Status"
  ];
  const [selectedColumns, setSelectedColumns] = useState<string[]>([...allColumns]);

  useEffect(() => {
    async function fetchExpensesAndBankDetails() {
      if (!orgId) return;

      try {
        setLoading(true);

        const { data: expenseData, error: expenseError } = await expenses.getByOrg(orgId);
        if (expenseError) throw expenseError;
        console.log("Fetched Expenses:", expenseData);


        const filteredExpenses = (expenseData || [])
          .filter((exp: any) => exp.status === "finance_approved")
          .map((exp: any) => ({
            ...exp,
            email: exp.creator_email || "-",
            creator_name: exp.creator?.full_name || "—",
            approver_name: exp.approver?.full_name || "—",
            payment_type: exp.payment_type || "NEFT",
            unique_id: exp.unique_id || "—", 

          }));

        const { data: bankData, error: bankError } = await supabase.from("bank_details").select("*");
        if (bankError) throw bankError;

        const enrichedExpenses = filteredExpenses.map((exp) => {
          const matchedBank = bankData?.find((bank) => bank.email === exp.email);
          return {
            ...exp,
            beneficiary_name: exp.beneficiary_name || matchedBank?.account_holder || "—",
            account_number: exp.account_number || matchedBank?.account_number || "—",
            ifsc: exp.ifsc || matchedBank?.ifsc_code || "—",
            debit_account: exp.debit_account || "32145624619", 
            remarks: exp.remarks || "Pune campuses 2 Hariom",

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

    const rows = processingExpenses.map((exp) => {
      const row = [];

      for (const col of headers) {
        switch (col) {
          case "Created By": row.push(exp.creator_name); break;
          case "Email": row.push(exp.email); break;
          case "Approved By": row.push(exp.approver_name); break;
          case "Beneficiary Name": row.push(exp.beneficiary_name); break;
          case "Account Number": row.push(exp.account_number); break;
          case "IFSC": row.push(exp.ifsc); break;
          case "Payment Type": row.push(exp.payment_type); break;
          case "Debit Account": row.push(exp.debit_account || "—"); break;
          case "Transaction Date":
            row.push(exp.value_date ? new Date(exp.value_date).toLocaleDateString("en-IN") : "—");
            break;
          case "Amount": row.push(exp.amount); break;
          case "Currency": row.push(exp.currency || "INR"); break;
          case "Remarks": row.push(exp.remarks || "—"); break;
          case "Unique ID": row.push(exp.unique_id || "—"); break;
          case "Status": row.push("Finance Approved"); break;
          default: row.push("—");
        }
      }

      return row;
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "payment_processing.csv");
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-800">Payment Processing</h3>
        <Button
          onClick={() => setShowExportModal(true)}
          className="flex items-center gap-2"
          variant="outline"
        >
          <Download className="w-4 h-4" />
          Export to CSV
        </Button>
      </div>

      <div className="rounded-md border shadow-sm bg-white overflow-x-auto">
        <Table className="w-full text-sm">
          <TableHeader className="bg-gray-50">
            <TableRow>
              <TableHead className="text-center py-3">Created By</TableHead>
              <TableHead className="text-center py-3">Email</TableHead>
              <TableHead className="text-center py-3">Approved By</TableHead>
              <TableHead className="text-center py-3">Beneficiary Name</TableHead>
              <TableHead className="text-center py-3">Account Number</TableHead>
              <TableHead className="text-center py-3">IFSC</TableHead>
              <TableHead className="text-center py-3">Payment Type</TableHead>
              <TableHead className="text-center py-3">Debit Account</TableHead>
              <TableHead className="text-center py-3">Transaction Date</TableHead>
              <TableHead className="text-center py-3">Amount</TableHead>
              <TableHead className="text-center py-3">Currency</TableHead>
              <TableHead className="text-center py-3">Remarks</TableHead>
              <TableHead className="text-center py-3">Unique ID</TableHead>
              <TableHead className="text-center py-3">Status</TableHead>
              {/* <TableHead className="text-center py-3">Actions</TableHead> */}
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={15} className="text-center py-6">
                  Loading...
                </TableCell>
              </TableRow>
            ) : processingExpenses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={15} className="text-center py-6 text-gray-500">
                  No expenses in payment processing.
                </TableCell>
              </TableRow>
            ) : (
              processingExpenses.map((expense) => (
                <TableRow key={expense.id} className="hover:bg-gray-50 transition py-3">
                  <TableCell className="text-center py-3">{expense.creator_name}</TableCell>
                  <TableCell className="text-center py-3">{expense.email}</TableCell>
                  <TableCell className="text-center py-3">{expense.approver_name}</TableCell>
                  <TableCell className="text-center py-3">{expense.beneficiary_name}</TableCell>
                  <TableCell className="text-center py-3">{expense.account_number}</TableCell>
                  <TableCell className="text-center py-3">{expense.ifsc}</TableCell>
                  <TableCell className="text-center py-3">
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
                      <option value="NEFT">NEFT - Inter-Bank(NEFT) Payment</option>
                      <option value="RTGS">RTGS - Inter-Bank(RTGS) Payment</option>
                    </select>
                  </TableCell>
                  <TableCell className="text-center py-3">
                    {editingFields[expense.id]?.debit ? (
                      <div className="flex items-center space-x-2 w-40">
                        <input
                          type="text"
                          className="border px-2 py-1 rounded text-sm text-center w-full"
                          value={expense.debit_account}
                          onChange={(e) => {
                            const updated = processingExpenses.map((exp) =>
                              exp.id === expense.id ? { ...exp, debit_account: e.target.value } : exp
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
                                [expense.id]: { ...prev[expense.id], debit: false },
                              }))
                            }
                          >
                            Save
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
                                [expense.id]: { ...(prev[expense.id] || {}), debit: true },
                              }))
                            }
                          >
                            Edit
                          </Button>
                        </div>
                      </div>
                    )}

                  </TableCell>


                  <TableCell className="text-center py-3">
                    <input
                      type="date"
                      className="border px-2 py-1 rounded text-sm"
                      value={
                        expense.value_date
                          ? new Date(expense.value_date).toISOString().split("T")[0]
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
                  <TableCell className="text-center py-3">
                    {formatCurrency(expense.amount)}
                  </TableCell>
                  <TableCell className="text-center py-3">{expense.currency || "INR"}</TableCell>
                  <TableCell className="text-center py-3">
                    {editingFields[expense.id]?.remarks ? (
                      <div className="flex items-center space-x-2 w-40">
                        <input
                          type="text"
                          className="border px-2 py-1 rounded text-sm text-center w-full"
                          value={expense.remarks}
                          onChange={(e) => {
                            const updated = processingExpenses.map((exp) =>
                              exp.id === expense.id ? { ...exp, remarks: e.target.value } : exp
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
                                [expense.id]: { ...prev[expense.id], remarks: false },
                              }))
                            }
                          >
                            Save
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2 w-40">
                        <span className="truncate max-w-[100px] text-sm">{expense.remarks}</span>
                        <div className="w-16">
                          <Button
                            size="icon"
                            variant="outline"
                            className="h-7 w-full px-1 text-sm"
                            onClick={() =>
                              setEditingFields((prev) => ({
                                ...prev,
                                [expense.id]: { ...(prev[expense.id] || {}), remarks: true },
                              }))
                            }
                          >
                            Edit
                          </Button>
                        </div>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-center py-3">{expense.unique_id || "—"}</TableCell>
                  <TableCell className="text-center py-3">
                    <Badge className="bg-green-100 text-green-800 border border-green-300">
                      Finance Approved
                    </Badge>
                  </TableCell>
                  {/* <TableCell className="text-center py-3">
                    <button
                      onClick={() =>
                        router.push(`/org/${orgId}/finance/payments/${expense.id}`)
                      }
                      title="View Expense"
                    >
                      <Eye className="w-4 h-4 text-gray-700" />
                    </button>
                  </TableCell> */}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

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
                      setSelectedColumns((prev) => prev.filter((c) => c !== col));
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
                exportToCSV();
                setShowExportModal(false);
              }}
              disabled={selectedColumns.length === 0}
            >
              Download CSV
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
