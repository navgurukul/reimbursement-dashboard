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
import { expenses, vouchers, voucherAttachments } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/utils";
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
    expensesList: any[];
    organization: any;
};

// Utility: fetch URL -> base64 data URL
async function convertImageUrlToBase64(url: string): Promise<string> {
    const { dataUrl } = await fetchImageAsDataUrl(url);
    return dataUrl;
}

// Utility: fetch URL -> base64 data URL + mime
async function fetchImageAsDataUrl(url: string): Promise<{
    dataUrl: string;
    mimeType: string;
}> {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () =>
            resolve({
                dataUrl: reader.result as string,
                mimeType: blob.type || "",
            });
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export default function DownloadAllExpensesAsPdf({
    expensesList,
    organization,
}: Props) {
    const handleDownloadPDF = async () => {
        try {
            if (!expensesList || expensesList.length === 0) {
                toast.error("No expenses to download");
                return;
            }

            toast.info(`Generating PDF for ${expensesList.length} expense(s)...`);

      const doc = new jsPDF();
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 10;
      const padding = 10;

      // Helper function to add border to current page
      const addPageBorder = () => {
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
      };

      // Process each expense
      for (let idx = 0; idx < expensesList.length; idx++) {
        const expense = expensesList[idx];

        // Add new page for each expense (except first one)
        if (idx > 0) {
          doc.addPage();
          addPageBorder();
        } else {
          // Add border to first page
          addPageBorder();
        }

                // ===== Header =====
                let y = margin + padding;
                doc.setFont("helvetica", "bold");
                doc.setFontSize(18);
                doc.setTextColor(0, 0, 0);
                doc.text("EXPENSE DETAILS", pageWidth / 2, y, { align: "center" });

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

                // Expense ID (left) + Created At (right) in same row
                y += 10;
                doc.setFont("helvetica", "italic");
                doc.setFontSize(11);
                doc.setTextColor(0, 0, 0);

                // Left aligned (Expense ID - always expense.id)
                const expenseId = expense.id || "N/A";
                const twoLineY = y;
                doc.text(`Expense ID: ${expenseId}`, margin + padding, twoLineY);
                doc.text(
                    'Expense created by: ' + (expense.creator?.full_name || 'N/A'),
                    margin + padding,
                    twoLineY + 6
                );
                doc.text('Expense approved by: ' + (expense.approver?.full_name || 'N/A'),
                    margin + padding,
                    twoLineY + 12
                );

                // Right aligned (Created At)
                doc.text(
                    `Created At: ${formatDateTime(expense.created_at)}`,
                    pageWidth - margin - padding,
                    twoLineY,
                    { align: "right" }
                );
                doc.text(
                    'Expense creator email: ' + (expense.creator_email || 'N/A'),
                    pageWidth - margin - padding,
                    twoLineY + 6,
                    { align: "right" }
                );
                doc.text(
                    'Expense approver email: ' + (expense.approver_email || 'N/A'),
                    pageWidth - margin - padding,
                    twoLineY + 12,
                    { align: "right" }
                );

                // Advance Y sufficiently so the divider doesn't overlap the second text line
                y = twoLineY + 16;
                doc.setDrawColor(0);
                doc.setLineWidth(0.3);
                doc.line(margin, y, pageWidth - margin, y);

                // ===== Expense Details Table Heading =====
                y += 6;
                doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                doc.setTextColor(0, 0, 0);
                doc.text("Expense Details : Show the receipt preview except for PDF format.", margin + padding, y);

                // ===== Expense Details Table =====
                const startY = y + 4;
                const amountString = `INR ${Number(expense.approved_amount || expense.amount || 0).toFixed(2)}`;

                // Fetch receipt URL if available
                let receiptUrl: string | null = null;
                let receiptFilename: string | null = null;
                if (expense.receipt?.path) {
                    try {
                        const { url, error } = await expenses.getReceiptUrl(
                            expense.receipt.path
                        );
                        if (!error && url) {
                            receiptUrl = url;
                            receiptFilename = expense.receipt.filename || "Receipt";
                        }
                    } catch (err) {
                        console.error("Error fetching receipt:", err);
                    }
                }
                // Detect if receipt looks like a PDF
                const receiptExt = (receiptFilename || receiptUrl || "")
                    .toLowerCase()
                    .split(".")
                    .pop();
                const receiptIsPdf = receiptExt === "pdf";

                // Fetch voucher data if available - always check by expense ID
                let voucherDetails: any = null;
                let voucherSignatureUrl: string | null = null;
                let voucherAttachmentUrl: string | null = null;
                let voucherAttachmentFilename: string | null = null;
                let voucherAttachmentIsPdf = false;

                // Always try to fetch voucher by expense ID
                try {
                    const { data: voucherData, error: voucherError } =
                        await vouchers.getByExpenseId(expense.id);

                    if (!voucherError && voucherData) {
                        voucherDetails = voucherData;

                        // Get signature URL
                        if (voucherData.signature_url) {
                            const { url } = await vouchers.getSignatureUrl(
                                voucherData.signature_url
                            );
                            voucherSignatureUrl = url || null;
                        }

                        // Get attachment URL
                        if (
                            (voucherData as any).attachment_url ||
                            (voucherData as any).attachment
                        ) {
                            try {
                                const attachmentValue =
                                    (voucherData as any).attachment_url ||
                                    (voucherData as any).attachment;
                                const parts = String(attachmentValue).split(",");
                                let filename: string | null = null;
                                let filePath: string | null = null;

                                if (parts.length > 1) {
                                    filename = parts[0] || null;
                                    filePath = parts[1] || null;
                                } else {
                                    const single = parts[0];
                                    if (single?.startsWith("http")) {
                                        voucherAttachmentUrl = single || null;
                                        filename = single.split("/").pop() || null;
                                    } else {
                                        filePath = single || null;
                                        filename = single?.split("/").pop() || null;
                                    }
                                }

                                        if (filePath) {
                                            const { url, error } = await voucherAttachments.getUrl(
                                                filePath
                                            );
                                            if (!error) {
                                                voucherAttachmentUrl = url || null;
                                                voucherAttachmentFilename = filename || null;
                                            }
                                        } else if (voucherAttachmentUrl) {
                                            voucherAttachmentFilename = filename || null;
                                        }
                                        // Detect if attachment looks like a PDF
                                        const ext = (voucherAttachmentFilename || voucherAttachmentUrl || "")
                                            .toLowerCase()
                                            .split(".")
                                            .pop();
                                        voucherAttachmentIsPdf = ext === "pdf";
                            } catch (err) {
                                // ignore attachment resolution errors
                            }
                        }
                    }
                } catch (err) {
                    console.error("Error fetching voucher:", err);
                    // Continue even if voucher fetch fails
                }

                // Resolve signature URLs
                let signatureUrl: string | null = null;
                let approverSignatureUrl: string | null = null;

                if (expense.signature_url) {
                    const signaturePath = expense.signature_url;
                    if (signaturePath && !signaturePath.startsWith("http")) {
                        const { data: sigData } = supabase.storage
                            .from("user-signatures")
                            .getPublicUrl(signaturePath);
                        if (sigData?.publicUrl) {
                            signatureUrl = sigData.publicUrl;
                        }
                    } else {
                        signatureUrl = signaturePath;
                    }
                }

                if (expense.approver_signature_url) {
                    const approverSignaturePath = expense.approver_signature_url;
                    if (
                        approverSignaturePath &&
                        !approverSignaturePath.startsWith("http")
                    ) {
                        const { data: approverSigData } = supabase.storage
                            .from("user-signatures")
                            .getPublicUrl(approverSignaturePath);
                        if (approverSigData?.publicUrl) {
                            approverSignatureUrl = approverSigData.publicUrl;
                        }
                    } else {
                        approverSignatureUrl = approverSignaturePath;
                    }
                }

                // Get event title if available
                const eventTitle = expense.event_title || "N/A";

                // Build expense details table body (without voucher details)
                const body = [
                    ["Timestamp", formatDateTime(expense.created_at)],
                    ["Payment Unique ID", expense.unique_id || expense.uniqueId || "N/A"],
                    ["Location of Expense", expense.location || "N/A"],
                    ["Event Name", eventTitle],
                    ["Expense Type", expense.expense_type || "Not Provided"],
                    ["Amount", amountString],
                    ["Approved Amount", amountString],
                    ["Date", formatDate(expense.date)],
                    ["Status", expense.status || "N/A"],
                    ["Approver", expense.approver?.full_name || "—"],
                    [
                        "Receipt/Voucher",
                        receiptUrl
                            ? "Receipt attached below"
                            : voucherDetails
                                ? "Voucher details below"
                                : "N/A",
                    ],
                    [
                        "Description",
                        expense.custom_fields?.description || expense.description || "—",
                    ],
                ];

                // Expense Details Table
                autoTable(doc, {
                    startY,
                    head: [["Expense Details", "Information"]],
                    body,
                    margin: { left: margin + padding, right: margin + padding },
                    styles: {
                        fontSize: 11,
                        cellPadding: 2, // tighter padding as requested
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
                    // Make the Receipt/Voucher row clickable when receipt is a PDF
                    didParseCell: (d: any) => {
                        if (
                            d.section === "body" &&
                            d.column.index === 1 &&
                            Array.isArray(d.row.raw) &&
                            String((d.row.raw as any[])[0]).toLowerCase() === "receipt/voucher" &&
                            receiptIsPdf &&
                            receiptUrl
                        ) {
                            // clear default text so we can draw centered link in didDrawCell
                            d.cell.text = [""];
                        }
                    },
                    didDrawCell: (d: any) => {
                        try {
                            if (
                                d.section === "body" &&
                                d.column.index === 1 &&
                                Array.isArray(d.row.raw) &&
                                String((d.row.raw as any[])[0]).toLowerCase() === "receipt/voucher" &&
                                receiptIsPdf &&
                                receiptUrl
                            ) {
                                const cellX = d.cell.x;
                                const cellY = d.cell.y;
                                const cellW = d.cell.width;
                                const cellH = d.cell.height;
                                const linkText = "View Receipt";
                                doc.setFont("helvetica", "normal");
                                const linkFontSize = 11;
                                doc.setFontSize(linkFontSize);
                                doc.setTextColor(0, 102, 204);
                                const textY = cellY + cellH / 2 + linkFontSize * 0.35;
                                // left-align the link text within the cell (small left padding)
                                doc.text(linkText, cellX + 4, textY);
                                doc.link(cellX, cellY, cellW, cellH, {
                                    url: receiptUrl,
                                });
                            }
                        } catch {
                            // ignore link drawing errors
                        }
                    },
                });

                y = (doc as any).lastAutoTable.finalY + 8;

                // ===== Expense Signatures (below expense details) =====
                if (signatureUrl || approverSignatureUrl) {
                    // Check if we need a new page
                    if (y + 60 > pageHeight - margin - 20) {
                        doc.addPage();
                        addPageBorder();
                        y = margin + padding;
                    }

                    // Divider above signatures (dotted)
                    doc.setDrawColor(0);
                    doc.setLineWidth(0.2);
                    (doc as any).setLineDash?.([2, 2], 0);
                    doc.line(margin + padding, y, pageWidth - margin - padding, y);
                    (doc as any).setLineDash?.([]);

                    y += 8;

                    // Section title
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(11);
                    doc.setTextColor(0, 0, 0);
                    doc.text("EXPENSE SIGNATURES:", margin + padding, y);

                    y += 8;

                    // User Signature
                    if (signatureUrl) {
                        try {
                            doc.setFont("helvetica", "normal");
                            doc.setFontSize(10);
                            doc.setTextColor(0, 0, 0);
                            doc.text("User Signature:", margin + padding, y);

                            y += 6;
                            const base64 = await convertImageUrlToBase64(signatureUrl);
                            const maxW = 80;
                            const maxH = 15;

                            // Add image with preserved aspect ratio
                            doc.addImage(
                                base64,
                                "PNG",
                                margin + padding + 4,
                                y + 4,
                                maxW,
                                maxH
                            );

                            // Dashed box that wraps the signature
                            const boxW = maxW + 8;
                            const boxH = maxH + 8;
                            doc.setLineWidth(0.3);
                            doc.setDrawColor(150);
                            (doc as any).setLineDash?.([2, 2], 0);
                            doc.rect(margin + padding, y, boxW, boxH);
                            (doc as any).setLineDash?.([]);

                            y += boxH + 10;
                        } catch (err) {
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
                            y += boxH + 10;
                        }
                    }

                    // Approver Signature
                    if (approverSignatureUrl) {
                        try {
                            doc.setFont("helvetica", "normal");
                            doc.setFontSize(10);
                            doc.setTextColor(0, 0, 0);
                            doc.text("Approver Signature:", margin + padding, y);

                            y += 6;
                            const base64 = await convertImageUrlToBase64(
                                approverSignatureUrl
                            );
                            const maxW = 80;
                            const maxH = 15;

                            // Add image with preserved aspect ratio
                            doc.addImage(
                                base64,
                                "PNG",
                                margin + padding + 4,
                                y + 4,
                                maxW,
                                maxH
                            );

                            // Dashed box that wraps the signature
                            const boxW = maxW + 8;
                            const boxH = maxH + 8;
                            doc.setLineWidth(0.3);
                            doc.setDrawColor(150);
                            (doc as any).setLineDash?.([2, 2], 0);
                            doc.rect(margin + padding, y, boxW, boxH);
                            (doc as any).setLineDash?.([]);

                            y += boxH + 10;
                        } catch (err) {
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
                            y += boxH + 10;
                        }
                    }
                }

                // ===== Voucher Details Table (separate table) =====
                if (voucherDetails) {
                    // Check if we need a new page
                    if (y + 80 > pageHeight - margin - 20) {
                        doc.addPage();
                        addPageBorder();
                        y = margin + padding;
                    }

                    // Divider before voucher details
                    doc.setDrawColor(0);
                    doc.setLineWidth(0.2);
                    doc.line(margin + padding, y, pageWidth - margin - padding, y);

                    y += 8;

                    // Voucher heading above table
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(11);
                    doc.setTextColor(0, 0, 0);
                    doc.text("Voucher Details : Show the voucher attachment preview except for PDF format.", margin + padding, y);

                    // Voucher Details Table - matching VoucherPreview format
                    const voucherBody = [
                        ["Voucher ID", voucherDetails.id || "—"],
                        ["Your Name", voucherDetails.your_name || expense.creator?.full_name || "—"],
                        ["Amount", `INR ${Number(voucherDetails?.amount || expense.amount || 0).toFixed(2)}`],
                        ["Date", new Date(expense.date).toLocaleDateString("en-GB")],
                        ["Credit Person", voucherDetails.credit_person || "—"],
                        ["Approver", expense.approver?.full_name || "—"],
                        ["Purpose", voucherDetails.purpose || "—"],
                        ["Voucher Signature", voucherSignatureUrl ? "Digital signature attached below" : "Not available"],
                        [
                            "Attachment",
                            voucherAttachmentUrl
                                ? voucherAttachmentIsPdf
                                    ? "View Attachment"
                                    : "Attachment preview below"
                                : "Not Available",
                        ],
                    ];

                    autoTable(doc, {
                        startY: y + 4,
                        head: [["Voucher Details", "Information"]],
                        body: voucherBody,
                        margin: { left: margin + padding, right: margin + padding },
                        styles: {
                            fontSize: 11,
                            cellPadding: 2, // tighter padding as requested
                            lineColor: [0, 0, 0],
                            lineWidth: 0.2,
                            textColor: [30, 30, 30],
                        },
                        headStyles: {
                            fillColor: [60, 60, 60],
                            textColor: 255,
                            fontStyle: "bold",
                            halign: "left",
                        },
                        alternateRowStyles: { fillColor: [250, 250, 250] },
                        columnStyles: {
                            0: { cellWidth: 60, fontStyle: "bold" },
                            1: { cellWidth: pageWidth - (margin + padding) * 2 - 60 },
                        },
                        // Make the Attachment row clickable when it's a PDF
                        didParseCell: (d: any) => {
                            if (
                                d.section === "body" &&
                                d.column.index === 1 &&
                                Array.isArray(d.row.raw) &&
                                String((d.row.raw as any[])[0]).toLowerCase() === "attachment" &&
                                voucherAttachmentIsPdf &&
                                voucherAttachmentUrl
                            ) {
                                // we'll draw custom text in didDrawCell
                                d.cell.text = [""];
                            }
                        },
                        didDrawCell: (d: any) => {
                            try {
                                        if (
                                            d.section === "body" &&
                                            d.column.index === 1 &&
                                            Array.isArray(d.row.raw) &&
                                            String((d.row.raw as any[])[0]).toLowerCase() === "attachment" &&
                                            voucherAttachmentIsPdf &&
                                            voucherAttachmentUrl
                                        ) {
                                            const cellX = d.cell.x;
                                            const cellY = d.cell.y;
                                            const cellW = d.cell.width;
                                            const cellH = d.cell.height;
                                            const linkText = "View Attachment";
                                            doc.setFont("helvetica", "normal");
                                            const linkFontSize = 11;
                                            doc.setFontSize(linkFontSize);
                                            doc.setTextColor(0, 102, 204);
                                            const textY = cellY + cellH / 2 + linkFontSize * 0.35;
                                            doc.text(linkText, cellX + cellW / 2, textY);
                                            doc.link(cellX, cellY, cellW, cellH, {
                                                url: voucherAttachmentUrl,
                                            });
                                        }
                            } catch {
                                // ignore link drawing errors
                            }
                        },
                    });

                    y = (doc as any).lastAutoTable.finalY + 15;

                    // ===== Voucher Signature (below voucher details) =====
                    if (voucherSignatureUrl) {
                        // Move to next page if needed
                        if (y + 50 > pageHeight - margin - 20) {
                            doc.addPage();
                            addPageBorder();
                            y = margin + padding;
                        }

                        // Divider above voucher signature (dotted)
                        doc.setDrawColor(0);
                        doc.setLineWidth(0.2);
                        (doc as any).setLineDash?.([2, 2], 0);
                        doc.line(margin + padding, y, pageWidth - margin - padding, y);
                        (doc as any).setLineDash?.([]);

                        y += 8;

                        try {
                            doc.setFont("helvetica", "bold");
                            doc.setFontSize(11);
                            doc.setTextColor(0, 0, 0);
                            doc.text("VOUCHER SIGNATURE:", margin + padding, y);

                            y += 8;
                            const base64 = await convertImageUrlToBase64(voucherSignatureUrl);
                            const maxW = 80;
                            const maxH = 15;

                            // Add image with preserved aspect ratio
                            doc.addImage(
                                base64,
                                "PNG",
                                margin + padding + 4,
                                y + 4,
                                maxW,
                                maxH
                            );

                            // Dashed box that wraps the signature
                            const boxW = maxW + 8;
                            const boxH = maxH + 8;
                            doc.setLineWidth(0.3);
                            doc.setDrawColor(150);
                            (doc as any).setLineDash?.([2, 2], 0);
                            doc.rect(margin + padding, y, boxW, boxH);
                            (doc as any).setLineDash?.([]);

                            y += boxH + 12;
                        } catch (err) {
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
                            y += boxH + 12;
                        }
                    }
                }

                // ===== Receipt Preview =====
                if (receiptUrl) {
                    if (y + 50 > pageHeight - margin - 20) {
                        doc.addPage();
                        addPageBorder();
                        y = margin + padding;
                    }

                    try {
                        const { dataUrl: base64Receipt, mimeType } =
                            await fetchImageAsDataUrl(receiptUrl);
                        const receiptExt = (receiptFilename || receiptUrl || "")
                            .toLowerCase()
                            .split(".")
                            .pop();

                        const mimeLooksLikeImage =
                            mimeType?.startsWith("image/") &&
                            ["image/png", "image/jpeg", "image/webp"].includes(mimeType);
                        const extLooksLikeImage =
                            receiptExt &&
                            ["png", "jpg", "jpeg", "webp"].includes(receiptExt);

                        if (mimeLooksLikeImage || extLooksLikeImage) {
                            // Divider (dotted)
                            doc.setDrawColor(0);
                            doc.setLineWidth(0.2);
                            (doc as any).setLineDash?.([2, 2], 0);
                            doc.line(margin + padding, y, pageWidth - margin - padding, y);
                            (doc as any).setLineDash?.([]);

                            y += 8;

                            doc.setFont("helvetica", "bold");
                            doc.setFontSize(11);
                            doc.setTextColor(0, 0, 0);
                            doc.text("RECEIPT PREVIEW:", margin + padding, y);

                            y += 8;

                            const imgProps = doc.getImageProperties(base64Receipt) as any;
                            const imageFormat =
                                imgProps?.fileType ||
                                imgProps?.format ||
                                mimeType?.replace("image/", "").toUpperCase() ||
                                "PNG";
                            const maxPreviewWidth = pageWidth - (margin + padding) * 2;
                            const maxPreviewHeight = 120;

                            let renderWidth = imgProps.width;
                            let renderHeight = imgProps.height;
                            if (renderWidth > maxPreviewWidth) {
                                const scale = maxPreviewWidth / renderWidth;
                                renderWidth = maxPreviewWidth;
                                renderHeight = renderHeight * scale;
                            }
                            if (renderHeight > maxPreviewHeight) {
                                const scale = maxPreviewHeight / renderHeight;
                                renderHeight = maxPreviewHeight;
                                renderWidth = renderWidth * scale;
                            }

                        if (y + renderHeight + 24 > pageHeight - margin) {
                            doc.addPage();
                            addPageBorder();
                            y = margin + padding;
                        }

                            doc.addImage(
                                base64Receipt,
                                imageFormat,
                                margin + padding,
                                y,
                                renderWidth,
                                renderHeight
                            );

                            y += renderHeight + 12;
                        } else {
                            // Not an image (PDF or other format)
                            if (y + 30 > pageHeight - margin - 20) {
                                doc.addPage();
                                addPageBorder();
                                y = margin + padding;
                            }
                            doc.setFont("helvetica", "bolditalic");
                            doc.setFontSize(10);
                            doc.setTextColor(120, 120, 120);
                            doc.text(
                                "Note: Receipt preview is unavailable for PDF files. Click 'View Receipt' to open it.",
                                margin + padding,
                                y
                            );
                            y += 15;
                        }
                    } catch (err) {
                        // Receipt is PDF or failed to load
                        doc.setFont("helvetica", "bold");
                        doc.setFontSize(10);
                        doc.setTextColor(120, 120, 120);
                        doc.text(
                            "Note: Receipt preview is unavailable because the receipt is in PDF format.\nPlease click View Receipt to open it.",
                            margin + padding,
                            y
                        );
                        y += 15;
                    }
                }

                // ===== Voucher Attachment Preview (in expense details section) =====
                if (voucherDetails && voucherAttachmentUrl) {
                    // Always start voucher attachment preview on a new page
                    doc.addPage();
                    addPageBorder();
                    y = margin + padding;

                    try {
                        const { dataUrl: base64Attachment, mimeType } =
                            await fetchImageAsDataUrl(voucherAttachmentUrl);
                        const attachmentExt = (
                            voucherAttachmentFilename || voucherAttachmentUrl || ""
                        )
                            .toLowerCase()
                            .split(".")
                            .pop();

                        const mimeLooksLikeImage =
                            mimeType?.startsWith("image/") &&
                            ["image/png", "image/jpeg", "image/webp"].includes(mimeType);
                        const extLooksLikeImage =
                            attachmentExt &&
                            ["png", "jpg", "jpeg", "webp"].includes(attachmentExt);

                        if (mimeLooksLikeImage || extLooksLikeImage) {
                                // Divider (dotted)
                                doc.setDrawColor(0);
                                doc.setLineWidth(0.2);
                                (doc as any).setLineDash?.([2, 2], 0);
                                doc.line(margin + padding, y, pageWidth - margin - padding, y);
                                (doc as any).setLineDash?.([]);

                            y += 8;

                            doc.setFont("helvetica", "bold");
                            doc.setFontSize(11);
                            doc.setTextColor(0, 0, 0);
                            doc.text("VOUCHER ATTACHMENT PREVIEW:", margin + padding, y);

                            y += 8;

                            const imgProps = doc.getImageProperties(base64Attachment) as any;
                            const imageFormat =
                                imgProps?.fileType ||
                                imgProps?.format ||
                                mimeType?.replace("image/", "").toUpperCase() ||
                                "PNG";
                            const maxPreviewWidth = pageWidth - (margin + padding) * 2;
                            const maxPreviewHeight = 180;

                            let renderWidth = imgProps.width;
                            let renderHeight = imgProps.height;
                            if (renderWidth > maxPreviewWidth) {
                                const scale = maxPreviewWidth / renderWidth;
                                renderWidth = maxPreviewWidth;
                                renderHeight = renderHeight * scale;
                            }
                            if (renderHeight > maxPreviewHeight) {
                                const scale = maxPreviewHeight / renderHeight;
                                renderHeight = maxPreviewHeight;
                                renderWidth = renderWidth * scale;
                            }

                        if (y + renderHeight + 24 > pageHeight - margin) {
                            doc.addPage();
                            addPageBorder();
                            y = margin + padding;
                        }

                            doc.addImage(
                                base64Attachment,
                                imageFormat,
                                margin + padding,
                                y,
                                renderWidth,
                                renderHeight
                            );

                            y += renderHeight + 12;
                        } else {
                            // Not an image (PDF or other format)
                            if (y + 30 > pageHeight - margin - 20) {
                                doc.addPage();
                                addPageBorder();
                                y = margin + padding;
                            }
                            doc.setFont("helvetica", "bolditalic");
                            doc.setFontSize(10);
                            doc.setTextColor(120, 120, 120);
                            doc.text(
                                "Note: Voucher attachment preview is unavailable because the attachment is in PDF format.\nPlease click View Attachment to open it.",
                                margin + padding,
                                y
                            );
                            y += 15;
                        }
                    } catch (err) {
                        // Attachment failed to load
                        if (y + 30 > pageHeight - margin - 20) {
                            doc.addPage();
                            y = margin + padding;
                        }
                        doc.setFont("helvetica", "bolditalic");
                        doc.setFontSize(10);
                        doc.setTextColor(120, 120, 120);
                        doc.text(
                            "Note: Voucher attachment preview is unavailable because the attachment is in PDF format.\nPlease click View Attachment to open it.",
                            margin + padding,
                            y
                        );
                        y += 15;
                    }
                } else if (voucherDetails && !voucherAttachmentUrl) {
                    // Voucher exists but no attachment - show message
                    if (y + 30 > pageHeight - margin - 20) {
                        doc.addPage();
                        y = margin + padding;
                    }
                    doc.setFont("helvetica", "italic");
                    doc.setFontSize(10);
                    doc.setTextColor(120, 120, 120);
                    doc.text(
                        "Note: No voucher attachment available for this expense.",
                        margin + padding,
                        y
                    );
                    y += 15;
                }

            }

            // Save file
            const timestamp = new Date().toISOString().split("T")[0];
            // If only one expense, include creator name and expense date in filename
            if (expensesList.length === 1) {
                const single = expensesList[0];
                const creatorName =
                    single.creator?.full_name ||
                    single.creator_name ||
                    single.creator ||
                    "expense";
                const safeCreator = String(creatorName)
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "_")
                    .replace(/^_+|_+$/g, "");
                const expenseDate = single.date
                    ? (() => {
                          const d = new Date(single.date);
                          const dd = String(d.getDate()).padStart(2, "0");
                          const mm = String(d.getMonth() + 1).padStart(2, "0");
                          const yyyy = d.getFullYear();
                          return `${dd}-${mm}-${yyyy}`;
                      })()
                    : timestamp;
                doc.save(`${single.expense_type}_${safeCreator}_${expenseDate}.pdf`);
            } else {
                doc.save(`all_expenses_${timestamp}.pdf`);
            }
            toast.success(`PDF downloaded successfully with ${expensesList.length} expense(s)`);
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
                        variant="outline"
                        className="cursor-pointer"
                        onClick={handleDownloadPDF}
                        aria-label="Download all expenses as PDF"
                    >
                        <Download className="mr-2 h-4 w-4" />
                        Download Expense as PDF
                    </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                    <p>Download expense details as PDF</p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

