import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// Server-side Supabase client using service role for storage upload
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
);

type GenerateVoucherPdfBody = {
  voucherId: string;
};

export async function POST(req: Request) {
  const url = new URL(req.url);
  const includeDebug = url.searchParams.get("debug") === "1";
  const debug: Array<{ step: string; details?: any }> = [];
  let signaturePath: string | null = null;
  let signatureBase64: string | null = null;
  let signatureSource: "user-signatures" | "external" | null = null;

  try {
    const { voucherId } = (await req.json()) as GenerateVoucherPdfBody;
    if (!voucherId) {
      return NextResponse.json({ error: "voucherId is required", ...(includeDebug ? { debug } : {}) }, { status: 400 });
    }

    // Load voucher
    const { data: voucher, error: vErr } = await supabase
      .from("vouchers")
      .select("*")
      .eq("id", voucherId)
      .single();

    debug.push({ step: "voucher.fetch", details: { voucherId, error: vErr?.message } });

    // Fetch signature only from vouchers.signature_url
    if (voucher?.signature_url) {
      signaturePath = voucher.signature_url;
      signatureSource = voucher.signature_url.startsWith("http") ? "external" : "user-signatures";
    }

    if (vErr || !voucher) {
      return NextResponse.json({ error: vErr?.message || "Voucher not found", ...(includeDebug ? { debug } : {}) }, { status: 404 });
    }

    // Load expense
    const { data: expense, error: eErr } = await supabase
      .from("expenses")
      .select("id, date, org_id, approver_id")
      .eq("id", voucher.expense_id)
      .single();

    debug.push({ step: "expense.fetch", details: { expenseId: voucher.expense_id, error: eErr?.message } });

    if (eErr || !expense) {
      return NextResponse.json({ error: eErr?.message || "Expense not found", ...(includeDebug ? { debug } : {}) }, { status: 404 });
    }

    // Get organization for name
    let orgName = "Organization";
    if (expense.org_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", expense.org_id)
        .single();
      if (org?.name) orgName = org.name;
      debug.push({ step: "organization.fetch", details: { orgId: expense.org_id, orgName } });
    }

    // Optionally fetch approver name
    let approverName: string | null = null;
    if (expense.approver_id) {
      const { data: approver } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", expense.approver_id)
        .single();
      approverName = approver?.full_name || null;
      debug.push({ step: "approver.fetch", details: { approverId: expense.approver_id, approverName } });
    }

    const formatDate = (iso: string) => new Date(iso).toLocaleDateString();

    // Build PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const padding = 10;

    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, margin, pageWidth - margin * 2, pageHeight - margin * 2, 0, 0);

    let y = margin + padding;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("EXPENSE VOUCHER", pageWidth / 2, y, { align: "center" });

    y += 8;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(15);
    doc.setTextColor(80, 80, 80);
    doc.text(`Organization: ${orgName}`, pageWidth / 2, y, { align: "center" });

    y += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(`Voucher ID: ${voucher.id}`, margin + padding, y);
    doc.text(`Created At: ${formatDate(voucher.created_at)}`, pageWidth - margin - padding, y, { align: "right" });

    y += 6;
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);

    // Ensure signature is resolved BEFORE building the table so the label is accurate
    if (!signatureBase64 && signaturePath) {
      try {
        if (signatureSource === "user-signatures") {
          const { data: sigBlob, error: sigErr } = await supabase.storage
            .from("user-signatures")
            .download(signaturePath);
          if (!sigErr && sigBlob) {
            const buf = Buffer.from(await sigBlob.arrayBuffer());
            signatureBase64 = `data:image/png;base64,${buf.toString("base64")}`;
          }
        } else if (signatureSource === "external") {
          const resp = await fetch(signaturePath);
          if (resp.ok) {
            const arr = await resp.arrayBuffer();
            const buf = Buffer.from(arr);
            signatureBase64 = `data:image/png;base64,${buf.toString("base64")}`;
          }
        }
        debug.push({ step: "signature.resolve", details: { source: signatureSource, ok: Boolean(signatureBase64) } });
      } catch {
        debug.push({ step: "signature.resolve.error" });
      }
    }

    const startY = y + 8;
    const body: any[] = [
      ["Name", voucher.your_name || "—"],
      ["Amount", `INR ${Number(voucher.amount || 0).toFixed(2)}`],
      ["Date", expense?.date ? formatDate(expense.date) : "—"],
      ["Credit Person", voucher.credit_person || "—"],
      ["Approver", approverName || "—"],
      ["Purpose", voucher.purpose || "—"],
      [
        "Signature",
        signatureBase64 ? "Digital signature attached below" : "Not available",
      ],
    ];

    autoTable(doc, {
      startY,
      head: [["Details", "Information"]],
      body,
      margin: { left: margin + padding, right: margin + padding },
      styles: { fontSize: 11, cellPadding: 4, lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [30, 30, 30] },
      headStyles: { fillColor: [45, 45, 45], textColor: 255, fontStyle: "bold", halign: "left" },
      alternateRowStyles: { fillColor: [246, 246, 246] },
      columnStyles: { 0: { cellWidth: 60, fontStyle: "bold" }, 1: { cellWidth: pageWidth - (margin + padding) * 2 - 60 } },
    });

    // Start signature section after the rendered table
    y = (doc as any).lastAutoTable?.finalY ? (doc as any).lastAutoTable.finalY + 15 : y + 15;

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

      if (signatureBase64) {
        try {
          const maxW = 80; 
          const maxH = 15;

          // Add image with preserved aspect ratio
          doc.addImage(signatureBase64, "PNG", margin + padding + 4, y + 4, maxW, maxH);

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

    // Footer note
    const bottomFooterY = pageHeight - margin - 14;
    doc.setDrawColor(120);
    doc.setLineWidth(0.2);
    doc.line(margin + padding, bottomFooterY, pageWidth - margin - padding, bottomFooterY);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(
      "This is a computer-generated voucher and is valid without physical signature.",
      pageWidth / 2,
      pageHeight - margin - 6,
      { align: "center" }
    );

    // Get PDF buffer
    const pdfBlob = doc.output("blob");
    const arrayBuffer = await pdfBlob.arrayBuffer();

    // Upload to storage
    const key = `${voucher.created_by || "unknown"}/${expense.org_id || "org"}/${voucher.id}.pdf`;
    const { error: uploadError, data: uploadData } = await supabase.storage
      .from("voucher-pdfs")
      .upload(key, arrayBuffer, { contentType: "application/pdf", upsert: true });

    console.log("Uploaded voucher PDF to storage", { key, uploadError, uploadData });

    debug.push({ step: "storage.upload", details: { key, error: uploadError?.message, path: uploadData?.path } });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message, ...(includeDebug ? { debug } : {}) }, { status: 500 });
    }

    // Save path to voucher (ignore if column doesn't exist yet)
    const { error: upErr } = await supabase
      .from("vouchers")
      .update({ pdf_path: uploadData?.path || key } as any)
      .eq("id", voucherId);

    debug.push({ step: "voucher.update", details: { voucherId, pdf_path: uploadData?.path || key, error: upErr?.message } });

    // If the column is missing (migration not applied), continue without failing
    if (upErr && !(typeof upErr.message === "string" && upErr.message.toLowerCase().includes("column") && upErr.message.toLowerCase().includes("pdf_path"))) {
      return NextResponse.json({ error: upErr.message, ...(includeDebug ? { debug } : {}) }, { status: 500 });
    }

    // Return signed URL
    const { data: signed, error: urlErr } = await supabase.storage
      .from("voucher-pdfs")
      .createSignedUrl(uploadData?.path || key, 3600);

    debug.push({ step: "storage.signedUrl", details: { path: uploadData?.path || key, error: urlErr?.message, ok: Boolean(!urlErr) } });

    if (urlErr) {
      return NextResponse.json({ success: true, path: uploadData?.path || key, ...(includeDebug ? { debug } : {}) }, { status: 200 });
    }

    return NextResponse.json({ success: true, path: uploadData?.path || key, url: signed.signedUrl, ...(includeDebug ? { debug } : {}) });
  } catch (e: any) {
    debug.push({ step: "unexpected.error", details: { message: e?.message } });
    return NextResponse.json({ error: e?.message || "Unexpected error", ...(includeDebug ? { debug } : {}) }, { status: 500 });
  }
}