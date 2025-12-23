import { Badge } from "@/components/ui/badge";

type StatusMeta = {
  label: string;
  className: string;
};

const STATUS_BADGE_META: Record<string, StatusMeta> = {
  submitted: {
    label: "Submitted",
    className:
      "bg-amber-100 text-amber-800 hover:bg-amber-700 hover:text-white",
  },
  approved: {
    label: "Manager Approved",
    className:
      "bg-green-100 text-green-800 hover:bg-green-700 hover:text-white",
  },
  approved_as_per_policy: {
    label: "Approved as per Policy",
    className:
      "bg-green-100 text-green-800 hover:bg-green-700 hover:text-white",
  },
  rejected: {
    label: "Manager Rejected",
    className: "bg-red-100 text-red-800 hover:bg-red-700 hover:text-white",
  },
  manager_rejected: {
    label: "Manager Rejected",
    className: "bg-red-100 text-red-800 hover:bg-red-700 hover:text-white",
  },
  finance_approved: {
    label: "Finance Approved",
    className:
      "bg-green-100 text-green-800 hover:bg-green-700 hover:text-white",
  },
  finance_rejected: {
    label: "Finance Rejected",
    className: "bg-red-100 text-red-800 hover:bg-red-700 hover:text-white",
  },
  payment_processed: {
    label: "Payment successful",
    className: "bg-blue-100 text-blue-800 hover:bg-blue-700 hover:text-white",
  },
  payment_not_processed: {
    label: "Payment has been rejected",
    className: "bg-red-100 text-red-800 hover:bg-red-700 hover:text-white",
  },
  ready_for_payment: {
    label: "Ready for Payment",
    className: "bg-blue-100 text-blue-800 hover:bg-blue-700 hover:text-white",
  },
  draft: {
    label: "Draft",
    className: "bg-gray-100 text-gray-800 hover:bg-gray-700 hover:text-white",
  },
  reimbursed: {
    label: "Reimbursed",
    className: "bg-gray-100 text-gray-800 hover:bg-gray-700 hover:text-white",
  },
  paid: {
    label: "Paid",
    className:
      "bg-green-100 text-green-800 hover:bg-green-700 hover:text-white",
  },
  updated: {
    label: "Updated",
    className: "bg-blue-100 text-blue-800 hover:bg-blue-700 hover:text-white",
  },
  created: {
    label: "Created",
    className:
      "bg-slate-100 text-slate-800 hover:bg-slate-700 hover:text-white",
  },
};

function getStatusMeta(status?: string | null): StatusMeta {
  if (!status) {
    return {
      label: "Unknown",
      className: "bg-gray-100 text-gray-800 hover:bg-gray-700 hover:text-white",
    };
  }

  const meta = STATUS_BADGE_META[status.toLowerCase()];
  if (meta) return meta;

  // Fallback for unknown statuses - format nicely
  const fallbackLabel = status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

  return {
    label: fallbackLabel,
    className: "bg-gray-100 text-gray-800 hover:bg-gray-700 hover:text-white",
  };
}

interface ExpenseStatusBadgeProps {
  status?: string | null;
  className?: string;
}

export function ExpenseStatusBadge({
  status,
  className,
}: ExpenseStatusBadgeProps) {
  const { label, className: statusClassName } = getStatusMeta(status);

  return (
    <Badge className={`${statusClassName} ${className || ""}`}>{label}</Badge>
  );
}

// Event timeline status badge (for event list views)
interface EventStatusBadgeProps {
  startDate: string;
  endDate: string;
  className?: string;
}

export function EventStatusBadge({
  startDate,
  endDate,
  className,
}: EventStatusBadgeProps) {
  const getEventStatus = () => {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (now >= start && now <= end) {
      return { label: "Ongoing", className: "bg-green-100 text-green-800" };
    } else if (now < start) {
      return { label: "Upcoming", className: "bg-blue-100 text-blue-800" };
    } else {
      return { label: "Past", className: "bg-gray-300 text-gray-800" };
    }
  };

  const { label, className: statusClassName } = getEventStatus();

  return (
    <Badge
      variant="outline"
      className={`${statusClassName} ${className || ""}`}
    >
      {label}
    </Badge>
  );
}
