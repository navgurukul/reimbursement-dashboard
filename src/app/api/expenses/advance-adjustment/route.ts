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
      .select("id, unique_id, expense_type, amount, approved_amount, custom_fields, paid_approval_time")
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
      .reduce((sum: number, r: any) => {
        // An expense absorbed by a previous advance's balance only counts for
        // the part that was applied to this (new) advance.
        const applied = r.custom_fields?.advance_adjustment?.applied_to_new;
        return sum + (applied !== undefined && applied !== null ? Number(applied) || 0 : amountOf(r));
      }, 0);
    const adjusted = amountOf(expense);
    const at = new Date().toISOString();

    // Previous advances of this user that still have a remaining balance. Each
    // is kept separate (own ID, amount, remaining, paid_approval_time); the
    // current advance is excluded so nothing is double counted.
    const { data: userAdvances, error: prevErr } = await supabase
      .from("expense_new")
      .select("id, unique_id, expense_type, amount, approved_amount, custom_fields, paid_approval_time")
      .eq("org_id", expense.org_id)
      .eq("user_id", expense.user_id)
      .eq("payment_status", "paid")
      .neq("id", advance.id)
      .ilike("expense_type", "advance");
    if (prevErr) throw prevErr;

    const advTime = (r: any) =>
      r.paid_approval_time ? new Date(r.paid_approval_time).getTime() : markedAt(r);
    const allPreviousAdvances = (userAdvances || [])
      .filter(
        (r: any) =>
          isAdvanceType(r.expense_type) &&
          r.custom_fields?.marked_as_advance === true &&
          advTime(r) <= advTime(advance)
      )
      .map((r: any) => {
        const amt = amountOf(r);
        const rem = r.custom_fields?.advance_remaining_amount;
        const remainingAmt =
          rem !== null && rem !== undefined && rem !== "" ? Number(rem) || 0 : amt;
        return {
          id: r.id as string,
          custom_fields: (r.custom_fields || {}) as Record<string, any>,
          uniqueId: String(r.unique_id || "").trim(),
          amount: amt,
          remaining: remainingAmt,
          used: Math.max(amt - remainingAmt, 0),
          paidAt: r.paid_approval_time as string | null,
        };
      })
      .sort((a, b) => (a.paidAt ? new Date(a.paidAt).getTime() : 0) - (b.paidAt ? new Date(b.paidAt).getTime() : 0));
    // Only advances that still had a balance take part in the allocation and the
    // summary; completed ones stay listed (Remaining 0) but are not counted.
    const previousAdvances = allPreviousAdvances.filter((p) => p.remaining > 0);

    // The new expense first uses up previous advances' remaining balances
    // (oldest first); only what is left over is applied to the new advance.
    let left = amountOf(expense);
    const prevAllocations = previousAdvances.map((p) => {
      const take = Math.min(left, p.remaining);
      left -= take;
      return { ...p, take };
    });
    const appliedToNew = left;

    const totalUtilized = previouslyUtilized + appliedToNew;
    // Amount the user already returned (with proof) against this advance.
    const returnedBack = Number(advance.custom_fields?.advance_returned_amount) || 0;
    const remaining = original - totalUtilized - returnedBack;
    const prevUpdates = prevAllocations
      .filter((p) => p.take > 0)
      .map((p) =>
        supabase
          .from("expense_new")
          .update({
            custom_fields: {
              ...p.custom_fields,
              advance_utilized_amount: p.used + p.take,
              advance_remaining_amount: p.remaining - p.take,
              advance_updated_at: at,
            },
          })
          .eq("id", p.id)
      );

    // Update the advance record (what the Advance Payment page reads) and
    // record the adjustment on the expense, which also guards against re-runs.
    const [advRes, expRes, ...prevRes] = await Promise.all([
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
              applied_to_new: appliedToNew,
              total_utilized: totalUtilized,
              remaining_amount: remaining,
              adjusted_at: at,
            },
          },
        })
        .eq("id", expense.id),
      ...prevUpdates,
    ]);
    if (advRes.error) throw advRes.error;
    if (expRes.error) throw expRes.error;
    prevRes.forEach((r: any) => {
      if (r?.error) throw r.error;
    });

    // Total Advance = previous advances' remaining balances + new advance amount.
    // The previous advances' used part is already out of their remaining, so only
    // usage against the new advance counts as "previously used" (no double count).
    const prevTotalRemaining = previousAdvances.reduce((s, p) => s + p.remaining, 0);
    const combinedAdvance = prevTotalRemaining + original - returnedBack;
    const combinedPrevUsed = previouslyUtilized;
    const combinedTotal = combinedPrevUsed + adjusted;
    const combinedRemaining = combinedAdvance - combinedTotal;

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

    const hasPrev = previousAdvances.length > 0;
    // The ID of the advance record actually used (not the expense's own ID,
    // which may carry the "advance_" prefix).
    const newAdvanceId = String(advance.unique_id || "").trim() || uniqueId;
    // Sections: [title, rows]. The layout is always Previous / New / Summary;
    // "Previous Advance Details" shows N/A when no earlier balance is left.
    const sections: [string, [string, string][]][] = [];
    // Every previous advance that had a balance before this expense is listed,
    // including one this expense completes.
    const shownPrev = allPreviousAdvances;
    if (shownPrev.length > 0) {
      shownPrev.forEach((p, i) => {
        sections.push([
          shownPrev.length > 1 ? `Previous Advance Details (${i + 1})` : "Previous Advance Details",
          [
            ["Previous Advance ID", p.uniqueId],
            ["Previous Advance Amount", `₹${money(p.amount)}`],
            ["Previous Remaining Amount", `₹${money(p.remaining)}`],
            ["Paid Approval Time", fmtTime(p.paidAt)],
          ],
        ]);
      });
    } else {
      sections.push([
        "Previous Advance Details",
        [
          ["Previous Advance ID", "N/A"],
          ["Previous Advance Amount", "N/A"],
          ["Previous Remaining Amount", "N/A"],
          ["Paid Approval Time", "N/A"],
        ],
      ]);
    }
    sections.push([
      "New Advance Details",
      [
        ["New Advance ID", newAdvanceId],
        ["New Advance Amount", `₹${money(original)}`],
        ["Paid Approval Time", fmtTime(advance.paid_approval_time)],
      ],
    ]);
    sections.push([
      "Advance Amount Summary",
      [
        ["Advance Unique ID", uniqueId],
        [
          hasPrev ? "Total Advance Amount(Previous Remaining + New Advance)" : "Total Advance Amount",
          `₹${money(combinedAdvance)}`,
        ],
        ["Total Amount Previously Used Against Advance", `₹${money(combinedPrevUsed)}`],
        ["New Expense Amount Against Advance", `₹${money(adjusted)}`],
        ["Total Amount", `₹${money(combinedTotal)}`],
        ["Remaining Advance Amount", `₹${money(combinedRemaining)}`],
      ],
    ]);
    const intro = hasPrev
      ? "Your new advance has been processed while you still have a remaining balance from your previous advance. Please find your previous and new advance details below."
      : "Your expense has been adjusted against your advance. Please find your advance details below.";
    const note = "";
    const textBody = sections.flatMap(([title, r]) => [
      ...(title ? ["", title] : []),
      ...r.map(([k, v]) => `${k} : ${v}`),
    ]);

    try {
      await transporter.sendMail({
        from: smtpFrom(),
        to: creator.email,
        // A per-send suffix keeps Gmail from threading these mails together and
        // collapsing the repeated Previous/New sections behind "...".
        subject: `Reminder: Remaining Amount Against Advance (${newAdvanceId} - ${fmtTime(at)})`,
        text: [`Hi ${name},`, "", intro, ...textBody, ...(note ? ["", note] : []), "", "Regards,", "Payment Dashboard"].join("\n"),
        html: `<!DOCTYPE html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /></head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; margin: 0; padding: 0;">
  <div style="max-width: 640px; margin: 20px auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
    <div style="background: #111827; color: #ffffff; padding: 16px 20px;"><h1 style="margin:0;font-size:18px;">Advance payment update${orgName ? ` from ${escapeHtml(orgName)}` : ""}</h1><div style="margin-top:4px;font-size:12px;color:#d1d5db;">${escapeHtml(`Advance ${newAdvanceId} · ${fmtTime(at)}`)}</div></div>
    <div style="padding: 20px; color: #111827;">
      <p><strong>Hi ${escapeHtml(name)},</strong></p>
      <p>${escapeHtml(intro)}</p>
      ${sections
        .map(
          ([title, r]) =>
            `${title ? `<h3 style="margin: 18px 0 8px; font-size: 15px;">${escapeHtml(title)}</h3>` : ""}<table style="border-collapse: collapse; width: 100%;">${r
              .map(
                ([k, v]) =>
                  `<tr><td style="padding: 8px; border: 1px solid #e5e7eb; background: #f9fafb;"><strong>${escapeHtml(k)}</strong></td><td style="padding: 8px; border: 1px solid #e5e7eb;">${escapeHtml(v)}</td></tr>`
              )
              .join("")}</table>`
        )
        .join("")}
      ${note ? `<p style="margin-top: 16px;"><strong>${escapeHtml(note)}</strong></p>` : ""}
      <p style="margin-top: 16px;">Regards,<br/>Payment Dashboard</p>
    </div>
    <div style="padding: 12px 20px; font-size: 12px; color: #6b7280; background: #f9fafb;">This is an automated message from the reimbursement dashboard.<br/>${escapeHtml(`Ref: ${newAdvanceId} · ${fmtTime(at)} · ${expense.id}`)}</div>
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
