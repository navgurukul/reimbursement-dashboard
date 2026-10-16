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

        // Filter out redundant Location and Location Of Expense entries
        const filteredHistory = (data || []).filter((item: any) => {
          if (item.action_type === "updated" && item.old_value && item.new_value) {
            const oldMatch = item.old_value.match(/^([^:]+):\s*(.*)$/);
            if (oldMatch) {
              const fieldName = oldMatch[1].trim().toLowerCase();
              if (fieldName === "location" || fieldName === "location of expense") {
                return false;
              }
            }
          }
          return true;
        });

        setHistory(filteredHistory);
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
          // Check if the value starts with a field name, e.g. "Amount: 50"
          const oldMatch = oldValue.match(/^([^:]+):\s*(.*)$/);
          const newMatch = newValue.match(/^([^:]+):\s*(.*)$/);
          
          if (oldMatch && newMatch && oldMatch[1] === newMatch[1]) {
            return (
              <>
                Changed <span className="font-semibold">{oldMatch[1]}</span> from "{oldMatch[2]}" to "{newMatch[2]}"
              </>
            );
          }

          const knownStatuses = [
            "submitted",
            "approved",
            "rejected",
            "finance_approved",
            "finance_rejected",
          ];
          if (
            knownStatuses.includes(String(oldValue).trim().toLowerCase()) ||
            knownStatuses.includes(String(newValue).trim().toLowerCase())
          ) {
            return (
              <>
                Changed <span className="font-semibold">Expense Status</span> from "{oldValue}" to "{newValue}"
              </>
            );
          }
          
          // If it looks like an amount (numeric)
          if (!isNaN(parseFloat(oldValue)) && !isNaN(parseFloat(newValue))) {
            return (
               <>Changed <span className="font-semibold">Amount</span> from {oldValue} to {newValue}</>
            );
          }
          return (
             <>Changed from "{oldValue}" to "{newValue}"</>
          );
        }
        return `Value updated to "${newValue}"`;
      case "approved":
        return "Expense approved";
      case "rejected":
        return "Expense rejected";
      case "finance_approved":
        return "Approved by Finance";
      case "financerejected":
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

  if (history.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500">
        No history available for this expense.
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {history.map((item, index) => (
        <div key={item.id} className="relative pb-5">
          {/* Timeline connector */}
          {index < history.length - 1 && (
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
                  {item.profile?.full_name || item.user_name}
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
