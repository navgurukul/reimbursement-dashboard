


// // src/components/expense-history.tsx
// import { useState, useEffect } from 'react';
// import { getExpenseHistory } from '@/lib/db';
// import { format } from 'date-fns';
// import { ClockIcon } from 'lucide-react';

// interface ExpenseHistoryProps {
//   expenseId: string;
// }

// export default function ExpenseHistory({ expenseId }: ExpenseHistoryProps) {
//   const [history, setHistory] = useState<any[]>([]);
//   const [loading, setLoading] = useState(true);
  
//   useEffect(() => {
//     async function loadHistory() {
//       try {
//         console.log('Fetching history for expense ID:', expenseId);
//         const data = await getExpenseHistory(expenseId);
//         console.log('History data received:', data);
        
//         // Process the data to handle both flattened and metadata structures
//         const processedData = data.map(item => {
//           // Extract metadata if available
//           const metadataItem = Array.isArray(item.metadata) && item.metadata.length > 0 
//             ? item.metadata[0] 
//             : null;
          
//           return {
//             ...item,
//             processed_action_type: item.action_type || (metadataItem ? metadataItem.action_type : null),
//             processed_field: item.field_name || (metadataItem ? metadataItem.field : null),
//             processed_old_value: item.old_value || (metadataItem ? metadataItem.previous_value : null),
//             processed_new_value: item.new_value || (metadataItem ? metadataItem.current_state : null),
//             processed_notes: item.notes || (metadataItem && metadataItem.notes ? metadataItem.notes : null),
//             processed_user: item.user_name || 'Unknown User'
//           };
//         });
        
//         setHistory(processedData);
//       } catch (error) {
//         console.error("Failed to load expense history:", error);
//       } finally {
//         setLoading(false);
//       }
//     }
    
//     loadHistory();
//   }, [expenseId]);
  
//   // Get badge color based on action type
//   function getBadgeClass(actionType: string) {
//     switch(actionType) {
//       case 'approved':
//       case 'approved_with_policy':
//       case 'approved_above_policy':
//         return 'bg-green-500 text-white';
//       case 'rejected':
//         return 'bg-red-500 text-white';
//       case 'submitted':
//         return 'bg-blue-500 text-white';
//       case 'updated':
//       case 'edited':
//         return 'bg-blue-500 text-white';
//       case 'created':
//         return 'bg-slate-700 text-white';
//       default:
//         return 'bg-slate-700 text-white';
//     }
//   }
  
//   // Get display text for action type
//   function getActionDisplayText(actionType: string) {
//     switch(actionType) {
//       case 'approved':
//       case 'approved_with_policy':
//       case 'approved_above_policy':
//         return 'Approved';
//       case 'rejected':
//         return 'Rejected';
//       case 'submitted':
//         return 'Submitted';
//       case 'edited':
//         return 'Updated';
//       case 'updated':
//         return 'Updated';
//       case 'created':
//         return 'Created';
//       default:
//         return actionType || 'Unknown';
//     }
//   }
  
//   // Generate message based on action type and details
//   function getActivityMessage(item: any) {
//     const actionType = item.processed_action_type;
//     const fieldName = item.processed_field;
//     const oldValue = item.processed_old_value;
//     const newValue = item.processed_new_value;
//     const notes = item.processed_notes;
    
//     switch(actionType) {
//       case 'created':
//         return `Expense created with amount ${newValue || '0.00'}`;
//       case 'edited':
//       case 'updated':
//         if (fieldName === 'amount') {
//           return `Amount changed from ${oldValue || '0.00'} to ${newValue || '0.00'}`;
//         }
//         return `${fieldName} changed from "${oldValue}" to "${newValue}"`;
//       case 'submitted':
//         return 'Expense submitted for approval';
//       case 'approved':
//         return 'Expense approved';
//       case 'approved_with_policy':
//         return 'Expense approved as per policy';
//       case 'approved_above_policy':
//         return 'Expense approved above policy limits';
//       case 'rejected':
//         return notes ? `Expense rejected: ${notes}` : 'Expense rejected';
//       default:
//         return `Action: ${actionType || 'unknown'}`;
//     }
//   }
  
//   if (loading) {
//     return (
//       <div className="bg-white rounded-md shadow p-4">
//         <h3 className="text-lg font-medium mb-4">Activity History</h3>
//         <div className="p-4 text-center text-gray-500">Loading history...</div>
//       </div>
//     );
//   }
  
//   return (
//     <div className="bg-white rounded-md shadow p-4">
//       <h3 className="text-lg font-medium mb-4">Activity History</h3>
      
//       {history.length === 0 ? (
//         <p className="text-gray-500 text-center py-4">No history available for this expense.</p>
//       ) : (
//         <div className="space-y-0">
//           {history.map((item, index) => (
//             <div key={item.id} className="relative py-3">
//               {/* Timeline connector */}
//               {index < history.length - 1 && (
//                 <div 
//                   className="absolute left-5 top-10 h-full w-[1px] bg-gray-200" 
//                   aria-hidden="true"
//                 ></div>
//               )}
              
//               <div className="flex items-start space-x-3">
//                 {/* Clock icon */}
//                 <div className="relative flex-shrink-0 mt-1">
//                   <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center">
//                     <ClockIcon className="h-5 w-5 text-blue-500" />
//                   </div>
//                 </div>
                
//                 {/* Content */}
//                 <div className="min-w-0 flex-1">
//                   <div className="flex items-center gap-2">
//                     <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getBadgeClass(item.processed_action_type)}`}>
//                       {getActionDisplayText(item.processed_action_type)}
//                     </div>
//                     <span className="text-sm font-medium text-gray-800">
//                       {`${item.processed_user} Owner`}
//                     </span>
//                   </div>
//                   <p className="mt-0.5 text-xs text-gray-500">
//                     {format(new Date(item.created_at), 'MMM dd, yyyy, h:mm a')}
//                   </p>
//                   <div className="mt-1 text-sm text-gray-700">
//                     <p>{getActivityMessage(item)}</p>
//                   </div>
//                 </div>
//               </div>
//             </div>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }


// src/components/history/expense-history.tsx
import { useState, useEffect } from 'react';
import { getExpenseHistory } from '@/lib/db';
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
        console.log('Fetching history for expense ID:', expenseId);
        const data = await getExpenseHistory(expenseId);
        console.log('History data received:', data);
        
        // Process the data to handle both flattened and metadata structures
        const processedData = data.map(item => {
          // Extract metadata if available
          const metadataItem = Array.isArray(item.metadata) && item.metadata.length > 0 
            ? item.metadata[0] 
            : null;
          
          return {
            ...item,
            processed_action_type: item.action_type || (metadataItem ? metadataItem.action_type : null),
            processed_field: item.field_name || (metadataItem ? metadataItem.field : null),
            processed_old_value: item.old_value || (metadataItem ? metadataItem.previous_value : null),
            processed_new_value: item.new_value || (metadataItem ? metadataItem.current_state : null),
            processed_notes: item.notes || (metadataItem && metadataItem.notes ? metadataItem.notes : null),
            processed_user: item.user_name || 'System'
          };
        });
        
        setHistory(processedData);
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
      case 'approved_with_policy':
      case 'approved_above_policy':
        return 'bg-green-500 text-white';
      case 'rejected':
        return 'bg-red-500 text-white';
      case 'submitted':
        return 'bg-blue-500 text-white';
      case 'updated':
      case 'edited':
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
      case 'approved_with_policy':
      case 'approved_above_policy':
        return 'Approved';
      case 'rejected':
        return 'Rejected';
      case 'submitted':
        return 'Submitted';
      case 'edited':
        return 'Updated';
      case 'updated':
        return 'Updated';
      case 'created':
        return 'Created';
      default:
        return actionType || 'Unknown';
    }
  }
  
  // Generate message based on action type and details
  function getActivityMessage(item: any) {
    const actionType = item.processed_action_type;
    const fieldName = item.processed_field;
    const oldValue = item.processed_old_value;
    const newValue = item.processed_new_value;
    const notes = item.processed_notes;
    
    switch(actionType) {
      case 'created':
        return `Expense created with amount ${newValue || '0'}`;
      case 'edited':
      case 'updated':
        if (fieldName === 'amount') {
          return `Amount changed from ${oldValue || '0'} to ${newValue || '0'}`;
        }
        return `${fieldName} changed from "${oldValue}" to "${newValue}"`;
      case 'submitted':
        return 'Expense submitted for approval';
      case 'approved':
        return 'Expense approved';
      case 'approved_with_policy':
        return 'Expense approved as per policy';
      case 'approved_above_policy':
        return 'Expense approved above policy limits';
      case 'rejected':
        return notes ? `Expense rejected: ${notes}` : 'Expense rejected';
      default:
        return `Action: ${actionType || 'unknown'}`;
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
                <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${getBadgeClass(item.processed_action_type)}`}>
                  {getActionDisplayText(item.processed_action_type)}
                </div>
                <span className="text-sm font-medium text-gray-800">
                  {item.processed_user}
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