import { NextRequest, NextResponse } from "next/server";
import { createSmtpTransport, escapeHtml, isSmtpConfigured, smtpFrom } from "@/lib/server/smtp";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { forbidden, getOrgRole, getSignedInUser, unauthorized } from "@/lib/server/auth";

const transporter = createSmtpTransport();

const isAdvanceType = (t: unknown) =>
  String(t || "").trim().toLowerCase() === "advance";

const amountOf = (r: any) => Number(r?.approved_amount ?? r?.amount ?? 0) || 0;

const money = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const markedAt = (r: any) => {
  const t = r?.custom_fields?.marked_as_advance_at;
  return t ? new Date(t).getTime() : Number.MAX_SAFE_INTEGER;
};

/**
 * Called after Finance clicks "Mark as Advance" on a Records row. If the expense
 * was created against an existing Advance ID (same unique_id as an advance that
 * is already on the Advance Payment page), the expense amount is adjusted
 * against that advance, the totals are stored on both records, and the expense
 * creator is emailed the updated figures.
 *
 * The advance is the earliest "Advance"-type expense with that unique_id marked
 * as advance; utilized = sum of the other marked expenses with that unique_id.
 */
export async function POST(req: NextRequest) {
  const caller = await getSignedInUser();
  if (!caller) return unauthorized();

  try {
    const { expenseId } = await req.json();
    if (!expenseId) {
      return NextResponse.json({ error: "expenseId is required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: expense } = await supabase
      .from("expense_new")
      .select("id, org_id, user_id, unique_id, expense_type, amount, approved_amount, custom_fields")
      .eq("id", expenseId)
      .maybeSingle();
    if (!expense) {
      return NextResponse.json({ error: "Expense not found" }, { status: 404 });
    }
    if (!(await getOrgRole(caller.id, expense.org_id))) return forbidden();

    const cf = (expense.custom_fields || {}) as Record<string, any>;
    if (cf.marked_as_advance !== true) {
      return NextResponse.json({ error: "Expense is not marked as advance" }, { status: 400 });
    }

    const skip = (reason: string) =>
      NextResponse.json({ success: true, adjusted: false, sent: 0, reason });

    // Already adjusted (and emailed) once: never double count or re-send.
    if (cf.advance_adjustment) return skip("already_adjusted");
    // An Advance-type expense is itself a new advance, not an adjustment.
    if (isAdvanceType(expense.expense_type)) return skip("expense_is_advance");
    const uniqueId = String(expense.unique_id || "").trim();
    if (!uniqueId) return skip("no_advance_id");

    // An expense is "against an advance" when its ID is an advance ID: either
    // "advance_<id>" or a bank-details Advance Unique ID. The advance itself is
    // then an "Advance"-type expense under the plain ID ("<id>") or the same ID.
    const esc = (v: string) => v.replace(/[%_]/g, "\\$&");
    const prefixed = /^advance_/i.test(uniqueId);
    const { data: bankRows } = await supabase
      .from("bank_details")
      .select("unique_id, advance_unique_id")
      .ilike("advance_unique_id", esc(uniqueId));
    if (!prefixed && !bankRows?.length) return skip("not_against_advance");

    const advanceIds = new Set<string>([uniqueId.toLowerCase()]);
    if (prefixed) advanceIds.add(uniqueId.replace(/^advance_/i, "").toLowerCase());
    (bankRows || []).forEach((b: any) => {
      if (b.unique_id) advanceIds.add(String(b.unique_id).trim().toLowerCase());
    });

    const { data: candidates, error: candErr } = await supabase
      .from("expense_new")
      .select("id, unique_id, expense_type, amount, approved_amount, custom_fields")
      .eq("org_id", expense.org_id)
      .eq("payment_status", "paid")
      .neq("id", expense.id)
      .or(Array.from(advanceIds).map((id) => `unique_id.ilike.${esc(id)}`).join(","));
    if (candErr) throw candErr;

    // The advance: the most recently marked "Advance"-type expense on those
    // IDs. Only its own amount is used, not a total of all advances.
    const advance = (candidates || [])
      .filter(
        (r: any) =>
          isAdvanceType(r.expense_type) && r.custom_fields?.marked_as_advance === true
      )
      .sort((a: any, b: any) => markedAt(b) - markedAt(a))[0];
    if (!advance) return skip("no_existing_advance");

    const original = amountOf(advance);
    // Remaining Amount: marked expenses already against this advance (same ID,
    // marked after it; not the current one) with no return amount recorded.
    const hasReturn = (r: any) => {
      const v = r.custom_fields?.return_amount ?? r.custom_fields?.returned_amount;
      return v !== null && v !== undefined && v !== "" && Number(v) > 0;
    };
    const previouslyUtilized = (candidates || [])
      .filter(
        (r: any) =>
          String(r.unique_id || "").trim().toLowerCase() === uniqueId.toLowerCase() &&
          !isAdvanceType(r.expense_type) &&
          r.custom_fields?.marked_as_advance === true &&
          // Only expenses against this advance: marked after it, so earlier
          // advances' expenses on the same ID are left out.
          markedAt(r) >= markedAt(advance) &&
          !hasReturn(r)
      )
      .reduce((sum: number, r: any) => sum + amountOf(r), 0);
    const adjusted = amountOf(expense);
    const totalUtilized = previouslyUtilized + adjusted;
    const remaining = original - totalUtilized;
    const at = new Date().toISOString();

    // Update the advance record (what the Advance Payment page reads) and
    // record the adjustment on the expense, which also guards against re-runs.
    const [advRes, expRes] = await Promise.all([
      supabase
        .from("expense_new")
        .update({
          custom_fields: {
            ...(advance.custom_fields || {}),
            advance_utilized_amount: totalUtilized,
            advance_remaining_amount: remaining,
            advance_updated_at: at,
          },
        })
        .eq("id", advance.id),
      supabase
        .from("expense_new")
        .update({
          custom_fields: {
            ...cf,
            advance_adjustment: {
              advance_expense_id: advance.id,
              advance_unique_id: uniqueId,
              original_amount: original,
              previously_utilized: previouslyUtilized,
              adjusted_amount: adjusted,
              total_utilized: totalUtilized,
              remaining_amount: remaining,
              adjusted_at: at,
            },
          },
        })
        .eq("id", expense.id),
    ]);
    if (advRes.error) throw advRes.error;
    if (expRes.error) throw expRes.error;

    const result = {
      advanceUniqueId: uniqueId,
      originalAmount: original,
      previouslyUtilized,
      adjustedAmount: adjusted,
      totalUtilized,
      remainingAmount: remaining,
    };

    // Email the creator. The advance is already updated, so a mail problem is
    // reported but does not undo it.
    if (!isSmtpConfigured()) {
      return NextResponse.json({ success: true, adjusted: true, sent: 0, emailError: "SMTP is not configured", ...result });
    }
    const { data: creator } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("user_id", expense.user_id)
      .maybeSingle();
    if (!creator?.email) {
      return NextResponse.json({ success: true, adjusted: true, sent: 0, emailError: "Expense creator has no email", ...result });
    }

    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", expense.org_id)
      .maybeSingle();
    const orgName = org?.name || "";
    const name = creator.full_name || creator.email;

    const rows: [string, string][] = [
      ["Advance Unique ID", uniqueId],
      ["Advance Amount", `₹${money(original)}`],
      ["Total Amount Previously Used Against Advance", `₹${money(previouslyUtilized)}`],
      ["New Expense Amount Against Advance", `₹${money(adjusted)}`],
      ["Total Amount", `₹${money(totalUtilized)}`],
      ["Remaining Advance Amount", `₹${money(remaining)}`],
    ];
    const intro = "Your expense has been adjusted against your existing advance. Here are the updated advance details:";

    try {
      await transporter.sendMail({
        from: smtpFrom(),
        to: creator.email,
        subject: "Reminder: Remaining Amount Against Advance",
        text: [`Hi ${name},`, "", intro, "", ...rows.map(([k, v]) => `${k} : ${v}`)].join("\n"),
        html: `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0;">
  <div style="max-width: 640px; margin: 20px auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
    <div style="background: #111827; color: #ffffff; padding: 16px 20px;"><h1 style="margin:0;font-size:18px;">Advance payment update${orgName ? ` from ${escapeHtml(orgName)}` : ""}</h1></div>
    <div style="padding: 20px; color: #111827;">
      <p><strong>Hi ${escapeHtml(name)},</strong></p>
      <p>${escapeHtml(intro)}</p>
      <table style="border-collapse: collapse; width: 100%;">
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>${escapeHtml(k)}</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(v)}</td></tr>`
          )
          .join("")}
      </table>
    </div>
    <div style="padding: 12px 20px; font-size: 12px; color: #6b7280; background: #f9fafb;">This is an automated message from the reimbursement dashboard.</div>
  </div>
</body></html>`,
      });
    } catch (mailErr: any) {
      console.error("Error sending advance adjustment email:", mailErr);
      return NextResponse.json({ success: true, adjusted: true, sent: 0, emailError: mailErr?.message || "Email failed", ...result });
    }

    return NextResponse.json({ success: true, adjusted: true, sent: 1, ...result });
  } catch (error: any) {
    console.error("Error adjusting advance:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to adjust advance" },
      { status: 500 }
    );
  }
}
