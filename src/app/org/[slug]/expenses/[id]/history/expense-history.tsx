import { useState, useEffect } from "react";
import { expenseHistory } from "@/lib/db";
import { formatDateTime } from "@/lib/utils";
import { ClockIcon } from "lucide-react";
import { ExpenseStatusBadge } from "@/components/ExpenseStatusBadge";

interface ExpenseHistoryProps {
  expenseId: string;
}

export default function ExpenseHistory({ expenseId }: ExpenseHistoryProps) {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadHistory() {
      try {
        const { data, error } = await expenseHistory.getByExpenseId(expenseId);

        if (error) {
          console.error("Error loading history:", error);
          return;
        }

        setHistory(data || []);
      } catch (error) {
        console.error("Failed to load expense history:", error);
      } finally {
        setLoading(false);
      }
    }

    loadHistory();
  }, [expenseId]);

  // Generate message based on action type and details
  function getActivityMessage(item: any) {
    const actionType = item.action_type;
    const oldValue = item.old_value;
    const newValue = item.new_value;

    switch (actionType) {
      case "created":
        return `Expense created with amount ${newValue || "0"}`;
      case "updated":
        if (oldValue && newValue) {
          // If it looks like an amount (numeric)
          if (!isNaN(parseFloat(oldValue)) && !isNaN(parseFloat(newValue))) {
            return `Amount changed from ${oldValue} to ${newValue}`;
          }
          return `Changed from "${oldValue}" to "${newValue}"`;
        }
        return `Value updated to "${newValue}"`;
      case "approved":
        return "Expense approved";
      case "rejected":
        return "Expense rejected";
      case "finance_approved":
        return "Approved by Finance";
      case "finance_rejected":
        return "Rejected by Finance";
      default:
        return `Action: ${actionType}`;
    }
  }

  if (loading) {
    return (
      <div className="text-center py-4 text-gray-500">Loading history...</div>
    );
  }

  // Filter out unwanted history items (like empty string updates or raw UUID updates)
  const filteredHistory = history.filter((item) => {
    if (item.action_type === "updated") {
      const msg = getActivityMessage(item);
      
      // Hide if the message is exactly "Value updated to """
      if (msg === 'Value updated to ""') {
        return false;
      }
      
      // Hide if the message is "Value updated to "null"" or "Value updated to "undefined"" just in case
      if (msg === 'Value updated to "null"' || msg === 'Value updated to "undefined"') {
        return false;
      }
      
      // Hide if it's updating to a UUID
      if (msg.match(/^Value updated to "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"$/i)) {
        return false;
      }
    }
    return true;
  });

  if (filteredHistory.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500">
        No history available for this expense.
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {filteredHistory.map((item, index) => (
        <div key={item.id} className="relative pb-5">
          {/* Timeline connector */}
          {index < filteredHistory.length - 1 && (
            <div
              className="absolute left-4 top-10 h-full w-[1px] bg-gray-200"
              aria-hidden="true"
            ></div>
          )}

          <div className="flex items-start space-x-3">
            {/* Clock icon */}
            <div className="relative flex-shrink-0 mt-0.5">
              <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
                <ClockIcon className="h-4 w-4 text-blue-500" />
              </div>
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <ExpenseStatusBadge status={item.action_type} />
                <span className="text-sm font-medium text-gray-800">
                  {item.user_name}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-1">
                {formatDateTime(item.created_at)}
              </p>
              <div className="text-sm text-gray-700">
                <p>{getActivityMessage(item)}</p>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
