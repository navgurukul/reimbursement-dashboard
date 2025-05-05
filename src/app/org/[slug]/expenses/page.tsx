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
       const { data, error } = await expenses.getByOrgAndUser(orgId, user?.id!);
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
   const processExpenseData = async (expensesList: any[]) => {
     const processedExpenses = [...expensesList];

     for (const exp of processedExpenses) {
       try {
         // Check if this expense has a voucher - use more explicit query format
         const { data: voucherData, error } = await supabase
           .from("vouchers")
           .select("*")
           .eq("expense_id", exp.id)
           .maybeSingle(); // Use maybeSingle instead of single to avoid errors

         if (!error && voucherData) {
           // If voucher exists, mark the expense and add needed info
           exp.hasVoucher = true;
           exp.voucherId = voucherData.id;

           // If approver is missing, try to get it from the voucher
           if (!exp.approver || !exp.approver.full_name) {
             // For debugging
             console.log("Found voucher for expense", exp.id, voucherData);

             // Try to get approver info if available
             if (voucherData.created_by) {
               // Look up profile by created_by
               const { data: approverData } = await supabase
                 .from("profiles")
                 .select("full_name")
                 .eq("user_id", voucherData.created_by)
                 .maybeSingle();

               if (approverData && approverData.full_name) {
                 exp.approver = { full_name: approverData.full_name };
               }
             }
           }
         }
       } catch (error) {
         // Log the error for debugging
         console.error(`Error checking voucher for expense ${exp.id}:`, error);
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
