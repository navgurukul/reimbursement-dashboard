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
    <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded">
      <div className="flex items-start">
        <AlertCircle className="h-5 w-5 text-amber-400 mr-2 mt-0.5" />
        <div>
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
