// Feature flags driven by environment variables.
//
// NEXT_PUBLIC_* values are inlined at build time, so each variable must be
// referenced by its literal name for Next.js to substitute it.

const readBoolean = (value: string | undefined, fallback: boolean) => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "true" || normalized === "1";
};

const readPositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Data export (CSV / XLSX) in expenses, finance records, payment processing,
 * advance payments and bank details. Disabled unless explicitly turned on.
 */
export const isExportEnabled = readBoolean(
  process.env.NEXT_PUBLIC_ENABLE_EXPORT,
  true
);

/** Rows per page in the finance Records table. */
export const recordsPerPage = readPositiveInt(
  process.env.NEXT_PUBLIC_RECORDS_PER_PAGE,
  10
);

/** List of emails allowed to access the Pune SOSC Dashboard */
export const PUNE_SOSC_ALLOWED_EMAILS = [
  "aarzoo@navgurukul.org",
  "aanista@navgurukul.org",
  "pooja.s@navgurukul.org",
];

/**
 * Checks whether an expense was rejected on or after the specified target date (16-10-2026).
 * Used to conditionally display:
 * - The "Expense Rejected by Manager / Finance" warning banner
 * - The "Edit Expense" and "Resubmit" action buttons
 * - The rejection explanation popup modal
 */
export const isDateToday = (dateString?: string | null): boolean => {
  if (!dateString) return false;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return false;

  /**
   * Target rejection date in DD-MM-YYYY format
   */
  const REJECTION_DATE = "20-10-2026";

  // Format date to "DD-MM-YYYY" in local timezone
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear());
  const formattedDate = `${day}-${month}-${year}`;

  const [tDay, tMonth, tYear] = REJECTION_DATE.split("-");

  // Check if the rejection date matches the target date or is after it
  const isTargetDate =
    formattedDate === REJECTION_DATE ||
    `${year}-${month}-${day}` >= `${tYear}-${tMonth}-${tDay}`;

  return isTargetDate;
};

export interface ResubmissionInfo {
  isResubmitted: boolean;
  rejectedBy: "Manager" | "Finance" | null;
  rejectionDate: string | null;
}

/**
 * Checks if an expense was previously rejected, then edited and resubmitted.
 * Used to display the resubmission warning banner on the Approver and Finance review views.
 */
export const getResubmissionDetails = (
  historyList?: any[] | null,
  currentStatus?: string | null
): ResubmissionInfo => {
  if (!Array.isArray(historyList) || historyList.length === 0) {
    return { isResubmitted: false, rejectedBy: null, rejectionDate: null };
  }

  // historyList is sorted descending by created_at (newest first)
  const rejectionIndex = historyList.findIndex((h) => {
    const act = (h.action_type || "").toLowerCase();
    const oldV = (h.old_value || "").toLowerCase();
    return (
      act === "rejected" ||
      act === "finance_rejected" ||
      oldV.includes("finance_rejected") ||
      oldV.includes("rejected")
    );
  });

  if (rejectionIndex === -1) {
    return { isResubmitted: false, rejectedBy: null, rejectionDate: null };
  }

  const rejectionEntry = historyList[rejectionIndex];

  // If the expense is currently rejected, it has not yet been resubmitted
  const isCurrentlyRejected =
    currentStatus === "rejected" || currentStatus === "finance_rejected";

  if (isCurrentlyRejected) {
    return { isResubmitted: false, rejectedBy: null, rejectionDate: null };
  }

  // Check if any newer entry (index < rejectionIndex) indicates resubmission or update
  const hasResubmittedEntry = historyList.slice(0, rejectionIndex).some((h) => {
    const newV = (h.new_value || "").toLowerCase();
    const act = (h.action_type || "").toLowerCase();
    return (
      newV.includes("submitted") ||
      act === "resubmitted" ||
      act === "submitted" ||
      act === "updated"
    );
  });

  const isResubmitted =
    currentStatus === "submitted" ||
    currentStatus === "approved" ||
    hasResubmittedEntry;

  if (!isResubmitted) {
    return { isResubmitted: false, rejectedBy: null, rejectionDate: null };
  }

  const act = (rejectionEntry.action_type || "").toLowerCase();
  const oldV = (rejectionEntry.old_value || "").toLowerCase();
  const isFinance =
    act === "finance_rejected" ||
    oldV.includes("finance_rejected") ||
    rejectionEntry.actor_type === "finance";

  return {
    isResubmitted: true,
    rejectedBy: isFinance ? "Finance" : "Manager",
    rejectionDate: rejectionEntry.created_at || null,
  };
};
