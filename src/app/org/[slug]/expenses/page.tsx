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
import { PlusCircle, Filter, Download } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";

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
      } else {
        setColumns(s?.expense_columns ?? []);
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
  }, [orgId, userRole]);

  const getCurrent = () => {
    if (activeTab === "my") return expensesData;
    if (activeTab === "pending") return pendingApprovals;
    return allExpenses;
  };

  const handleNew = () => {
    router.push(`/org/${slug}/expenses/new`);
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
                                {c.key === "amount"
                                  ? formatCurrency(exp[c.key])
                                  : c.key === "date"
                                  ? new Date(exp[c.key]).toLocaleDateString()
                                  : c.key === "receipt"
                                  ? exp[c.key]?.filename || "No receipt"
                                  : exp[c.key]}
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
                          <TableCell className="space-x-2">
                            {/* My tab */}
                            {activeTab === "my" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    router.push(
                                      `/org/${slug}/expenses/${exp.id}`
                                    )
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
                              </>
                            )}
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
// TODO:
// - add filters
// - add export
// - add search
// - add pagination
