import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.NEXT_PUBLIC_SMTP_HOST,
  port: parseInt(process.env.NEXT_PUBLIC_SMTP_PORT || "587"),
  secure: process.env.NEXT_PUBLIC_SMTP_SECURE === "true",
  auth: {
    user: process.env.NEXT_PUBLIC_SMTP_USER,
    pass: process.env.NEXT_PUBLIC_SMTP_PASSWORD,
  },
});

export async function POST(req: NextRequest) {
  try {
    const {
      expenseId,
      creatorEmail,
      creatorName,
      approverName,
      orgName,
      slug,
      amount,
      expenseType,
      status, // "approved" | "rejected"
      approvedAmount,
    } = await req.json();

    if (!expenseId || !creatorEmail || !slug || !status) {
      return NextResponse.json(
        { error: "expenseId, creatorEmail, slug and status are required" },
        { status: 400 }
      );
    }

    if (!process.env.NEXT_PUBLIC_SMTP_HOST || !process.env.NEXT_PUBLIC_SMTP_USER) {
      return NextResponse.json(
        { error: "SMTP is not configured" },
        { status: 500 }
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const expenseUrl = `${baseUrl}/org/${slug}/expenses/${expenseId}`;
    const creatorGreeting = creatorName ? `Hi ${creatorName},` : "Hello,";
    const orgLabel = orgName || "your organization";
    const expenseTypeLabel = expenseType || "Expense";
    const amountLabel = typeof amount === "number" ? amount.toFixed(2) : amount;
    const approvedAmountLabel =
      typeof approvedAmount === "number" ? approvedAmount.toFixed(2) : approvedAmount;
    const approverLabel = approverName || "your approver";

    const isApproved = String(status).toLowerCase() === "approved";
    const subject = isApproved
      ? `${expenseTypeLabel} expense approved by ${approverLabel}.`
      : `${expenseTypeLabel} expense rejected by ${approverLabel}.`;

    const decisionLine = isApproved
      ? `Your expense has been approved by ${approverLabel}.`
      : `Your expense has been rejected by ${approverLabel}.`;

   
    const mailOptions = {
      from:
        process.env.NEXT_PUBLIC_SMTP_FROM ||
        `"Reimbursement App" <${process.env.NEXT_PUBLIC_SMTP_USER}>`,
      to: creatorEmail,
      subject,
      text: `${creatorGreeting}\n\n${decisionLine}\nOrganization: ${orgLabel}\nType: ${expenseTypeLabel}\nAmount: ${amountLabel || "-"}$${
        isApproved ? `\nApproved Amount: ${approvedAmountLabel || amountLabel || "-"}` : ""
      }\n\nView details: ${expenseUrl}`,
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
                <div style="font-size: 18px; font-weight: 600;">Organization Name: ${orgLabel}</div>
                <div style="font-size: 18px; font-weight: 400;">Expense ${isApproved ? "approved" : "rejected"}</div>
              </div>
              <div class="content">
                <p>${creatorGreeting}</p>
                <p>${decisionLine}</p>
                <div class="meta"><strong>Expense Type:</strong> ${expenseTypeLabel}</div>
                <div class="meta"><strong>Expense Amount:</strong> ${amountLabel || "-"}</div>
                <div class="meta"><strong>Expense Status:</strong> <span style="color: ${isApproved ? '#16a34a' : '#dc2626'}; font-weight: 600;">${isApproved ? 'Approved' : 'Rejected'} by manager</span></div>
                <p><a class="cta" href="${expenseUrl}" style="color: white;">View expense</a></p>
                <p>If the button does not work, copy and paste this link:</p>
                <p style="word-break: break-all; color: #2563eb;">${expenseUrl}</p>
              </div>
              <div class="footer">This is an automated message from the reimbursement dashboard.</div>
            </div>
          </body>
        </html>
      `,
    } as any;

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true, expenseUrl });
  } catch (error: any) {
    console.error("Error sending creator notification:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to send notification" },
      { status: 500 }
    );
  }
}
