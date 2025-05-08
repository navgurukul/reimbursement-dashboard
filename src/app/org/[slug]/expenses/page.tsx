"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { orgSettings, expenses } from "@/lib/db";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Trash,
} from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDate } from "@/lib/utils";
import supabase from "@/lib/supabase";

const defaultExpenseColumns = [
  { key: "date", label: "Date", visible: true },
  { key: "category", label: "Category", visible: true },
  { key: "amount", label: "Amount", visible: true },
  { key: "description", label: "Description", visible: true },
  { key: "receipt", label: "Receipt", visible: true },
  { key: "approver", label: "Approver", visible: true },
];

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
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
    pending: 0,
    rejected: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"my" | "pending" | "all">("my");

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
        const expenseColumns = s?.expense_columns ?? defaultExpenseColumns;
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
        // We need to check for vouchers by expense ID
        // In your useEffect, modify the voucher checking code:
        // Fixed processExpenseData function to avoid join queries that cause 400 errors
        const processExpenseData = async (expensesList: any[]) => {
          const processedExpenses = [...expensesList];

          // First, collect all expense ids for a single query to vouchers
          const expenseIds = processedExpenses.map((exp) => exp.id);

          // Get all vouchers in one query for better performance - without trying to join profiles
          const { data: allVouchers, error: vouchersError } = await supabase
            .from("vouchers")
            .select("*")
            .in("expense_id", expenseIds);

          if (vouchersError) {
            console.error("Error fetching vouchers:", vouchersError);
            return processedExpenses;
          }

          // Create a map of vouchers by expense_id for quick lookup
          const vouchersByExpenseId: Record<string, any> = {};
          if (allVouchers && allVouchers.length > 0) {
            allVouchers.forEach((voucher) => {
              vouchersByExpenseId[voucher.expense_id] = voucher;
            });
          }

          // Collect all approver_ids from both expenses and vouchers for a single query
          const approverIds = new Set<string>();

          // Add expense approver_ids
          processedExpenses.forEach((exp) => {
            if (exp.approver_id) {
              approverIds.add(exp.approver_id);
            }
          });

          // Add voucher approver_ids
          allVouchers?.forEach((voucher) => {
            if (voucher.approver_id) {
              approverIds.add(voucher.approver_id);
            }
          });

          // Only query profiles if we have approver_ids
          let approverProfiles: Record<string, any> = {};
          if (approverIds.size > 0) {
            const { data: profiles } = await supabase
              .from("profiles")
              .select("user_id, full_name")
              .in("user_id", Array.from(approverIds));

            if (profiles && profiles.length > 0) {
              // Create a lookup map by user_id
              profiles.forEach((profile) => {
                approverProfiles[profile.user_id] = profile;
              });
            }
          }

          // Process each expense
          for (const exp of processedExpenses) {
            try {
              // Check if this expense has a voucher
              const voucher = vouchersByExpenseId[exp.id];

              if (voucher) {
                // If voucher exists, mark the expense
                exp.hasVoucher = true;
                exp.voucherId = voucher.id;

                // Check if voucher has an approver_id
                if (
                  voucher.approver_id &&
                  approverProfiles[voucher.approver_id]
                ) {
                  // If both expense and voucher have different approver_ids, prioritize the voucher's
                  exp.approver = {
                    full_name: approverProfiles[voucher.approver_id].full_name,
                    user_id: voucher.approver_id,
                  };
                  console.log(
                    `Voucher approver set for expense ${exp.id}:`,
                    exp.approver
                  );
                }
              }

              // If no voucher approver but expense has an approver_id, use that
              if (
                (!exp.approver || !exp.approver.full_name) &&
                exp.approver_id &&
                approverProfiles[exp.approver_id]
              ) {
                exp.approver = {
                  full_name: approverProfiles[exp.approver_id].full_name,
                  user_id: exp.approver_id,
                };
                console.log(
                  `Expense approver set for expense ${exp.id}:`,
                  exp.approver
                );
              }
            } catch (error) {
              console.error(`Error processing expense ${exp.id}:`, error);
            }
          }

          return processedExpenses;
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
        pending: all.filter((e) => e.status === "submitted").length,
        rejected: all.filter((e) => e.status === "rejected").length,
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

  const handleNew = () => {
    router.push(`/org/${slug}/expenses/new`);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await expenses.delete(id);
      if (error) throw error;
      toast.success("Expense deleted successfully");
      // Refresh the expenses list
      window.location.reload();
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
        <TabsList>
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {/* stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Total</CardTitle>
                </CardHeader>
                <CardContent>{stats.total}</CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Approved</CardTitle>
                </CardHeader>
                <CardContent className="text-green-600">
                  {stats.approved}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Pending</CardTitle>
                </CardHeader>
                <CardContent className="text-amber-600">
                  {stats.pending}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Rejected</CardTitle>
                </CardHeader>
                <CardContent className="text-red-600">
                  {stats.rejected}
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
                <Button variant="outline">
                  <Filter className="mr-2 h-4 w-4" />
                  Filters
                </Button>
                <Button variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </div>
            </div>

            {/* table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
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
                          colSpan={columns.filter((c) => c.visible).length + 2}
                          className="text-center py-4"
                        >
                          Loading…
                        </TableCell>
                      </TableRow>
                    ) : getCurrent().length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={columns.filter((c) => c.visible).length + 2}
                          className="text-center py-4 text-muted-foreground"
                        >
                          No expenses.
                        </TableCell>
                      </TableRow>
                    ) : (
                      getCurrent().map((exp) => (
                        <TableRow key={exp.id}>
                          {columns
                            .filter((c) => c.visible)
                            .map((c) => (
                              <TableCell key={c.key}>
                                {c.key === "amount" ? (
                                  formatCurrency(exp[c.key])
                                ) : c.key === "date" ? (
                                  formatDate(exp[c.key])
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
                                ) : c.key === "description" ? (
                                  getExpenseValue(exp, "description")
                                ) : typeof exp[c.key] === "object" &&
                                  exp[c.key] !== null ? (
                                  JSON.stringify(exp[c.key])
                                ) : (
                                  exp[c.key] || "—"
                                )}
                              </TableCell>
                            ))}
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded-full text-xs ${
                                exp.status === "approved"
                                  ? "bg-green-100 text-green-800"
                                  : exp.status === "rejected"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {exp.status.charAt(0).toUpperCase() +
                                exp.status.slice(1)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  router.push(`/org/${slug}/expenses/${exp.id}`)
                                }
                              >
                                View
                              </Button>
                              {exp.status === "submitted" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    router.push(
                                      `/org/${slug}/expenses/${exp.id}/edit`
                                    )
                                  }
                                >
                                  Edit
                                </Button>
                              )}
                              {(userRole === "admin" ||
                                userRole === "owner") && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600"
                                  onClick={() => handleDelete(exp.id)}
                                >
                                  Delete
                                </Button>
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
