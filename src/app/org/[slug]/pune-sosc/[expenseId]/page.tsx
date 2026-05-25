"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Clock,
  FileText,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import supabase from "@/lib/supabase";

import {
  expenses,
  expenseEvents,
} from "@/lib/db";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { useOrgStore } from "@/store/useOrgStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExpenseStatusBadge } from "@/components/ExpenseStatusBadge";
import ReceiptPreview from "@/components/ReceiptPreview";
import VoucherPreview from "@/components/VoucherPreview";
import ExpenseHistory from "../../expenses/[id]/history/expense-history";
import { ExpenseComments } from "../../expenses/[id]/history/expense-comments";
import { Skeleton } from "@/components/ui/skeleton";

// Helper function to get signature URL from different buckets
async function getSignatureUrl(path: string): Promise<string | null> {
  if (!path) return null;

  try {
    const { data, error } = await supabase.storage
      .from("voucher-signatures")
      .createSignedUrl(path, 3600);

    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  } catch (e) {
    console.log("Error in voucher-signatures bucket:", e);
  }

  try {
    const { data, error } = await supabase.storage
      .from("user-signatures")
      .createSignedUrl(path, 3600);

    if (!error && data?.signedUrl) {
      return data.signedUrl;
    }
  } catch (e) {
    console.log("Error in user-signatures bucket:", e);
  }

  return null;
}

export default function PuneSoSCExpenseDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const { organization } = useOrgStore();

  const slug = params.slug as string;
  const expenseId = params.expenseId as string;

  const [loading, setLoading] = useState(true);
  const [expense, setExpense] = useState<any>(null);
  const [eventTitle, setEventTitle] = useState<string>("N/A");
  const [hasVoucher, setHasVoucher] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadExpense() {
      if (!expenseId) return;

      try {
        setLoading(true);

        const { data, error } = await expenses.getById(expenseId);
        if (error || !data) {
          toast.error("Failed to load expense details");
          if (!cancelled) setExpense(null);
          return;
        }

        if (cancelled) return;

        setExpense(data);

        if (data.signature_url) {
          const url = await getSignatureUrl(data.signature_url);
          if (!cancelled) setSignatureUrl(url);
        } else {
          if (!cancelled) setSignatureUrl(null);
        }

        if (data.event_id) {
          const { data: eventData } = await expenseEvents.getById(data.event_id);
          if (!cancelled) setEventTitle(eventData?.title || "N/A");
        } else {
          setEventTitle("N/A");
        }

        const { data: voucherData, error: voucherError } = await supabase
          .from("vouchers")
          .select("id")
          .eq("expense_id", expenseId)
          .maybeSingle();

        if (!cancelled) setHasVoucher(!voucherError && !!voucherData);
      } catch (error: any) {
        toast.error("Failed to load expense details", {
          description: error?.message,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadExpense();

    return () => {
      cancelled = true;
    };
  }, [expenseId]);

  if (!loading && !expense) {
    return (
      <div className="space-y-4 p-6">
        <Button
          variant="ghost"
          className="w-fit gap-2"
          onClick={() => router.push(`/org/${slug}/pune-sosc`)}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to CP Pune-SoSC
        </Button>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Expense not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-0">
      <div className="flex items-center justify-between gap-4">
        <Button
          variant="link"
          className="w-fit gap-2 -ml-2 text-gray-600 hover:text-gray-900"
          onClick={() => router.push(`/org/${slug}/pune-sosc`)}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Pune SoSC
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-sm overflow-hidden">
            <CardHeader className="border-b bg-gray-50/60">
              <CardTitle className="text-lg flex items-center gap-2 ">
                Pune SoSC Expense Details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div>
                {loading ? (
                  <div className="space-y-4">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-4 w-full" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Expense Type</p>
                      <p>{expense.expense_type || "Not Provided"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Event Name</p>
                      <p>{eventTitle}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Project of Expense</p>
                      <p>{expense.location || "CP Pune-SoSC"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Unique ID</p>
                      <p>{expense.unique_id || expense.id}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Amount</p>
                      <p>{formatCurrency(Number(expense.amount || 0))}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Approved Amount</p>
                      <p className="text-sm text-green-600 mt-1">{expense.approved_amount !== null && expense.approved_amount !== undefined ? formatCurrency(Number(expense.approved_amount)) : "NA"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Date</p>
                      <p>{expense.date ? new Date(expense.date).toLocaleDateString("en-GB") : "—"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Status</p>
                      <p className={`text-sm mt-1 capitalize ${expense.status === 'approved' ? 'text-green-600' : 'text-gray-900'}`}>
                        {expense.status}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Approver</p>
                      <p>{expense.approver?.full_name || expense.approver_id || "—"}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Receipt Preview Section */}
              {!loading && expense?.receipt && (
                <ReceiptPreview expense={expense} />
              )}

              {!loading && hasVoucher && (
                <div className="space-y-4 mt-6">
                  <VoucherPreview
                    expense={expense}
                    expenseId={typeof expenseId === "string" ? expenseId : ""}
                  />
                </div>
              )}

              {/* Signature Section */}
              {signatureUrl && (
                <div className="mt-6">
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    User Signature
                  </p>
                  <div className="border rounded-md p-4 bg-white">
                    <img
                      src={signatureUrl}
                      alt="Signature"
                      className="max-h-24 mx-auto"
                    />
                  </div>
                </div>
              )}

              {!loading && expense?.custom_fields?.description && (
                <div className="space-y-2">
                  <h3 className="text-sm text-gray-500">Description</h3>
                  <div className="border rounded-md px-4 py-3 flex justify-between items-center bg-white">
                    <p className="text-sm text-gray-700">{expense.custom_fields.description}</p>
                  </div>
                </div>
              )}

              {!loading && !expense?.receipt && !hasVoucher && (
                <p className="text-sm text-muted-foreground">
                  No receipt or voucher available
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="border-b bg-gray-50/60">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                Activity History
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[500px] overflow-auto">
              {loading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-3 w-3/4" />
                    </div>
                  ))}
                </div>
              ) : (
                <ExpenseHistory expenseId={typeof expenseId === "string" ? expenseId : ""} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-6 w-32 mb-4" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : (
                <ExpenseComments expenseId={typeof expenseId === "string" ? expenseId : ""} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
