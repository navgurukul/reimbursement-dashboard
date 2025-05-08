"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { expenses, vouchers } from "@/lib/db";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ArrowLeft, Download } from "lucide-react";
import { formatDate } from "@/lib/utils";
import supabase from "@/lib/supabase";

export default function VoucherViewPage() {
  const router = useRouter();
  const params = useParams();
  const expenseId = params.id as string;
  const slug = params.slug as string;
  const { organization } = useOrgStore();

  const [expense, setExpense] = useState<any>(null);
  const [voucher, setVoucher] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userSignatureUrl, setUserSignatureUrl] = useState<string | null>(null);
  const [managerSignatureUrl, setManagerSignatureUrl] = useState<string | null>(
    null
  );
  const [approverName, setApproverName] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        // Load the expense data
        const { data: expenseData, error: expenseError } =
          await expenses.getById(expenseId);

        if (expenseError) {
          throw new Error(`Failed to load expense: ${expenseError.message}`);
        }

        setExpense(expenseData);

        // Load the voucher data - using the fixed function that avoids the join
        const { data: voucherData, error: voucherError } =
          await vouchers.getByExpenseId(expenseId);

        if (voucherError) {
          throw new Error(`Failed to load voucher: ${voucherError.message}`);
        }

        if (!voucherData) {
          throw new Error("No voucher found for this expense");
        }

        setVoucher(voucherData);

        // Get signature URLs if available
        if (voucherData.signature_url) {
          const { url: signatureUrl } = await vouchers.getSignatureUrl(
            voucherData.signature_url
          );
          setUserSignatureUrl(signatureUrl);
        }

        if (voucherData.manager_signature_url) {
          const { url: managerUrl } = await vouchers.getSignatureUrl(
            voucherData.manager_signature_url
          );
          setManagerSignatureUrl(managerUrl);
        }

        // Get approver information - get it from the voucher first, then fallback to expense
        const approverIdToUse =
          voucherData.approver_id || expenseData.approver_id;

        if (approverIdToUse) {
          // Fetch approver profile directly with a simple query
          const { data: approverProfile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", approverIdToUse)
            .single();

          if (approverProfile) {
            setApproverName(approverProfile.full_name);
          }
        }
      } catch (error: any) {
        console.error("Error fetching voucher data:", error);
        toast.error(error.message || "Failed to load voucher");
      } finally {
        setLoading(false);
      }
    }

    if (expenseId) {
      fetchData();
    }
  }, [expenseId]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!voucher || !expense) {
    return (
      <div className="max-w-[800px] mx-auto py-6">
        <Button
          variant="ghost"
          onClick={() => router.push(`/org/${slug}/expenses`)}
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Expenses
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Voucher Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-500">
              No voucher was found for this expense. This expense may not have
              been created with a voucher.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-[800px] mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <Button
          variant="ghost"
          onClick={() => router.push(`/org/${slug}/expenses`)}
          className="text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Expenses
        </Button>

        <Button variant="outline">
          <Download className="mr-2 h-4 w-4" />
          Download PDF
        </Button>
      </div>

      <Card className="shadow-sm mb-6">
        <CardHeader className="bg-gray-50 border-b">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-medium">Voucher</CardTitle>
            <div className="py-1 px-3 rounded-full text-xs bg-amber-100 text-amber-800">
              {expense.status.charAt(0).toUpperCase() + expense.status.slice(1)}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          <div className="border-b pb-6 mb-6">
            <h3 className="text-base font-medium mb-4">Voucher Details</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-sm text-gray-500 mb-1">Your Name</div>
                <div className="font-medium">{voucher.your_name}</div>
              </div>

              <div>
                <div className="text-sm text-gray-500 mb-1">Amount</div>
                <div className="font-medium">
                  {formatCurrency(voucher.amount)}
                </div>
              </div>

              <div>
                <div className="text-sm text-gray-500 mb-1">Date</div>
                <div className="font-medium">{formatDate(expense.date)}</div>
              </div>

              <div>
                <div className="text-sm text-gray-500 mb-1">Credit Person</div>
                <div className="font-medium">{voucher.credit_person}</div>
              </div>

              <div>
                <div className="text-sm text-gray-500 mb-1">Approver</div>
                <div className="font-medium">{approverName || "—"}</div>
              </div>

              <div className="md:col-span-2">
                <div className="text-sm text-gray-500 mb-1">Purpose</div>
                <div className="border rounded-md p-3 bg-gray-50">
                  {voucher.purpose}
                </div>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-base font-medium mb-4">Signatures</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <div className="text-sm text-gray-500 mb-2">Your Signature</div>
                {userSignatureUrl ? (
                  <div className="border rounded-md p-2 bg-white">
                    <img
                      src={userSignatureUrl}
                      alt="Your signature"
                      className="max-h-24 mx-auto"
                    />
                  </div>
                ) : (
                  <div className="text-amber-500 text-sm">
                    No signature provided
                  </div>
                )}
              </div>

              <div>
                <div className="text-sm text-gray-500 mb-2">
                  Approver Signature
                </div>
                {managerSignatureUrl ? (
                  <div className="border rounded-md p-2 bg-white">
                    <img
                      src={managerSignatureUrl}
                      alt="Approver signature"
                      className="max-h-24 mx-auto"
                    />
                  </div>
                ) : (
                  <div className="text-amber-500 text-sm">
                    No signature provided
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-sm text-gray-500">
        <p>Voucher ID: {voucher.id}</p>
        <p>Created: {formatDate(voucher.created_at)}</p>
      </div>
    </div>
  );
}
