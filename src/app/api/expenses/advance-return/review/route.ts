import { NextRequest, NextResponse } from "next/server";
import { createSmtpTransport, escapeHtml, isSmtpConfigured, smtpFrom } from "@/lib/server/smtp";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { forbidden, getOrgRole, getSignedInUser, unauthorized } from "@/lib/server/auth";

const transporter = createSmtpTransport();

const amountOf = (r: any) => Number(r?.approved_amount ?? r?.amount ?? 0) || 0;
const money = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTime = (t: string | null | undefined) =>
  t
    ? new Date(t).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Kolkata",
      })
    : "—";

/**
 * Finance reviews the return (amount + proof) an advance owner submitted.
 * The advance is marked reviewed (the owner can no longer edit the return) and
 * the expense creator is emailed that the advance is completed.
 */
export async function POST(req: NextRequest) {
  const caller = await getSignedInUser();
  if (!caller) return unauthorized();

  try {
    const { advanceId } = await req.json();
    if (!advanceId) {
      return NextResponse.json({ error: "advanceId is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: advance } = await supabase
      .from("expense_new")
      .select("id, org_id, user_id, unique_id, amount, approved_amount, custom_fields")
      .eq("id", advanceId)
      .maybeSingle();
    if (!advance) {
      return NextResponse.json({ error: "Advance not found" }, { status: 404 });
    }
    if (!(await getOrgRole(caller.id, advance.org_id))) return forbidden();

    const cf = (advance.custom_fields || {}) as Record<string, any>;
    const returns: any[] = Array.isArray(cf.advance_returns) ? cf.advance_returns : [];
    if (returns.length === 0) {
      return NextResponse.json({ error: "No return to review" }, { status: 400 });
    }
    if (cf.advance_return_reviewed === true) {
      return NextResponse.json({ success: true, alreadyReviewed: true, sent: 0 });
    }

    const at = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("expense_new")
      .update({
        custom_fields: {
          ...cf,
          advance_return_reviewed: true,
          advance_return_reviewed_at: at,
          advance_return_reviewed_by: caller.id,
        },
      })
      .eq("id", advance.id);
    if (updErr) throw updErr;

    // Email the advance owner. A mail problem never undoes the review.
    if (!isSmtpConfigured()) {
      return NextResponse.json({ success: true, sent: 0, emailError: "SMTP is not configured" });
    }
    const { data: creator } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", advance.user_id)
      .maybeSingle();
    if (!creator?.email) {
      return NextResponse.json({ success: true, sent: 0, emailError: "Expense creator has no email" });
    }
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", advance.org_id)
      .maybeSingle();
    const orgName = org?.name || "";
    const { data: reviewer } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", caller.id)
      .maybeSingle();
    const reviewerName = reviewer?.full_name || reviewer?.email || caller.email || "Finance";
    const name = creator.full_name || creator.email;
    const advanceUniqueId = String(advance.unique_id || "").trim() || advance.id;

    const original = amountOf(advance);
    const returned = returns.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const rem = cf.advance_remaining_amount;
    const remaining = rem !== null && rem !== undefined && rem !== "" ? Number(rem) || 0 : original;
    // Used against the advance: the stored utilized amount, else what is left
    // after the remaining balance and the returned amount are taken out.
    const util = cf.advance_utilized_amount;
    const totalUsed =
      util !== null && util !== undefined && util !== ""
        ? Number(util) || 0
        : Math.max(original - remaining - returned, 0);
    const rows: [string, string][] = [
      ["Advance ID", advanceUniqueId],
      ["Advance Amount", `₹${money(original)}`],
      ["Total Amount Used Against Advance", `₹${money(totalUsed)}`],
      ["Returned Amount", `₹${money(returned)}`],
      ["Remaining Advance Amount", `₹${money(Math.max(remaining, 0))}`],
      ["Reviewed On", fmtTime(at)],
    ];
    const intro =
      "Your advance amount return has been reviewed and your advance is now completed. Please find the details below.";

    try {
      await transporter.sendMail({
        from: smtpFrom(),
        to: creator.email,
        subject: `Remaining Amount Return Reviewed by Finance - ${reviewerName}, ${fmtTime(at)}`,
        text: [
          `Hi ${name},`,
          "",
          intro,
          "",
          ...rows.map(([k, v]) => `${k} : ${v}`),
          "",
          "Regards,",
          "Payment Dashboard",
        ].join("\n"),
        html: `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0;">
  <div style="max-width: 640px; margin: 20px auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
    <div style="background: #111827; color: #ffffff; padding: 16px 20px;"><h1 style="margin:0;font-size:18px;">Remaining Amount Return Reviewed ${orgName ? ` for ${orgName} Organization` : ""}</h1></div>
    <div style="padding: 20px; color: #111827;">
      <p><strong>Hi ${escapeHtml(name)},</strong></p>
      <p>${escapeHtml(intro)}</p>
      <table style="border-collapse: collapse; width: 100%;">${rows
        .map(
          ([k, v]) =>
            `<tr><td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>${escapeHtml(k)}</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(v)}</td></tr>`
        )
        .join("")}</table>
      <p style="margin-top: 16px;">Regards,<br/>Payment Dashboard</p>
    </div>
    <div style="padding: 12px 20px; font-size: 12px; color: #6b7280; background: #f9fafb;">This is an automated message from the reimbursement dashboard.<br/>${escapeHtml(`Ref: ${advanceUniqueId} · ${fmtTime(at)} · ${advance.id}`)}</div>
  </div>
</body></html>`,
      });
    } catch (mailErr: any) {
      console.error("Error sending advance completed email:", mailErr);
      return NextResponse.json({ success: true, sent: 0, emailError: mailErr?.message || "Email failed" });
    }

    return NextResponse.json({ success: true, sent: 1 });
  } catch (error: any) {
    console.error("Error reviewing advance return:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to review return" },
      { status: 500 }
    );
  }
}
