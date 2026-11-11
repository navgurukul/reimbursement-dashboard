import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");

const transporter = nodemailer.createTransport({
  host: process.env.NEXT_PUBLIC_SMTP_HOST,
  port: parseInt(process.env.NEXT_PUBLIC_SMTP_PORT || "587"),
  secure: process.env.NEXT_PUBLIC_SMTP_SECURE === "true",
  auth: {
    user: process.env.NEXT_PUBLIC_SMTP_USER,
    pass: process.env.NEXT_PUBLIC_SMTP_PASSWORD,
  },
});

/**
 * Notifies the second approver that the first approver transferred an expense
 * to them. The recipient is always the expense's current approver (loaded
 * server-side), so the email can only go to the assigned second approver.
 */
export async function POST(req: NextRequest) {
  try {
    const { expenseId, firstApproverName } = await req.json();

    if (!expenseId) {
      return NextResponse.json({ error: "expenseId is required" }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_SMTP_HOST || !process.env.NEXT_PUBLIC_SMTP_USER) {
      return NextResponse.json({ error: "SMTP is not configured" }, { status: 500 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: expense, error: expenseError } = await supabaseAdmin
      .from("expense_new")
      .select(
        "id, org_id, user_id, approver_id, expense_type, amount, custom_fields"
      )
      .eq("id", expenseId)
      .single();

    if (expenseError || !expense) {
      console.error("Error fetching expense for transfer notification:", expenseError);
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const cf = (expense.custom_fields || {}) as Record<string, any>;
    if (cf.transferred_to_second_approver !== true || !expense.approver_id) {
      return NextResponse.json(
        { error: "Expense has not been transferred to a second approver" },
        { status: 400 }
      );
    }

    const [{ data: secondApprover }, { data: creator }] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("user_id", expense.approver_id)
        .single(),
      supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("user_id", expense.user_id)
        .single(),
    ]);

    if (!secondApprover?.email) {
      return NextResponse.json({
        success: false,
        sent: 0,
        message: "Second approver has no email address on file; nothing sent",
      });
    }

    // Prefer the stored name of whoever transferred; fall back to the request
    let transferredByName: string =
      cf.transferred_from_approver_name || firstApproverName || "";
    if (!transferredByName && cf.transferred_from_approver_id) {
      const { data: firstApprover } = await supabaseAdmin
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", cf.transferred_from_approver_id)
        .single();
      transferredByName = firstApprover?.full_name || firstApprover?.email || "";
    }
    transferredByName = transferredByName || "the first approver";

    let orgSlug: string = String(expense.org_id);
    let orgName: string = String(expense.org_id);
    try {
      const { data: orgRow } = await supabaseAdmin
        .from("organizations")
        .select("slug, name")
        .eq("id", expense.org_id)
        .single();
      if (orgRow?.slug) orgSlug = orgRow.slug;
      if (orgRow?.name) orgName = orgRow.name;
    } catch (e) {
      // fall back to org id
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const expenseUrl = `${baseUrl}/org/${orgSlug}/expenses/${expenseId}?fromTab=pending`;

    const secondApproverLabel =
      secondApprover.full_name || secondApprover.email || "Approver";
    const creatorLabel = creator?.full_name || creator?.email || "Unknown requester";
    const expenseTypeLabel = expense.expense_type || "Expense";
    // const expenseTitle = cf.title || cf.description || expenseTypeLabel;
    const amountLabel =
      typeof expense.amount === "number"
        ? expense.amount.toFixed(2)
        : expense.amount;

    const directionLine = `An expense has been transferred to you by ${transferredByName} (First Approver) for review and approval.`;
    const greetingLine = `Hi ${secondApproverLabel},`;
    const subject = "Expense Transferred to You for Review and Approval";

    const textBody = [
      greetingLine,
      "",
      directionLine,
      "",
      `Expense ID : ${expense.id}`,
      // `Expense Title : ${expenseTitle}`,
      `Expense Type : ${expenseTypeLabel}`,
      `Expense Amount : ${amountLabel || "-"}`,
      `Expense Creator Name : ${creatorLabel}`,
      `Transferred by (First Approver) : ${transferredByName}`,
      "",
      "Please review the expense details and take the necessary action.",
      `View details: ${expenseUrl}`,
    ].join("\n");

    await transporter.sendMail({
      from:
        process.env.NEXT_PUBLIC_SMTP_FROM ||
        `"Reimbursement App" <${process.env.NEXT_PUBLIC_SMTP_USER}>`,
      to: secondApprover.email,
      subject,
      text: textBody,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
              body { font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0; }
              .container { max-width: 640px; margin: 20px auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
              .header { background: #111827; color: #ffffff; padding: 16px 20px; }
              .content { padding: 20px; color: #111827; }
              .cta { display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 6px; font-weight: 600; margin: 16px 0; }
              .meta { margin: 8px 0; color: #374151; }
              .footer { padding: 12px 20px; font-size: 12px; color: #6b7280; background: #f9fafb; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>Expense transferred message from ${escapeHtml(orgName)} organization</h1>
              </div>
              <div class="content">
                <h2><strong>${escapeHtml(greetingLine)}</strong></h2>
                <h3 class="meta"><strong>${escapeHtml(directionLine)}</strong></h3>
                <div class="meta"><strong>Expense Type :</strong> ${escapeHtml(String(expenseTypeLabel))}</div>
                <div class="meta"><strong>Expense Amount :</strong> ${escapeHtml(String(amountLabel || "-"))}</div>
                <div class="meta"><strong>Expense Creator Name :</strong> ${escapeHtml(creatorLabel)}</div>
                <div class="meta"><strong>Transferred by (First Approver) :</strong> ${escapeHtml(transferredByName)}</div>
                <p><a class="cta" href="${escapeHtml(expenseUrl)}" style="color: white;">Review expense</a></p>
                <p>If the button does not work, copy and paste this link:</p>
                <p style="word-break: break-all; color: #2563eb;">${escapeHtml(expenseUrl)}</p>
              </div>
              <div class="footer">This is an automated message from the reimbursement dashboard.</div>
            </div>
          </body>
        </html>
      `,
    });

    return NextResponse.json({ success: true, sent: 1 });
  } catch (error: any) {
    console.error("Error sending transfer notification:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to send transfer notification" },
      { status: 500 }
    );
  }
}
