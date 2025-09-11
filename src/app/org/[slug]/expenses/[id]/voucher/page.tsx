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
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { voucherAttachments } from "@/lib/db";

// Add type augmentation for jsPDF
declare module 'jspdf' {
  interface jsPDF {
    autoTable: typeof autoTable;
    lastAutoTable: {
      finalY: number;
    };
  }
}

export default function VoucherViewPage() {
  const router = useRouter();
  const params = useParams();
  const expenseId = params?.id as string;
  const slug = params?.slug as string;
  const { organization } = useOrgStore();

  const [expense, setExpense] = useState<any>(null);
  const [voucher, setVoucher] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userSignatureUrl, setUserSignatureUrl] = useState<string | null>(null);
  const [approverName, setApproverName] = useState<string | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);

  // Fetch attachment URL after voucher loads
  useEffect(() => {
    if (voucher?.attachment) {
      const [, filePath] = String(voucher.attachment).split(",");
      if (filePath) {
        (async () => {
          const { url, error } = await voucherAttachments.getUrl(filePath);
          if (!error) setAttachmentUrl(url);
        })();
      }
    }
  }, [voucher]);

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

        // Get signature URL if available
        if (voucherData.signature_url) {
          const { url: signatureUrl } = await vouchers.getSignatureUrl(
            voucherData.signature_url
          );
          setUserSignatureUrl(signatureUrl);
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

  const convertImageUrlToBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const handleDownloadPDF = async () => {
    try {
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const margin = 20;      // outer margin
      const padding = 10;     // inner padding inside border

      // ===== Outer rounded border (card) =====
      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      doc.roundedRect(
        margin,
        margin,
        pageWidth - margin * 2,
        pageHeight - margin * 2,
        0,
        0,
      );

      // ===== Header =====
      let y = margin + padding;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(0, 0, 0);
      doc.text("EXPENSE VOUCHER", pageWidth / 2, y, { align: "center" });

      y += 8;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(15);
      doc.setTextColor(80, 80, 80);
      doc.text(
        `Organization: ${organization?.name || "Navgurukul"}`,
        pageWidth / 2,
        y,
        { align: "center" }
      );

      // Voucher ID (left) + Created At (right) in same row
      y += 10;
      doc.setFont("helvetica", "bolditalic");
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);

      // Left aligned (Voucher ID)
      doc.text(`Voucher ID: ${voucher.id}`, margin + padding, y);

      // Right aligned (Created At)
      doc.text(
        `Created At: ${formatDate(voucher.created_at)}`,
        pageWidth - margin - padding,
        y,
        { align: "right" }
      );

      // Divider (full width black line)
      y += 6;
      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      doc.line(margin, y, pageWidth - margin, y);

      // ===== Table =====
      const startY = y + 8;
      const amountString = `INR ${Number(voucher.amount || 0).toFixed(2)}`;
      const body = [
        ["Name", voucher.your_name || "—"],
        ["Amount", amountString],
        ["Date", formatDate(expense.date)],
        ["Credit Person", voucher.credit_person || "—"],
        ["Approver", approverName || "—"],
        ["Purpose", voucher.purpose || "—"],
        [
          "Signature",
          userSignatureUrl
            ? "Digital signature attached below"
            : "Not available",
        ],
      ];

      autoTable(doc, {
        startY,
        head: [["Details", "Information"]],
        body,
        margin: { left: margin + padding, right: margin + padding },
        styles: {
          fontSize: 11,
          cellPadding: 4,
          lineColor: [0, 0, 0],
          lineWidth: 0.2,
          textColor: [30, 30, 30],
        },
        headStyles: {
          fillColor: [45, 45, 45],
          textColor: 255,
          fontStyle: "bold",
          halign: "left",
        },
        alternateRowStyles: { fillColor: [246, 246, 246] },
        columnStyles: {
          0: { cellWidth: 60, fontStyle: "bold" },
          1: { cellWidth: pageWidth - (margin + padding) * 2 - 60 },
        },
        // Amount in green + bold
        didParseCell: (d) => {
          if (d.section === "body" && d.row.index === 1 && d.column.index === 1) {
            d.cell.styles.textColor = [0, 0, 0];
            d.cell.styles.fontStyle = "bold";
          }
        },
      });

      y = (doc as any).lastAutoTable.finalY + 15;

      // ===== Signature Section =====
      // Divider above DIGITAL SIGNATURE:
      doc.setDrawColor(0);
      doc.setLineWidth(0.2);
      doc.line(margin + padding, y, pageWidth - margin - padding, y);

      y += 8;

      // Section title
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text("DIGITAL SIGNATURE:", margin + padding, y);

      y += 6;

      if (userSignatureUrl) {
        try {
          const base64 = await convertImageUrlToBase64(userSignatureUrl);

          // Desired max size
          const maxW = 80; // signature max width
          const maxH = 15; // signature max height

          // Add image with preserved aspect ratio
          doc.addImage(base64, "PNG", margin + padding + 4, y + 4, maxW, maxH);

          // Dashed box that wraps the signature (just bigger than image)
          const boxW = maxW + 8;
          const boxH = maxH + 8;
          doc.setLineWidth(0.3);
          doc.setDrawColor(150);
          (doc as any).setLineDash?.([2, 2], 0);
          doc.rect(margin + padding, y, boxW, boxH);
          (doc as any).setLineDash?.([]);
        } catch {
          // If image fails → show dashed placeholder with text
          const boxW = 120;
          const boxH = 30;
          doc.setLineWidth(0.3);
          doc.setDrawColor(150);
          (doc as any).setLineDash?.([2, 2], 0);
          doc.rect(margin + padding, y, boxW, boxH);
          (doc as any).setLineDash?.([]);

          doc.setFont("helvetica", "italic");
          doc.setFontSize(10);
          doc.setTextColor(150, 150, 150);
          doc.text("Signature unavailable", margin + padding + 6, y + 15);
        }
      } else {
        // No signature at all → placeholder box with text
        const boxW = 120;
        const boxH = 30;
        doc.setLineWidth(0.3);
        doc.setDrawColor(150);
        (doc as any).setLineDash?.([2, 2], 0);
        doc.rect(margin + padding, y, boxW, boxH);
        (doc as any).setLineDash?.([]);

        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        doc.text("Signature Not Available", margin + padding + 6, y + 15);
      }

      // ===== Footer Note (always at bottom inside border) =====
      const bottomFooterY = pageHeight - margin - 14;
      // Divider line
      doc.setDrawColor(120);
      doc.setLineWidth(0.2);
      doc.line(margin + padding, bottomFooterY, pageWidth - margin - padding, bottomFooterY);

      doc.setFont("helvetica", "italic");
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);

      doc.text(
        "This is a computer-generated voucher and is valid without physical signature.",
        pageWidth / 2,
        pageHeight - margin - 6,   // always just above bottom border
        { align: "center" }
      );

      // Save file
      doc.save(`voucher_${voucher.id}.pdf`);
      toast.success("PDF downloaded successfully");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to download PDF");
    }
  };

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

        <Button variant="outline" onClick={handleDownloadPDF} className="cursor-pointer">
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

          {/* Attachment Section */}
          {voucher?.attachment && (() => {
            const [fileName] = String(voucher.attachment).split(",");
            if (!attachmentUrl) {
              return (
                <div className="mt-6 border-b pb-6 mb-6">
                  <h3 className="text-base font-medium mb-2">Attachment</h3>
                  <p className="text-gray-500 text-sm">Loading attachment...</p>
                </div>
              );
            }
            return (
              <div className="mt-6 border-b pb-6 mb-6">
                <h3 className="text-base font-medium mb-2">Attachment</h3>
                <Button
                  variant="outline"
                  onClick={() => window.open(attachmentUrl, "_blank")}
                  className="inline-flex items-center text-blue-800 hover:text-blue-800 cursor-pointer"
                >
                  View Attachment
                </Button>
              </div>
            );
          })()}

          <div>
            <h3 className="text-base font-medium mb-4">Signature</h3>

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
