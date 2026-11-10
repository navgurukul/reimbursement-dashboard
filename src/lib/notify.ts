import { toast } from "sonner";

export type NotificationKind = "approver" | "creator" | "comment" | "transfer";

const WARNINGS: Record<NotificationKind, string> = {
  approver:
    "Email notification could not be sent to the approver. Please inform them directly.",
  creator:
    "Email notification could not be sent to the expense creator. Please inform them directly.",
  comment:
    "Comment was added, but the email notification could not be sent.",
  transfer:
    "Expense transferred, but the email notification could not be sent to the second approver.",
};

/**
 * Calls a notify-* API route and shows a warning toast if the email was not
 * sent (network error, non-2xx response, or the server reporting nothing sent).
 * Never throws; returns true only when the email was sent.
 */
export async function sendExpenseNotification(
  kind: NotificationKind,
  payload: Record<string, unknown>
): Promise<boolean> {
  try {
    const res = await fetch(`/api/expenses/notify-${kind}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let body: any = null;
    try {
      body = await res.json();
    } catch {
      // response had no JSON body
    }

    if (!res.ok || body?.sent === 0) {
      const reason = body?.error || body?.message;
      console.warn(`notify-${kind} failed:`, reason || res.status);
      toast.warning(WARNINGS[kind], reason ? { description: reason } : undefined);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`notify-${kind} request failed:`, err);
    toast.warning(WARNINGS[kind], {
      description: "Network error while contacting the email service.",
    });
    return false;
  }
}
