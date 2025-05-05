// File path: src/app/org/[slug]/expenses/[id]/voucher/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { expenses } from "@/lib/db";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/utils";
import supabase from "@/lib/supabase";

export default function VoucherViewPage() {
  const router = useRouter();
  const { slug, id } = useParams();
  const { organization } = useOrgStore();

  const [expense, setExpense] = useState<any>(null);
  const [voucher, setVoucher] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [signatureUrls, setSignatureUrls] = useState({
    user: "",
    approver: "",
  });

  useEffect(() => {
    async function fetchData() {
      try {
        // Load the expense
        const { data: expenseData, error: expenseError } =
          await expenses.getById(id as string);
        if (expenseError) throw expenseError;

        setExpense(expenseData);

        // Load the voucher
        const { data: voucherData, error: voucherError } = await supabase
          .from("vouchers")
          .select("*")
          .eq("expense_id", id)
          .single();

        if (voucherError) {
          console.error("Voucher fetch error:", voucherError);
          return;
        }

        if (voucherData) {
          setVoucher(voucherData);
          console.log("Voucher data loaded:", voucherData);

          // Get signature URLs if they exist
          if (voucherData.signature_url) {
            try {
              // Important: Use the full path stored in the database - don't try to extract just the filename
              console.log("Getting signed URL for:", voucherData.signature_url);

              // Generate a signed URL with a token
              const { data: sigData, error: sigError } = await supabase.storage
                .from("voucher-signatures")
                .createSignedUrl(voucherData.signature_url, 3600);

              if (sigError) {
                console.error("User signature error:", sigError);

                // If the error is due to the full path not working, try finding the file in the bucket
                const { data: fileList } = await supabase.storage
                  .from("voucher-signatures")
                  .list();

                if (fileList) {
                  // Log all available files to help debug
                  console.log(
                    "Available files in voucher-signatures bucket:",
                    fileList.map((f) => f.name)
                  );

                  // Look for a filename match in the bucket
                  const filename = voucherData.signature_url.split("/").pop();
                  const matchingFile = fileList.find(
                    (f) => f.name === filename
                  );

                  if (matchingFile) {
                    console.log("Found matching file:", matchingFile.name);

                    // Get signed URL for the file by name only
                    const { data: matchData } = await supabase.storage
                      .from("voucher-signatures")
                      .createSignedUrl(matchingFile.name, 3600);

                    if (matchData) {
                      console.log(
                        "Got signed URL for matched file:",
                        matchData.signedUrl
                      );
                      setSignatureUrls((prev) => ({
                        ...prev,
                        user: matchData.signedUrl,
                      }));
                    }
                  }
                }
              } else if (sigData) {
                console.log(
                  "User signature signed URL created:",
                  sigData.signedUrl
                );
                setSignatureUrls((prev) => ({
                  ...prev,
                  user: sigData.signedUrl,
                }));
              }
            } catch (error) {
              console.error("Error processing user signature:", error);
            }
          }

          // Similar approach for manager signature
          if (voucherData.manager_signature_url) {
            try {
              console.log(
                "Getting signed URL for:",
                voucherData.manager_signature_url
              );

              const { data: managerSigData, error: managerSigError } =
                await supabase.storage
                  .from("voucher-signatures")
                  .createSignedUrl(voucherData.manager_signature_url, 3600);

              if (managerSigError) {
                console.error("Manager signature error:", managerSigError);

                // Try the same filename-only approach if full path fails
                const { data: fileList } = await supabase.storage
                  .from("voucher-signatures")
                  .list();

                if (fileList) {
                  const filename = voucherData.manager_signature_url
                    .split("/")
                    .pop();
                  const matchingFile = fileList.find(
                    (f) => f.name === filename
                  );

                  if (matchingFile) {
                    const { data: matchData } = await supabase.storage
                      .from("voucher-signatures")
                      .createSignedUrl(matchingFile.name, 3600);

                    if (matchData) {
                      setSignatureUrls((prev) => ({
                        ...prev,
                        approver: matchData.signedUrl,
                      }));
                    }
                  }
                }
              } else if (managerSigData) {
                console.log(
                  "Manager signature signed URL created:",
                  managerSigData.signedUrl
                );
                setSignatureUrls((prev) => ({
                  ...prev,
                  approver: managerSigData.signedUrl,
                }));
              }
            } catch (error) {
              console.error("Error processing manager signature:", error);
            }
          }
        }
      } catch (error: any) {
        console.error("Fetch data error:", error);
        toast.error("Failed to load voucher data", {
          description: error.message,
        });
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">Loading...</div>
    );
  }

  if (!voucher) {
    return (
      <div className="max-w-4xl mx-auto py-8">
        <Button
          variant="outline"
          className="mb-6"
          onClick={() => router.back()}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <Card>
          <CardContent className="py-10 text-center">
            <h2 className="text-xl font-medium">
              No voucher found for this expense
            </h2>
            <p className="text-muted-foreground mt-2">
              This expense doesn't have an associated voucher.
            </p>
            <Button
              className="mt-4"
              onClick={() => router.push(`/org/${slug}/expenses/${id}`)}
            >
              View Expense Details
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>

        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" /> Print Voucher
        </Button>
      </div>

      <Card className="print:shadow-none">
        <CardHeader className="border-b">
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl">Cash Voucher</CardTitle>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">
                Voucher #: {voucher.id?.substring(0, 8) || "N/A"}
              </p>
              <p className="text-sm text-muted-foreground">
                Date: {formatDate(expense?.date || new Date())}
              </p>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <h3 className="text-sm font-medium mb-1">Prepared By</h3>
              <p>{voucher.your_name || "N/A"}</p>
            </div>
            <div>
              <h3 className="text-sm font-medium mb-1">Amount</h3>
              <p className="text-xl font-semibold">
                ${parseFloat(voucher.amount || 0).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-medium mb-1">Purpose</h3>
            <p>{voucher.purpose || "N/A"}</p>
          </div>

          <div className="mb-6">
            <h3 className="text-sm font-medium mb-1">Paid To</h3>
            <p>{voucher.credit_person || "N/A"}</p>
          </div>

          <div className="grid grid-cols-2 gap-6 mt-8 mb-4">
            <div className="text-center">
              <div className="h-24 border rounded-md mb-2 flex items-center justify-center">
                {signatureUrls.approver ? (
                  <img
                    src={signatureUrls.approver}
                    alt="Approver Signature"
                    className="max-h-20 object-contain"
                    onError={(e) => {
                      console.error("Error loading approver signature image");
                      e.currentTarget.onerror = null;
                      e.currentTarget.style.display = "none";
                      e.currentTarget.parentElement!.innerHTML =
                        '<svg viewBox="0 0 200 100" style="max-height: 80px;"><path d="M20,80 C40,10 60,100 80,30 C100,10 120,50 140,20 C160,50 180,20 190,80" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1,5"/></svg>';
                    }}
                  />
                ) : (
                  <svg viewBox="0 0 200 100" style={{ maxHeight: "80px" }}>
                    <path
                      d="M20,80 C40,10 60,100 80,30 C100,10 120,50 140,20 C160,50 180,20 190,80"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray="1,5"
                    />
                  </svg>
                )}
              </div>
              <p className="text-sm font-medium">Approver's Signature</p>
            </div>

            <div className="text-center">
              <div className="h-24 border rounded-md mb-2 flex items-center justify-center">
                {signatureUrls.user ? (
                  <img
                    src={signatureUrls.user}
                    alt="User Signature"
                    className="max-h-20 object-contain"
                    onError={(e) => {
                      console.error("Error loading user signature image");
                      e.currentTarget.onerror = null;
                      e.currentTarget.style.display = "none";
                      e.currentTarget.parentElement!.innerHTML =
                        '<svg viewBox="0 0 200 100" style="max-height: 80px;"><path d="M20,80 C40,10 60,100 80,30 C100,10 120,50 140,20 C160,50 180,20 190,80" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1,5"/></svg>';
                    }}
                  />
                ) : (
                  <svg viewBox="0 0 200 100" style={{ maxHeight: "80px" }}>
                    <path
                      d="M20,80 C40,10 60,100 80,30 C100,10 120,50 140,20 C160,50 180,20 190,80"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray="1,5"
                    />
                  </svg>
                )}
              </div>
              <p className="text-sm font-medium">Requestor's Signature</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
