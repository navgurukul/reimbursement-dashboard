"use client";

import React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import { vouchers } from "@/lib/db";
import { formatDate } from "@/lib/utils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import supabase from "@/lib/supabase";

// Add type augmentation for jsPDF
declare module "jspdf" {
  interface jsPDF {
    autoTable: typeof autoTable;
    lastAutoTable: {
      finalY: number;
    };
  }
}

type Props = {
  expense: any;
  expenseId: string;
  voucherDetails: any;
  voucherSignatureUrl: string | null;
  organization: any;
};

// Utility function to convert image URL to base64
async function convertImageUrlToBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function VoucherDownloadAsPdf({
  expense,
  expenseId,
  voucherDetails,
  voucherSignatureUrl,
  organization,
}: Props) {
  const handleDownloadPDF = async () => {
    try {
      // Fetch voucher data if not provided
      let voucher = voucherDetails;
      if (!voucher) {
        const { data: voucherData, error: voucherError } =
          await vouchers.getByExpenseId(expenseId);

        if (voucherError || !voucherData) {
          toast.error("Voucher not found for this expense");
          return;
        }
        voucher = voucherData;
      }

      // Get signature URL if not provided
      let signatureUrl = voucherSignatureUrl;
      if (!signatureUrl && voucher.signature_url) {
        const { url } = await vouchers.getSignatureUrl(voucher.signature_url);
        signatureUrl = url || null;
      }

      // Use voucher data
      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const margin = 20; // outer margin
      const padding = 10; // inner padding inside border

      // ===== Outer rounded border (card) =====
      doc.setDrawColor(0);
      doc.setLineWidth(0.3);
      doc.roundedRect(
        margin,
        margin,
        pageWidth - margin * 2,
        pageHeight - margin * 2,
        0,
        0
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
      doc.setFont("helvetica", "italic");
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
        ["Name", voucher.your_name || expense.creator?.full_name || "—"],
        ["Amount", amountString],
        ["Date", formatDate(expense.date)],
        ["Credit Person", voucher.credit_person || "—"],
        ["Approver", expense.approver?.full_name || "—"],
        ["Purpose", voucher.purpose || "—"],
        [
          "Signature",
          signatureUrl
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
          if (
            d.section === "body" &&
            d.row.index === 1 &&
            d.column.index === 1
          ) {
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

      if (signatureUrl) {
        try {
          const base64 = await convertImageUrlToBase64(signatureUrl);

          // Desired max size
          const maxW = 80; // signature max width
          const maxH = 15; // signature max height

          // Add image with preserved aspect ratio
          doc.addImage(
            base64,
            "PNG",
            margin + padding + 4,
            y + 4,
            maxW,
            maxH
          );

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
      doc.line(
        margin + padding,
        bottomFooterY,
        pageWidth - margin - padding,
        bottomFooterY
      );

      doc.setFont("helvetica", "italic");
      doc.setFontSize(12);
      doc.setTextColor(100, 100, 100);

      doc.text(
        "This is a computer-generated voucher and is valid without physical signature.",
        pageWidth / 2,
        pageHeight - margin - 6, // always just above bottom border
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
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon"
            variant="outline"
            className="cursor-pointer"
            onClick={handleDownloadPDF}
            aria-label="Download voucher as PDF"
          >
            <Download className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p>Download voucher as PDF</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

