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
 * Checks whether an expense was rejected on the specified target date (16-10-2026).
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
  const REJECTION_DATE = "16-10-2026";

  // Format date to "DD-MM-YYYY" in local timezone
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear());
  const formattedDate = `${day}-${month}-${year}`;

  // Check if the rejection date matches the target date
  const isTargetDate = formattedDate === REJECTION_DATE;

  return isTargetDate;
};
