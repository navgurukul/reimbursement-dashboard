"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { useOrgStore } from "@/store/useOrgStore";
import { organizations } from "@/lib/db";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, DollarSign, Users } from "lucide-react";
import supabase from "@/lib/supabase";

interface DashboardStats {
  totalPaidReimbursements: number;
  teamMembersCount: number;
  monthlyPaidAmount: number;
}

export default function OrgDashboard() {
  const { organization } = useOrgStore();
  const [stats, setStats] = useState<DashboardStats>({
    totalPaidReimbursements: 0,
    teamMembersCount: 0,
    monthlyPaidAmount: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!organization?.id) return;

      try {
        setLoading(true);

        // Fetch paid expenses for total reimbursements
        const { data: paidExpenses, error: expensesError } = await supabase
          .from("expense_new")
          .select("approved_amount, payment_status, created_at")
          .eq("org_id", organization.id)
          .eq("payment_status", "paid");

        if (expensesError) throw expensesError;

        // Calculate total paid reimbursements
        const totalPaid =
          paidExpenses?.reduce((sum, expense) => {
            return sum + (parseFloat(expense.approved_amount) || 0);
          }, 0) || 0;

        // Calculate monthly paid amount (current month)
        const currentMonth = new Date();
        currentMonth.setDate(1);
        const monthlyPaid =
          paidExpenses
            ?.filter((expense) => {
              const expenseDate = new Date(expense.created_at);
              return expenseDate >= currentMonth;
            })
            .reduce((sum, expense) => {
              return sum + (parseFloat(expense.approved_amount) || 0);
            }, 0) || 0;

        // Fetch team members count
        const { data: teamMembers, error: teamError } = await supabase
          .from("organization_users")
          .select("id")
          .eq("org_id", organization.id);

        if (teamError) throw teamError;

        setStats({
          totalPaidReimbursements: totalPaid,
          teamMembersCount: teamMembers?.length || 0,
          monthlyPaidAmount: monthlyPaid,
        });
      } catch (error: any) {
        console.error("Error fetching dashboard data:", error);
        toast.error("Failed to load dashboard data", {
          description: error.message,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [organization?.id]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome to {organization?.name}'s dashboard
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-28 mb-2" />
                <Skeleton className="h-3 w-40" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Reimbursements
              </CardTitle>
              <span className="h-4 w-4 text-muted-foreground">₹</span>
              {/* <DollarSign className="h-4 w-4 text-muted-foreground" /> */}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(stats.totalPaidReimbursements)}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.totalPaidReimbursements > 0
                  ? "Total paid reimbursements"
                  : "No reimbursements yet"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Team Members
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.teamMembersCount}</div>
              <p className="text-xs text-muted-foreground">
                {stats.teamMembersCount === 1
                  ? "Just you for now"
                  : `${stats.teamMembersCount} team members`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Monthly Overview
              </CardTitle>
              <BarChart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatCurrency(stats.monthlyPaidAmount)}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.monthlyPaidAmount > 0
                  ? "Paid this month"
                  : "No activity this month"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
