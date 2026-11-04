// src/components/policy-alert.tsx

import { AlertCircle } from "lucide-react";
import { Policy } from "@/lib/db";

interface PolicyAlertProps {
  expense: any;
  policy: Policy;
}

export function PolicyAlert({ expense, policy }: PolicyAlertProps) {
  if (!policy.upper_limit || expense.amount <= policy.upper_limit) {
    return null;
  }

  return (
    <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-md">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 mt-0.5" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-amber-800">
            Expense exceeds policy limit
          </p>
          <p className="text-sm text-amber-700">
            The amount (₹{expense.amount}) is above the policy limit of ₹
            {policy.upper_limit} for {expense.expense_type}.
          </p>
        </div>
      </div>
    </div>
  );
}
