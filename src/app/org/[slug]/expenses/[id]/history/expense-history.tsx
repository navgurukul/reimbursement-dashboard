

import { useState, useEffect } from 'react';
import { expenseHistory } from '@/lib/db';
import { format } from 'date-fns';
import { ClockIcon } from 'lucide-react';

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
  
  // Get badge color based on action type
  function getBadgeClass(actionType: string) {
    switch(actionType) {
      case 'approved':
        return 'bg-green-500 text-white';
      case 'rejected':
        return 'bg-red-500 text-white';
      case 'finance_approved':
        return 'bg-emerald-600 text-white';
      case 'finance_rejected':
        return 'bg-rose-600 text-white';
      case 'updated':
        return 'bg-blue-500 text-white';
      case 'created':
        return 'bg-slate-700 text-white';
      default:
        return 'bg-slate-700 text-white';
    }
  }
  
  // Get display text for action type
  function getActionDisplayText(actionType: string) {
    switch(actionType) {
      case 'approved':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      case 'finance_approved':
        return 'Finance Approved';
      case 'finance_rejected':
        return 'Finance Rejected';
      case 'updated':
        return 'Updated';
      case 'created':
        return 'Created';
      default:
        return actionType.charAt(0).toUpperCase() + actionType.slice(1);
    }
  }
  
  // Generate message based on action type and details
  function getActivityMessage(item: any) {
    const actionType = item.action_type;
    const oldValue = item.old_value;
    const newValue = item.new_value;
    
    switch(actionType) {
      case 'created':
        return `Expense created with amount ${newValue || '0'}`;
      case 'updated':
        if (oldValue && newValue) {
          // If it looks like an amount (numeric)
          if (!isNaN(parseFloat(oldValue)) && !isNaN(parseFloat(newValue))) {
            return `Amount changed from ${oldValue} to ${newValue}`;
          }
          return `Changed from "${oldValue}" to "${newValue}"`;
        }
        return `Value updated to "${newValue}"`;
      case 'approved':
        return 'Expense approved';
      case 'rejected':
        return 'Expense rejected';
      case 'finance_approved':
        return 'Approved by Finance';
      case 'finance_rejected':
        return 'Rejected by Finance';
      default:
        return `Action: ${actionType}`;
    }
  }
  
  if (loading) {
    return <div className="text-center py-4 text-gray-500">Loading history...</div>;
  }
  
  if (history.length === 0) {
    return <div className="text-center py-4 text-gray-500">No history available for this expense.</div>;
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
                <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getBadgeClass(item.action_type)}`}>
                  {getActionDisplayText(item.action_type)}
                </div>
                <span className="text-sm font-medium text-gray-800">
                  {item.user_name}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-1">
                {format(new Date(item.created_at), 'MMM dd, yyyy, h:mm a')}
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