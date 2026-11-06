import { NextRequest, NextResponse } from "next/server";
import { createSmtpTransport, escapeHtml, isSmtpConfigured, smtpFrom } from "@/lib/server/smtp";
import {
    forbidden,
    getExpenseOrg,
    getOrgRole,
    getSignedInUser,
    isOrgMemberEmail,
    unauthorized,
} from "@/lib/server/auth";

const transporter = createSmtpTransport();

export async function POST(req: NextRequest) {
    const caller = await getSignedInUser();
    if (!caller) return unauthorized();

    try {
        const {
            expenseId,
            approverEmail,
            approverName,
            requesterName,
            orgName,
            slug,
            amount,
            expenseType,
        } = await req.json();

        if (!expenseId || !approverEmail || !slug) {
            return NextResponse.json(
                { error: "expenseId, approverEmail, and slug are required" },
                { status: 400 }
            );
        }

        if (!isSmtpConfigured()) {
            return NextResponse.json(
                { error: "SMTP is not configured" },
                { status: 500 }
            );
        }

        // Only members of the expense's organisation can notify, and only another member.
        const expense = await getExpenseOrg(expenseId);
        if (!expense) {
            return NextResponse.json({ error: "Expense not found" }, { status: 404 });
        }
        if (!(await getOrgRole(caller.id, expense.orgId))) return forbidden();
        if (!(await isOrgMemberEmail(expense.orgId, String(approverEmail)))) {
            return forbidden("The approver isn't a member of this organisation");
        }

        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
        const expenseUrl = `${baseUrl}/org/${expense.orgSlug}/expenses/${expense.id}`;
        const approverGreeting = approverName ? `Hi ${approverName},` : "Hello,";
        const requesterLabel = requesterName || "A teammate";
        const orgLabel = expense.orgName || orgName || "your organization";
        const amountLabel = typeof amount === "number" ? amount.toFixed(2) : amount;
        const expenseTypeLabel = expenseType || "Expense";

        const subject = `${requesterLabel}'s ${expenseTypeLabel} expense is pending for your approval`;

        const mailOptions = {
            from: smtpFrom(),
            to: approverEmail,
            subject,
            text: `${approverGreeting}\n\n${requesterLabel} submitted a new expense in ${orgLabel}.\nType: ${expenseTypeLabel}\nAmount: ${amountLabel || "-"}\n\nReview and take action: ${expenseUrl}\n\nThis link will take you directly to the expense detail page.`,
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
                <div style="font-size: 18px; font-weight: 600;">Organization Name: ${escapeHtml(orgLabel)}</div>
                <div style="font-size: 18px; font-weight: 400;">Expense approval needed</div>
              </div>
              <div class="content">
                <p>${escapeHtml(approverGreeting)}</p>
                <p>${escapeHtml(requesterLabel)} has submitted a new expense for your review and approval.</p>
                <div class="meta"><strong>Expense Type:</strong> ${escapeHtml(expenseTypeLabel)}</div>
                <div class="meta"><strong>Expense Amount:</strong> ${escapeHtml(amountLabel || "-")}</div>
                <p><a class="cta" href="${escapeHtml(expenseUrl)}" style="color: white;">Review expense</a></p>
                <p>If the button does not work, copy and paste this link:</p>
                <p style="word-break: break-all; color: #2563eb;">${escapeHtml(expenseUrl)}</p>
              </div>
              <div class="footer">This is an automated message from the reimbursement dashboard.</div>
            </div>
          </body>
        </html>
      `,
        };

        await transporter.sendMail(mailOptions);

        return NextResponse.json({ success: true, expenseUrl });
    } catch (error: any) {
        console.error("Error sending approver notification:", error);
        return NextResponse.json(
            { error: error?.message || "Failed to send notification" },
            { status: 500 }
        );
    }
}
