"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { expenses, expenseHistory } from "@/lib/db";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Check, X, FileText, AlertCircle, Edit } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { PolicyAlert } from "@/components/policy-alert";
import { Input } from "@/components/ui/input";
import supabase from "@/lib/supabase";
import ExpenseHistory from "./history/expense-history"; // Import the ExpenseHistory component

// Import Policy type but use Supabase directly for policies
interface Policy {
  id: string;
  org_id: string;
  expense_type: string;
  per_unit_cost: string | null;
  upper_limit: number | null;
  eligibility: string | null;
  conditions: string | null;
  created_at: string;
  updated_at: string;
}

export default function ViewExpensePage() {
  const router = useRouter();
  const params = useParams();
  // Remove userId from destructuring since it doesn't exist in OrgState
  const { organization, userRole } = useOrgStore();
  const orgId = organization?.id!;
  const expenseId = params.id as string;
  const slug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [updateLoading, setUpdateLoading] = useState(false);
  const [expense, setExpense] = useState<any>(null);
  const [hasVoucher, setHasVoucher] = useState(false);
  const [relevantPolicy, setRelevantPolicy] = useState<Policy | null>(null);
  const [isOverPolicy, setIsOverPolicy] = useState(false);
  // Get the current user ID from Supabase auth
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  // Custom amount state
  const [customAmount, setCustomAmount] = useState<string>("");
  const [showCustomAmountInput, setShowCustomAmountInput] = useState(false);

  // Fetch the current user ID when the component mounts
  useEffect(() => {
    async function getCurrentUser() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        setCurrentUserId(session.user.id);
      }
    }

    getCurrentUser();
  }, []);

  useEffect(() => {
    async function fetchExpense() {
      try {
        // Fetch the expense details
        const { data, error } = await expenses.getById(expenseId);
        if (error) {
          toast.error("Failed to load expense", {
            description: error.message,
          });
          router.push(`/org/${slug}/expenses`);
          return;
        }

        setExpense(data);

        // Fetch all policies for the organization using Supabase directly
        const { data: policiesData, error: policiesError } = await supabase
          .from("policies")
          .select("*")
          .eq("org_id", orgId)
          .order("created_at", { ascending: true });

        if (!policiesError && policiesData) {
          // Find the policy that matches this expense type
          const matchingPolicy = policiesData.find(
            (p) => p.expense_type === data.expense_type
          );

          if (matchingPolicy) {
            setRelevantPolicy(matchingPolicy);

            // Check if expense exceeds policy limit
            if (
              matchingPolicy.upper_limit &&
              data.amount > matchingPolicy.upper_limit
            ) {
              setIsOverPolicy(true);
            }
          }
        }

        // Check if this expense has a voucher
        const { data: voucherData, error: voucherError } = await supabase
          .from("vouchers")
          .select("id")
          .eq("expense_id", expenseId)
          .maybeSingle();

        if (!voucherError && voucherData) {
          setHasVoucher(true);
        } else {
          setHasVoucher(false);
        }
      } catch (error) {
        console.error("Error fetching expense:", error);
        toast.error("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchExpense();
  }, [expenseId, router, slug, orgId]);

  // Handle custom amount approval
  const handleApproveCustomAmount = async () => {
    try {
      setUpdateLoading(true);

      if (!customAmount || isNaN(Number(customAmount))) {
        toast.error("Please enter a valid amount");
        setUpdateLoading(false);
        return;
      }

      // Get current user ID
      if (!currentUserId) {
        throw new Error("User ID not found. Please log in again.");
      }

      // Get the current user name from localStorage
      let userName = 'System';
      try {
        const authStorage = localStorage.getItem('auth-storage');
        if (authStorage) {
          const authData = JSON.parse(authStorage);
          
          // Try multiple possible paths to find the user name
          if (authData?.state?.profile?.full_name) {
            userName = authData.state.profile.full_name;
          } 
          else if (authData?.state?.user?.profile?.full_name) {
            userName = authData.state.user.profile.full_name;
          }
          else if (authData?.profile?.full_name) {
            userName = authData.profile.full_name;
          }
        }
      } catch (e) {
        console.error('Error parsing auth storage:', e);
      }
      

      const approvedAmount = parseFloat(customAmount);

      // Prepare update data
      const updateData = {
        status: "approved",
        approver_id: currentUserId,
        approved_amount: approvedAmount,
      };

      // Update with Supabase
      const { data, error } = await supabase
        .from("expenses")
        .update(updateData)
        .eq("id", expenseId)
        .select()
        .single();

      if (error) {
        console.error("Error updating expense:", error);
        throw error;
      }

      // Add history record for the approval with the user name
      await expenseHistory.addChange({
        expense_id: expenseId,
        user_id: currentUserId,
        action_type: "approved",
        changed_field: "status",
        old_value: "submitted",
        new_value: "approved",
        user_name: userName // Include user name here
      });
      
      // Also add a record for the custom amount with the user name
      await expenseHistory.addChange({
        expense_id: expenseId,
        user_id: currentUserId,
        action_type: "updated",
        changed_field: "approved_amount",
        old_value: null,
        new_value: approvedAmount.toString(),
        user_name: userName // Include user name here for this record too
      });

      // Update local state
      setExpense({
        ...expense,
        status: "approved",
        approver_id: currentUserId,
        approved_amount: approvedAmount,
      });

      toast.success(
        `Expense approved with custom amount: ${new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
        }).format(approvedAmount)}`
      );

      // Navigate back after a short delay
      setTimeout(() => {
        router.push(`/org/${slug}/expenses`);
      }, 1000);
    } catch (error: any) {
      console.error("Approval error:", error);
      toast.error("Failed to approve expense", {
        description: error.message,
      });
    } finally {
      setUpdateLoading(false);
    }
  };

  // Main approve function with different approval types
 // Main approve function with different approval types
const handleApprove = async (approvalType?: "full" | "policy" | "custom") => {
  try {
    setUpdateLoading(true);

    if (approvalType === "custom") {
      // Just show the custom amount input
      setShowCustomAmountInput(true);
      setUpdateLoading(false);
      return;
    }

    // Get current user ID
    if (!currentUserId) {
      throw new Error("User ID not found. Please log in again.");
    }

    // Get the current user name from localStorage with additional logging
    let userName = 'System';
    try {
      const authStorage = localStorage.getItem('auth-storage');
      if (authStorage) {
        const authData = JSON.parse(authStorage);
        // Use the correct path to access the full_name based on your storage structure
        userName = authData?.state?.user?.profile?.full_name || 'Unknown User';
        console.log("Retrieved user name from storage:", userName);
        console.log("Full auth data structure:", JSON.stringify(authData).substring(0, 500) + "..."); // For debugging, show first 500 chars
      } else {
        console.log("No auth-storage found in localStorage");
      }
    } catch (e) {
      console.error('Error parsing auth storage:', e);
    }

    // Prepare update data
    let updateData: any = {
      status: "approved",
      approver_id: currentUserId,
    };

    // Set the approved_amount based on approval type
    if (approvalType === "policy" && relevantPolicy?.upper_limit) {
      updateData.approved_amount = relevantPolicy.upper_limit;
    } else if (approvalType === "full") {
      updateData.approved_amount = expense.amount;
    } else {
      // Default case - full approval
      updateData.approved_amount = expense.amount;
    }

    // Update with Supabase
    const { data, error } = await supabase
      .from("expenses")
      .update(updateData)
      .eq("id", expenseId)
      .select()
      .single();

    if (error) {
      console.error("Error updating expense:", error);
      throw error;
    }

    // Now add the history entry with explicit logging
    console.log("About to add history entry for approval with user_name:", userName);
    
    const historyResult = await expenseHistory.addChange({
      expense_id: expenseId,
      user_id: currentUserId,
      action_type: "approved",
      changed_field: "status",
      old_value: "submitted",
      new_value: "approved",
      user_name: userName // Include user name here
    });
    
    console.log("Result of adding approval history entry:", historyResult);
    
    // Also add a record for the approved amount with the user name
    console.log("About to add history entry for amount with user_name:", userName);
    
    const amountHistoryResult = await expenseHistory.addChange({
      expense_id: expenseId,
      user_id: currentUserId,
      action_type: "updated",
      changed_field: "approved_amount",
      old_value: null,
      new_value: updateData.approved_amount.toString(),
      user_name: userName // Include user name here for this record too
    });
    
    console.log("Result of adding amount history entry:", amountHistoryResult);

    // Update local state
    setExpense({
      ...expense,
      status: "approved",
      approver_id: currentUserId,
      approved_amount: updateData.approved_amount,
    });

    toast.success(
      approvalType === "policy"
        ? "Expense approved as per policy limit"
        : approvalType === "full"
        ? "Expense approved with full amount"
        : "Expense approved successfully"
    );

    // Navigate back after a short delay
    setTimeout(() => {
      router.push(`/org/${slug}/expenses`);
    }, 1000);
  } catch (error: any) {
    console.error("Approval error:", error);
    toast.error("Failed to approve expense", {
      description: error.message,
    });
  } finally {
    setUpdateLoading(false);
  }
};

  // Handle rejection
  const handleReject = async () => {
    try {
      setUpdateLoading(true);

      // Get current user ID
      if (!currentUserId) {
        throw new Error("User ID not found. Please log in again.");
      }

      // Get the current user name from localStorage
      let userName = 'System';
      try {
        const authStorage = localStorage.getItem('auth-storage');
        if (authStorage) {
          const authData = JSON.parse(authStorage);
          userName = authData?.user?.profile?.full_name || 'Unknown User';
        }
      } catch (e) {
        console.error('Error parsing auth storage:', e);
      }

      // Prepare update data
      const updateData = {
        status: "rejected",
        approver_id: currentUserId,
      };

      // Directly update with Supabase to bypass any permission issues
      const { data, error } = await supabase
        .from("expenses")
        .update(updateData)
        .eq("id", expenseId)
        .select()
        .single();

      if (error) {
        console.error("Error rejecting expense:", error);
        throw error;
      }

      // Add history record for the rejection with the user name
      await expenseHistory.addChange({
        expense_id: expenseId,
        user_id: currentUserId,
        action_type: "rejected",
        changed_field: "status",
        old_value: "submitted",
        new_value: "rejected",
        user_name: userName // Include user name here
      });

      // Update local state
      setExpense({
        ...expense,
        status: "rejected",
        approver_id: currentUserId,
      });

      toast.success("Expense rejected successfully");

      // Navigate back after a short delay
      setTimeout(() => {
        router.push(`/org/${slug}/expenses`);
      }, 1000);
    } catch (error: any) {
      console.error("Rejection error:", error);
      toast.error("Failed to reject expense", {
        description: error.message,
      });
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleViewReceipt = async () => {
    if (expense.receipt?.path) {
      try {
        const { url, error } = await expenses.getReceiptUrl(
          expense.receipt.path
        );
        if (error) {
          console.error("Error getting receipt URL:", error);
          toast.error("Failed to load receipt");
          return;
        }
        if (url) {
          window.open(url, "_blank");
        }
      } catch (err) {
        console.error("Error opening receipt:", err);
        toast.error("Failed to open receipt");
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!expense) {
    return null;
  }

  // Helper function to format field names
  const formatFieldName = (name: string) => {
    return name
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => router.push(`/org/${slug}/expenses`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Expenses
        </Button>

        {userRole !== "member" && expense.status === "submitted" && (
          <div className="flex items-center space-x-2">
            {showCustomAmountInput ? (
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2">
                    ₹
                  </span>
                  <Input
                    type="number"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    className="pl-8 pr-3 py-2"
                    placeholder="Enter amount"
                  />
                </div>
                <Button
                  onClick={handleApproveCustomAmount}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={updateLoading || !customAmount}
                >
                  {updateLoading ? (
                    <Spinner size="sm" className="mr-2" />
                  ) : (
                    <Check className="mr-2 h-4 w-4" />
                  )}
                  Confirm
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowCustomAmountInput(false)}
                  disabled={updateLoading}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="bg-white"
                  onClick={handleReject}
                  disabled={updateLoading}
                >
                  {updateLoading ? (
                    <Spinner size="sm" className="mr-2" />
                  ) : (
                    <X className="mr-2 h-4 w-4" />
                  )}
                  Reject
                </Button>

                {isOverPolicy ? (
                  <>
                    <Button
                      onClick={() => handleApprove("policy")}
                      className="bg-green-600 hover:bg-green-700"
                      disabled={updateLoading}
                    >
                      {updateLoading ? (
                        <Spinner size="sm" className="mr-2" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      Approve as per policy
                    </Button>

                    <Button
                      onClick={() => handleApprove("full")}
                      className="bg-amber-600 hover:bg-amber-700"
                      disabled={updateLoading}
                    >
                      {updateLoading ? (
                        <Spinner size="sm" className="mr-2" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      Approve full amount
                    </Button>

                    <Button
                      onClick={() => handleApprove("custom")}
                      className="bg-blue-600 hover:bg-blue-700"
                      disabled={updateLoading}
                    >
                      {updateLoading ? (
                        <Spinner size="sm" className="mr-2" />
                      ) : (
                        <Edit className="mr-2 h-4 w-4" />
                      )}
                      Custom amount
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={() => handleApprove("full")}
                      className="bg-green-600 hover:bg-green-700"
                      disabled={updateLoading}
                    >
                      {updateLoading ? (
                        <Spinner size="sm" className="mr-2" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      Approve
                    </Button>

                    <Button
                      onClick={() => handleApprove("custom")}
                      className="bg-blue-600 hover:bg-blue-700"
                      disabled={updateLoading}
                    >
                      {updateLoading ? (
                        <Spinner size="sm" className="mr-2" />
                      ) : (
                        <Edit className="mr-2 h-4 w-4" />
                      )}
                      Custom amount
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {isOverPolicy && relevantPolicy && (
        <PolicyAlert expense={expense} policy={relevantPolicy} />
      )}

      {/* Two column layout for expense details and history */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: Expense Details Card (original code) */}
        <Card>
          <CardHeader>
            <CardTitle>Expense Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Expense Type
                </p>
                <p>{expense.expense_type}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Amount
                </p>
                <p className={isOverPolicy ? "text-red-600 font-medium" : ""}>
                  {new Intl.NumberFormat("en-IN", {
                    style: "currency",
                    currency: "INR",
                  }).format(expense.amount)}
                  {isOverPolicy && (
                    <span className="ml-2 text-sm text-red-600">
                      (Exceeds policy)
                    </span>
                  )}
                </p>
              </div>

              {/* Show approved amount if it exists */}
              {expense.approved_amount !== null &&
                expense.approved_amount !== undefined && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      Approved Amount
                    </p>
                    <p className="text-green-600 font-medium">
                      {new Intl.NumberFormat("en-IN", {
                        style: "currency",
                        currency: "INR",
                      }).format(expense.approved_amount)}
                    </p>
                  </div>
                )}

              <div>
                <p className="text-sm font-medium text-muted-foreground">Date</p>
                <p>{new Date(expense.date).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Status
                </p>
                <p
                  className={`${
                    expense.status === "approved"
                      ? "text-green-600"
                      : expense.status === "rejected"
                      ? "text-red-600"
                      : "text-amber-600"
                  }`}
                >
                  {expense.status.charAt(0).toUpperCase() +
                    expense.status.slice(1)}
                </p>
              </div>

              {expense.approver && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Approver
                  </p>
                  <p>{expense.approver.full_name || "—"}</p>
                </div>
              )}

              {relevantPolicy && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Policy Limit
                  </p>
                  <p>
                    {new Intl.NumberFormat("en-IN", {
                      style: "currency",
                      currency: "INR",
                    }).format(relevantPolicy.upper_limit || 0)}
                  </p>
                </div>
              )}
            </div>

            {/* Receipt section with View Receipt button */}
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">
                Receipt
              </p>
              {expense.receipt ? (
                <Button
                  variant="outline"
                  onClick={handleViewReceipt}
                  className="flex items-center"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  View Receipt ({expense.receipt.filename || "Document"})
                </Button>
              ) : hasVoucher ? (
                <Button
                  variant="outline"
                  className="flex items-center text-blue-600"
                  onClick={() =>
                    router.push(`/org/${slug}/expenses/${expense.id}/voucher`)
                  }
                >
                  <FileText className="mr-2 h-4 w-4" />
                  View Voucher
                </Button>
              ) : (
                <p className="text-muted-foreground">
                  No receipt or voucher available
                </p>
              )}
            </div>

            {/* Custom fields section */}
            {expense.custom_fields &&
              Object.keys(expense.custom_fields).length > 0 && (
                <div className="grid grid-cols-2 gap-4 mt-4">
                  {Object.entries(expense.custom_fields).map(([key, value]) => (
                    <div key={key}>
                      <p className="text-sm font-medium text-muted-foreground">
                        {formatFieldName(key)}
                      </p>
                      <p>{(value as string) || "—"}</p>
                    </div>
                  ))}
                </div>
              )}
          </CardContent>
        </Card>

        {/* Right column: Expense History */}
        <ExpenseHistory expenseId={expenseId} />
      </div>
    </div>
  );
}