import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

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
      .select("*, org_id, user_id, approver_id, expense_type, amount")
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

    // Decide recipients based on commenter role
    const recipients: { email: string; name?: string }[] = [];

    const isCreator = commenterUserId === expenseData.user_id;
    const isApprover = commenterUserId === expenseData.approver_id;
    const isFinance = commenterRole === "finance" || commenterRole === "Finance";

    if (isFinance) {
      if (approverProfile && approverProfile.email) recipients.push({ email: approverProfile.email, name: approverProfile.full_name });
      if (creatorProfile && creatorProfile.email) recipients.push({ email: creatorProfile.email, name: creatorProfile.full_name });
    } else if (isCreator) {
      // notify approver only
      if (approverProfile && approverProfile.email) recipients.push({ email: approverProfile.email, name: approverProfile.full_name });
    } else if (isApprover) {
      // notify creator only
      if (creatorProfile && creatorProfile.email) recipients.push({ email: creatorProfile.email, name: creatorProfile.full_name });
    } else {
      // If role unknown, default: notify creator and approver if present
      if (approverProfile && approverProfile.email) recipients.push({ email: approverProfile.email, name: approverProfile.full_name });
      if (creatorProfile && creatorProfile.email) recipients.push({ email: creatorProfile.email, name: creatorProfile.full_name });
    }

    // Remove duplicates
    const uniqueRecipients = recipients.filter((r, idx, arr) => arr.findIndex(x => x.email === r.email) === idx);

    if (uniqueRecipients.length === 0) {
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

    const htmlComment = `
      <div class="meta"><strong>Comment:</strong> ${commentContent}</div>
      <div class="meta" style="margin-top:8px;"><strong>From:</strong> ${commenterName || commenterEmail || "Someone"}</div>
    `;

    const textComment = `Comment: ${commentContent}\nFrom: ${commenterName || commenterEmail || "Someone"}`;

    // Expense details
    const expenseTypeLabel = expenseData.expense_type || "Expense";
    const amountLabel = typeof expenseData.amount === "number" ? expenseData.amount.toFixed(2) : expenseData.amount;

    // Send emails to each recipient
    for (const r of uniqueRecipients) {
      const mailOptions = {
        from: process.env.NEXT_PUBLIC_SMTP_FROM || `"Reimbursement App" <${process.env.NEXT_PUBLIC_SMTP_USER}>`,
        to: r.email,
        subject,
        text: `${r.name ? `Hi ${r.name},\n\n` : "Hello,\n\n"}A new comment was added to an expense you are involved with.\n\nExpense: ${expenseTypeLabel}\nAmount: ${amountLabel || "-"}\n\n${textComment}\n\nView details: ${expenseUrl}`,
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
                  <div style="font-size: 18px; font-weight: 600;">Comment message from ${orgName} organization</div>
                </div>
                <div class="content">
                  <p>Hi ${r.name || "there"},</p>
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

    return NextResponse.json({ success: true, sent: uniqueRecipients.length });
  } catch (error: any) {
    console.error("Error sending comment notification:", error);
    return NextResponse.json({ error: error?.message || "Failed to send comment notification" }, { status: 500 });
  }
}
