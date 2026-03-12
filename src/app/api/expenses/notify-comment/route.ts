import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

interface Recipient {
  email: string;
  name?: string;
}

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

export async function POST(req: NextRequest) {
  try {
    const {
      expenseId,
      commentId,
      commentContent,
      commenterProfileId,
      commenterUserId,
      commenterName,
      commenterEmail,
    } = await req.json();

    if (!expenseId || !commentContent) {
      return NextResponse.json({ error: "expenseId and commentContent required" }, { status: 400 });
    }

    if (!process.env.NEXT_PUBLIC_SMTP_HOST || !process.env.NEXT_PUBLIC_SMTP_USER) {
      return NextResponse.json({ error: "SMTP is not configured" }, { status: 500 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Load expense to determine org, creator and approver
    const { data: expenseData, error: expenseError } = await supabaseAdmin
      .from("expense_new")
      .select("id, org_id, user_id, approver_id, expense_type, amount, status")
      .eq("id", expenseId)
      .single();

    if (expenseError || !expenseData) {
      console.error("Error fetching expense for comment notification:", expenseError);
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }

    const orgId = expenseData.org_id;

    // Get creator email
    const { data: creatorProfile } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name, user_id")
      .eq("user_id", expenseData.user_id)
      .single();

    // Get approver email (if approver exists)
    let approverProfile: any = null;
    if (expenseData.approver_id) {
      const { data: ap } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name, user_id")
        .eq("user_id", expenseData.approver_id)
        .single();
      approverProfile = ap || null;
    }

    // Determine commenter role in the org
    let commenterRole: string | null = null;
    if (commenterUserId && orgId) {
      const { data: orgUser } = await supabaseAdmin
        .from("organization_users")
        .select("role")
        .eq("org_id", orgId)
        .eq("user_id", commenterUserId)
        .single();
      commenterRole = orgUser?.role || null;
    }

    const creatorRecipient: Recipient | null = creatorProfile?.email
      ? { email: creatorProfile.email, name: creatorProfile.full_name }
      : null;
    const approverRecipient: Recipient | null = approverProfile?.email
      ? { email: approverProfile.email, name: approverProfile.full_name }
      : null;

    const isCreator =
      (commenterUserId && commenterUserId === expenseData.user_id) ||
      (commenterEmail && creatorProfile?.email === commenterEmail);
    const isApprover =
      (commenterUserId && commenterUserId === expenseData.approver_id) ||
      (commenterEmail && approverProfile?.email === commenterEmail);

    const commenterRoleNormalized = (commenterRole || "").toLowerCase();
    const financeRoles = new Set(["finance", "owner", "admin", "manager"]);
    const approvedStatuses = new Set([
      "approved",
      "approved_as_per_policy",
      "finance_approved",
      "finance_rejected",
      "ready_for_payment",
    ]);

    const isFinanceAfterApproval =
      !isCreator &&
      !isApprover &&
      financeRoles.has(commenterRoleNormalized) &&
      approvedStatuses.has((expenseData.status || "").toLowerCase());

    // Decide recipients based on commenter identity
    const toRecipients: Recipient[] = [];
    const ccRecipients: Recipient[] = [];

    if (isCreator) {
      if (approverRecipient) toRecipients.push(approverRecipient);
    } else if (isApprover) {
      if (creatorRecipient) toRecipients.push(creatorRecipient);
    } else if (isFinanceAfterApproval) {
      if (creatorRecipient) toRecipients.push(creatorRecipient);
      if (
        approverRecipient &&
        (!creatorRecipient || approverRecipient.email !== creatorRecipient.email)
      ) {
        ccRecipients.push(approverRecipient);
      }
    } else {
      if (creatorRecipient) toRecipients.push(creatorRecipient);
      if (
        approverRecipient &&
        (!creatorRecipient || approverRecipient.email !== creatorRecipient.email)
      ) {
        ccRecipients.push(approverRecipient);
      }
    }

    const dedupeRecipients = (recipients: Recipient[]) =>
      recipients.filter(
        (r, idx, arr) => arr.findIndex((x) => x.email === r.email) === idx
      );

    // Remove duplicates and exclude the commenter from recipients
    let uniqueToRecipients = dedupeRecipients(toRecipients).filter((r) => {
      if (!r.email) return false;
      if (commenterEmail && r.email === commenterEmail) return false;
      return true;
    });

    let uniqueCcRecipients = dedupeRecipients(ccRecipients).filter((r) => {
      if (!r.email) return false;
      if (commenterEmail && r.email === commenterEmail) return false;
      if (uniqueToRecipients.some((to) => to.email === r.email)) return false;
      return true;
    });

    // Ensure at least one TO recipient for SMTP compatibility
    if (uniqueToRecipients.length === 0 && uniqueCcRecipients.length > 0) {
      uniqueToRecipients = [uniqueCcRecipients[0]];
      uniqueCcRecipients = uniqueCcRecipients.slice(1);
    }

    if (uniqueToRecipients.length === 0) {
      return NextResponse.json({ success: true, message: "No recipients for comment notification" });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

    // Resolve organization slug and name for friendly URLs; fall back to orgId if not available
    let orgSlug: any = orgId;
    let orgName: string | number = orgId;
    try {
      const { data: orgRow } = await supabaseAdmin
        .from("organizations")
        .select("slug, name")
        .eq("id", orgId)
        .single();
      if (orgRow?.slug) orgSlug = orgRow.slug;
      if (orgRow?.name) orgName = orgRow.name;
    } catch (e) {
      // ignore and fall back to orgId
    }

    const expenseUrl = `${baseUrl}/org/${orgSlug}/expenses/${expenseId}`;

    // Compose email
    const subject = `New Comment on ${expenseData.expense_type} Expense`;

    const requesterLabel =
      creatorProfile?.full_name || creatorProfile?.email || "Unknown requester";
    const approverLabel =
      approverProfile?.full_name || approverProfile?.email || "Not assigned";
    const commentedByLabel = commenterName || commenterEmail || "Someone";
    const statusLabel = (expenseData.status || "").toLowerCase();
    const isApprovedByApprover = approvedStatuses.has(statusLabel);

    const commentDirectionLine = (() => {
      if (isFinanceAfterApproval) {
        return `This comment was added by ${commentedByLabel} (Finance side) to ${requesterLabel} (Expense Creator).`;
      }

      if (!isApprovedByApprover && isCreator) {
        return `This comment was added by ${requesterLabel} (Expense Creator) to ${approverLabel} (Expense Approver).`;
      }

      if (!isApprovedByApprover && isApprover) {
        return `This comment was added by ${approverLabel} (Expense Approver) to ${requesterLabel} (Expense Creator).`;
      }

      if (isApprover) {
        return `This comment was added by ${approverLabel} (Expense Approver) to ${requesterLabel} (Expense Creator).`;
      }

      if (isCreator) {
        return `This comment was added by ${requesterLabel} (Expense Creator) to ${approverLabel} (Expense Approver).`;
      }

      return `This comment was added by ${commentedByLabel} and shared with relevant stakeholders for this expense.`;
    })();

    const ccLine =
      uniqueCcRecipients.length > 0
        ? `CC: ${uniqueCcRecipients
            .map((r) => r.name || r.email)
            .filter(Boolean)
            .join(", ")}`
        : "";

    const safeComment = escapeHtml(String(commentContent));
    const safeRequester = escapeHtml(requesterLabel);
    const safeApprover = escapeHtml(approverLabel);
    const safeCommentedBy = escapeHtml(commentedByLabel);
    const safeCommentDirectionLine = escapeHtml(commentDirectionLine);
    const safeCcLine = escapeHtml(ccLine);

    const htmlComment = `
      <div class="meta"><strong>Expense Creator Name :</strong> ${safeRequester}</div>
      <div class="meta"><strong>Expense Approver Name :</strong> ${safeApprover}</div>
      <div class="meta"><strong>Commented by :</strong> ${safeCommentedBy}</div>
      <div class="meta"><strong>Comment Message :</strong> ${safeComment}</div>
      ${safeCcLine ? `<div class="meta"><strong>${safeCcLine}</strong></div>` : ""}
    `;

    const textComment = [
      `${commentDirectionLine}`,
      `Expense Creator Name : ${requesterLabel}`,
      `Expense Approver Name : ${approverLabel}`,
      `Commented by : ${commentedByLabel}`,
      `Comment Message : ${commentContent}`,
      ...(ccLine ? [ccLine] : []),
    ].join("\n");

    // Expense details
    const expenseTypeLabel = expenseData.expense_type || "Expense";
    const amountLabel = typeof expenseData.amount === "number" ? expenseData.amount.toFixed(2) : expenseData.amount;

    const allRecipients = dedupeRecipients([
      ...uniqueToRecipients,
      ...uniqueCcRecipients,
    ]);

    for (const recipient of allRecipients) {
      const greetingLine = recipient.name
        ? `Hi ${recipient.name},`
        : recipient.email
          ? `Hi ${recipient.email},`
          : "Hello,";

      const mailOptions = {
        from: process.env.NEXT_PUBLIC_SMTP_FROM || `"Reimbursement App" <${process.env.NEXT_PUBLIC_SMTP_USER}>`,
        to: recipient.email,
        subject,
        text: `${greetingLine}\n\nA new comment was added to an expense you are involved with.\n\nExpense: ${expenseTypeLabel}\nAmount: ${amountLabel || "-"}\n\n${textComment}\n\nView details: ${expenseUrl}`,
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
                  <h1>Comment message from ${escapeHtml(String(orgName))} organization</h1>
                </div>
                <div class="content">
                  <h2><strong>${escapeHtml(greetingLine)}</strong></h2>
                  <h3 class="meta"><strong>${safeCommentDirectionLine}</strong></h3>
                  <div class="meta"><strong>Expense Type:</strong> ${expenseTypeLabel}</div>
                  <div class="meta"><strong>Expense Amount:</strong> ${amountLabel || "-"}</div>
                  ${htmlComment}
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
    }

    return NextResponse.json({ success: true, sent: allRecipients.length, cc: uniqueCcRecipients.length });
  } catch (error: any) {
    console.error("Error sending comment notification:", error);
    return NextResponse.json({ error: error?.message || "Failed to send comment notification" }, { status: 500 });
  }
}
