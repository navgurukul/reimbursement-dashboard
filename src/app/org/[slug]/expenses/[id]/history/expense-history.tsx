// "use client";

// import { useState, useEffect } from 'react';
// import { format } from 'date-fns';
// import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
// import { Spinner } from '@/components/ui/spinner';
// import { Clock } from 'lucide-react';
// import supabase from '@/lib/supabase';

// interface ExpenseHistoryItem {
//   id: string;
//   expense_id: string;
//   user_id: string;
//   action_type: string | null;
//   changed_field: string | null;
//   old_value: string | null;
//   new_value: string | null;
//   created_at: string;
//   user_name?: string;
//   metadata?: any[];
// }

// interface ExpenseHistoryProps {
//   expenseId: string;
// }

// export default function ExpenseHistory({ expenseId }: ExpenseHistoryProps) {
//   const [history, setHistory] = useState<ExpenseHistoryItem[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [error, setError] = useState<string | null>(null);

//   useEffect(() => {
//     async function fetchHistory() {
//       try {
//         setLoading(true);

//         const { data, error } = await supabase
//           .rpc('get_expense_history', { expense_id_param: expenseId });

//         if (error) {
//           console.error('Error fetching expense history:', error);
//           setError(error.message);
//           return;
//         }

//         if (!data || data.length === 0) {
//           setHistory([]);
//           return;
//         }

//         const processedHistory = data.map((record: any) => {
//           // Try to get user_name from metadata
//           let userName = 'System';
//           if (record.metadata && Array.isArray(record.metadata) && record.metadata.length > 0) {
//             // Loop through metadata to find matching action
//             for (const item of record.metadata) {
//               // If this metadata item matches the current record's action_type and fields
//               if (item.action_type === record.action_type &&
//                  item.field === record.changed_field &&
//                  item.current_state === record.new_value) {
//                 if (item.user_name) {
//                   userName = item.user_name;
//                   break;
//                 }
//               }
//             }
//           }

//           return {
//             id: record.id,
//             expense_id: record.expense_id,
//             user_id: record.user_id,
//             user_name: userName,
//             action_type: record.action_type,
//             changed_field: record.changed_field,
//             old_value: record.old_value,
//             new_value: record.new_value,
//             created_at: record.created_at,
//             metadata: record.metadata
//           };
//         });

//         // Sort by timestamp (newest first)
//         processedHistory.sort((a: ExpenseHistoryItem, b: ExpenseHistoryItem) => {
//           return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
//         });

//         setHistory(processedHistory);
//       } catch (err) {
//         console.error('Failed to load history:', err);
//         setError('Failed to load history');
//       } finally {
//         setLoading(false);
//       }
//     }

//     if (expenseId) {
//       fetchHistory();
//     }
//   }, [expenseId]);

//   // Helper function to get status badge style
//   const getStatusBadge = (actionType: string | null) => {
//     if (!actionType) {
//       return {
//         label: 'Updated',
//         className: 'bg-blue-600 text-white rounded-full px-3 py-1 text-xs font-medium'
//       };
//     }

//     switch (actionType.toLowerCase()) {
//       case 'created':
//       case 'submitted':
//         return {
//           label: 'Submitted',
//           className: 'bg-slate-600 text-white rounded-full px-3 py-1 text-xs font-medium'
//         };
//       case 'updated':
//         return {
//           label: 'Updated',
//           className: 'bg-blue-600 text-white rounded-full px-3 py-1 text-xs font-medium'
//         };
//       case 'approved':
//         return {
//           label: 'Approved',
//           className: 'bg-green-600 text-white rounded-full px-3 py-1 text-xs font-medium'
//         };
//       case 'rejected':
//         return {
//           label: 'Rejected',
//           className: 'bg-red-600 text-white rounded-full px-3 py-1 text-xs font-medium'
//         };
//       default:
//         return {
//           label: actionType.charAt(0).toUpperCase() + actionType.slice(1),
//           className: 'bg-gray-600 text-white rounded-full px-3 py-1 text-xs font-medium'
//         };
//     }
//   };

//   // Format date for display
//   const formatDate = (dateString: string) => {
//     try {
//       const date = new Date(dateString);
//       return {
//         date: format(date, 'MMM d, yyyy'),
//         time: format(date, 'h:mm a')
//       };
//     } catch (e) {
//       return { date: 'Invalid date', time: '' };
//     }
//   };

//   // Get comment or description about action
//   const getActionDescription = (item: ExpenseHistoryItem) => {
//     try {
//       if (item.action_type === 'created' || item.action_type === 'submitted') {
//         return `Expense created with amount ${item.new_value || '0'}`;
//       }

//       if (item.action_type === 'updated' && item.changed_field === 'amount') {
//         return `Amount changed from ${item.old_value || '0'} to ${item.new_value || '0'}`;
//       }

//       if (item.changed_field === 'status') {
//         return `Status changed from ${item.old_value || 'pending'} to ${item.new_value || 'unknown'}`;
//       }

//       // Generic handling for other field changes
//       if (item.old_value && item.new_value) {
//         const fieldName = item.changed_field?.charAt(0).toUpperCase() + (item.changed_field?.slice(1) || '');
//         return `${fieldName} changed from ${item.old_value} to ${item.new_value}`;
//       }

//       return null;
//     } catch (error) {
//       return 'Action performed';
//     }
//   };

//   if (loading) {
//     return (
//       <Card>
//         <CardHeader>
//           <CardTitle className="flex items-center">
//             <Clock className="mr-2 h-5 w-5" />
//             Activity History
//           </CardTitle>
//         </CardHeader>
//         <CardContent>
//           <div className="flex items-center justify-center p-4">
//             <Spinner size="md" />
//           </div>
//         </CardContent>
//       </Card>
//     );
//   }

//   if (error) {
//     return (
//       <Card>
//         <CardHeader>
//           <CardTitle className="flex items-center">
//             <Clock className="mr-2 h-5 w-5" />
//             Activity History
//           </CardTitle>
//         </CardHeader>
//         <CardContent>
//           <div className="text-center text-red-500 p-4">Error: {error}</div>
//         </CardContent>
//       </Card>
//     );
//   }

//   return (
//     <Card>
//       <CardHeader>
//         <CardTitle className="flex items-center">
//           <Clock className="mr-2 h-5 w-5" />
//           Activity History
//         </CardTitle>
//       </CardHeader>
//       <CardContent>
//         {history.length === 0 ? (
//           <div className="text-center text-muted-foreground p-4">No history available</div>
//         ) : (
//           <div className="space-y-8 relative">
//             {/* Vertical line */}
//             <div className="absolute top-0 bottom-0 left-4 w-0.5 bg-gray-200"></div>

//             {history.map((item) => {
//               const status = getStatusBadge(item.action_type);
//               const dateTime = formatDate(item.created_at);
//               const description = getActionDescription(item);

//               return (
//                 <div key={item.id} className="relative pl-12">
//                   {/* Time circle */}
//                   <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center">
//                     <Clock className="h-4 w-4 text-blue-500" />
//                   </div>

//                   <div className="flex flex-col">
//                     <div className="flex items-center gap-3">
//                       <span className={status.className}>
//                         {status.label}
//                       </span>
//                       <span className="font-medium">
//                         {item.user_name}
//                       </span>
//                     </div>

//                     <div className="text-sm text-gray-500 mt-1">
//                       {dateTime.date}, {dateTime.time}
//                     </div>

//                     {description && (
//                       <div className="mt-2 text-sm">
//                         {description}
//                       </div>
//                     )}
//                   </div>
//                 </div>
//               );
//             })}
//           </div>
//         )}
//       </CardContent>
//     </Card>
//   );
// }

"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Clock } from "lucide-react";
import supabase from "@/lib/supabase";

interface MetadataItem {
  field: string;
  previous_value: any;
  current_state: any;
  action_type: string;
  timestamp: string;
  user_name?: string;
}

interface ExpenseHistoryItem {
  id: string;
  expense_id: string;
  user_id: string;
  action_type: string;
  changed_field?: string;
  old_value?: string | null;
  new_value?: string | null;
  created_at: string;
  user_name?: string;
  metadata?: MetadataItem[];
  expenseAmount?: number; // Add this field to store the current expense amount
}

interface ExpenseHistoryProps {
  expenseId: string;
}

export default function ExpenseHistory({ expenseId }: ExpenseHistoryProps) {
  const [history, setHistory] = useState<ExpenseHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>('System');

  useEffect(() => {
    async function fetchHistory() {
      if (!expenseId) return;
      
      try {
        setLoading(true);
        setError(null);
        
        // Get current user name from localStorage
        let currentUserName = 'System';
        try {
          const authStorage = localStorage.getItem('auth-storage');
          if (authStorage) {
            const authData = JSON.parse(authStorage);
            currentUserName = authData?.state?.user?.profile?.full_name || 
                            authData?.state?.profile?.full_name || 
                            'System';
            console.log("Current user name from storage:", currentUserName);
          }
        } catch (e) {
          console.error('Error getting user name from local storage:', e);
        }
        
        console.log('Fetching history for expense ID:', expenseId);
        
        // First get the expense amount - we'll need this for submitted entries
        const { data: expense, error: expenseError } = await supabase
          .from("expenses")
          .select("amount, expense_type")
          .eq("id", expenseId)
          .single();
          
        if (expenseError) {
          console.error('Error fetching expense:', expenseError);
        }
        
        const expenseAmount = expense?.amount || 0;
        console.log("Expense amount from database:", expenseAmount);
        
        // Direct query to get the history data
        const { data, error } = await supabase
          .from("expense_history")
          .select("*")
          .eq("expense_id", expenseId)
          .order("created_at", { ascending: false });
        
        console.log('Direct query response:', data);
        
        if (error) {
          console.error('Error fetching expense history:', error);
          setError(`Error: ${error.message}`);
          setLoading(false);
          return;
        }
  
        if (!data || !Array.isArray(data) || data.length === 0) {
          setHistory([]);
          setLoading(false);
          return;
        }
  
        // Debug the first record to see its structure
        if (data.length > 0) {
          console.log("First history record raw data:", data[0]);
          console.log("user_name value in record:", data[0].user_name);
          console.log("metadata in record:", data[0].metadata);
          console.log("new_value in record:", data[0].new_value);
          
          if (data[0].metadata && Array.isArray(data[0].metadata) && data[0].metadata.length > 0) {
            console.log("First metadata item:", data[0].metadata[0]);
            console.log("user_name in first metadata item:", data[0].metadata[0].user_name);
            console.log("current_state in first metadata item:", data[0].metadata[0].current_state);
          }
        }
  
        // Format the data to match the ExpenseHistoryItem interface
        const formattedData = data.map((item: any) => {
          // Try to find user_name in multiple places
          let userName = item.user_name;
          
          // For submitted/created items, use the current user's name
          if ((item.action_type === 'submitted' || item.action_type === 'created') && !userName) {
            userName = currentUserName;
            console.log(`Using current user name for ${item.action_type} record:`, userName);
          }
          
          // If no user_name in the main record, try to find it in metadata
          if (!userName && item.metadata && Array.isArray(item.metadata)) {
            const metadataWithUserName = item.metadata.find((m: any) => m.user_name);
            if (metadataWithUserName) {
              userName = metadataWithUserName.user_name;
              console.log("Found user_name in metadata:", userName);
            }
          }
          
          // Try to extract the amount from various sources
          let amount = null;
          
          // First check if we have an amount in new_value
          if (item.new_value && !isNaN(Number(item.new_value))) {
            amount = Number(item.new_value);
            console.log("Found amount in new_value:", amount);
          }
          // Then check if it's an amount field with a value
          else if (item.changed_field === 'amount' && item.new_value) {
            amount = Number(item.new_value);
            console.log("Found amount in changed_field amount + new_value:", amount);
          }
          // Then check in metadata
          else if (item.metadata && Array.isArray(item.metadata)) {
            const amountMeta = item.metadata.find((m: any) => 
              m.field === 'amount' && m.current_state !== undefined);
            
            if (amountMeta && amountMeta.current_state) {
              amount = Number(amountMeta.current_state);
              console.log("Found amount in metadata:", amount);
            }
          }
          // Default to the expense amount
          else if (item.action_type === 'submitted' || item.action_type === 'created') {
            amount = expenseAmount;
            console.log("Using expense amount from database:", amount);
          }
          
          const historyItem = {
            id: item.id,
            expense_id: item.expense_id,
            user_id: item.user_id,
            action_type: item.action_type,
            changed_field: item.changed_field || '',
            old_value: item.old_value,
            new_value: item.new_value,
            created_at: item.created_at,
            user_name: userName || 'System',
            metadata: item.metadata || [],
            expenseAmount: amount || expenseAmount
          };
          
          console.log(`Formatted history item for ${item.id} with user_name:`, historyItem.user_name);
          console.log(`Formatted history item for ${item.id} with expenseAmount:`, historyItem.expenseAmount);
          return historyItem;
        });
        
        console.log('Formatted history data:', formattedData);
        
        // Set the history data
        setHistory(formattedData);
      } catch (err) {
        console.error('Failed to load history:', err);
        setError('Failed to load history');
      } finally {
        setLoading(false);
      }
    }
  
    fetchHistory();
  }, [expenseId]);

  // Helper function to get status badge style
  const getStatusBadge = (actionType: string) => {
    switch (actionType?.toLowerCase()) {
      case "created":
      case "submitted":
        return {
          label: "Submitted",
          className:
            "bg-slate-600 text-white rounded-full px-3 py-1 text-xs font-medium",
        };
      case "updated":
        return {
          label: "Updated",
          className:
            "bg-blue-600 text-white rounded-full px-3 py-1 text-xs font-medium",
        };
      case "approved":
        return {
          label: "Approved",
          className:
            "bg-green-600 text-white rounded-full px-3 py-1 text-xs font-medium",
        };
      case "reviewed":
        return {
          label: "Reviewed",
          className:
            "bg-blue-600 text-white rounded-full px-3 py-1 text-xs font-medium",
        };
      case "rejected":
        return {
          label: "Rejected",
          className:
            "bg-red-600 text-white rounded-full px-3 py-1 text-xs font-medium",
        };
      default:
        return {
          label:
            actionType?.charAt(0).toUpperCase() + actionType?.slice(1) ||
            "Updated",
          className:
            "bg-gray-600 text-white rounded-full px-3 py-1 text-xs font-medium",
        };
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return {
        date: format(date, "MMM d, yyyy"),
        time: format(date, "h:mm a"),
      };
    } catch (e) {
      return { date: "Invalid date", time: "" };
    }
  };

  // Get comment or description about action
// In expense-history.tsx, modify the getActionDescription function

const getActionDescription = (item: ExpenseHistoryItem) => {
  try {
    console.log("Getting description for item:", JSON.stringify(item));
    
    // For submitted/created entries - ALWAYS show amount
    if (item.action_type?.toLowerCase() === 'submitted' || item.action_type?.toLowerCase() === 'created') {
      if (item.expenseAmount) {
        // Format the amount with the Indian currency format
        const formattedAmount = new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 2
        }).format(item.expenseAmount);
        
        return `Expense created with amount ${formattedAmount}`;
      }
      
      // Check if the new_value has an amount
      if (item.new_value && !isNaN(Number(item.new_value))) {
        const formattedAmount = new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 2
        }).format(Number(item.new_value));
        
        return `Expense created with amount ${formattedAmount}`;
      }
      
      return `Expense created`;
    }
    
    // For updated entries - ALWAYS show what changed when we have the data
    if (item.action_type?.toLowerCase() === 'updated') {
      if (item.changed_field === 'amount' && item.old_value && item.new_value) {
        const oldAmount = new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 2
        }).format(Number(item.old_value));
        
        const newAmount = new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 2
        }).format(Number(item.new_value));
        
        return `Amount changed from ${oldAmount} to ${newAmount}`;
      }
      
      // For other field updates
      if (item.changed_field && item.old_value && item.new_value) {
        const fieldName = item.changed_field.charAt(0).toUpperCase() + item.changed_field.slice(1);
        return `${fieldName} changed from ${item.old_value} to ${item.new_value}`;
      }
      
      // If we have metadata with field changes, show the first important one
      if (item.metadata && Array.isArray(item.metadata) && item.metadata.length > 0) {
        for (const meta of item.metadata) {
          if (meta.field && meta.previous_value !== undefined && meta.current_state !== undefined) {
            const fieldName = meta.field.charAt(0).toUpperCase() + meta.field.slice(1);
            return `${fieldName} changed from ${meta.previous_value} to ${meta.current_state}`;
          }
        }
      }
      
      // Fallback if no specific change details available
      return `Expense updated`;
    }
    
    // For approved entries
    if (item.action_type?.toLowerCase() === 'approved') {
      // If we have an amount in the new_value, show it
      if (item.new_value && !isNaN(Number(item.new_value))) {
        const amount = new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 2
        }).format(Number(item.new_value));
        
        return `Expense approved with amount ${amount}`;
      }
      
      // Check metadata for approved amount
      if (item.metadata && Array.isArray(item.metadata)) {
        const amountMeta = item.metadata.find(m => 
          m.field === 'approved_amount' || m.field === 'amount');
        if (amountMeta && amountMeta.current_state) {
          const amount = new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2
          }).format(Number(amountMeta.current_state));
          
          return `Expense approved with amount ${amount}`;
        }
      }
      
      // Use the expense amount as fallback
      if (item.expenseAmount) {
        const amount = new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: 'INR',
          maximumFractionDigits: 2
        }).format(item.expenseAmount);
        
        return `Expense approved with amount ${amount}`;
      }
      
      return `Expense approved`;
    }
    
    // For rejected entries
    if (item.action_type?.toLowerCase() === 'rejected') {
      if (item.changed_field === 'status') {
        // For rejection, check if there's a rejection reason in metadata
        if (item.metadata && Array.isArray(item.metadata)) {
          const rejectionItem = item.metadata.find(m => m.field === 'rejection_reason');
          if (rejectionItem && rejectionItem.current_state) {
            return `Rejected: ${rejectionItem.current_state}`;
          }
        }
        
        // If we have old and new values, show status change
        if (item.old_value && item.new_value) {
          return `Status changed from ${item.old_value} to rejected`;
        }
      }
      
      return `Expense rejected`;
    }
    
    // For status changes (not captured by above cases)
    if (item.changed_field === 'status' && item.old_value && item.new_value) {
      return `Status changed from ${item.old_value} to ${item.new_value}`;
    }
    
    // Generic handling for other field changes
    if (item.changed_field && item.old_value && item.new_value) {
      const fieldName = item.changed_field.charAt(0).toUpperCase() + item.changed_field.slice(1);
      return `${fieldName} changed from ${item.old_value} to ${item.new_value}`;
    }
    
    // Default messages based on action type if no specific details available
    switch (item.action_type?.toLowerCase()) {
      case 'created':
        if (item.expenseAmount) {
          const amount = new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2
          }).format(item.expenseAmount);
          return `Expense created with amount ${amount}`;
        }
        return 'Expense created';
      case 'updated':
        return 'Expense updated';
      case 'approved':
        if (item.expenseAmount) {
          const amount = new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 2
          }).format(item.expenseAmount);
          return `Expense approved with amount ${amount}`;
        }
        return 'Expense approved';
      case 'rejected':
        return 'Expense rejected';
      default:
        return 'Action performed';
    }
  } catch (error) {
    console.error('Error in getActionDescription:', error);
    return 'Action performed';
  }
};
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="mr-2 h-5 w-5" />
            Activity History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-4">
            <Spinner size="md" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="mr-2 h-5 w-5" />
            Activity History
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-red-500 p-4">Error: {error}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Clock className="mr-2 h-5 w-5" />
          Activity History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <div className="text-center text-muted-foreground p-4">
            No history available
          </div>
        ) : (
          <div className="space-y-8 relative">
            {/* Vertical line */}
            <div className="absolute top-0 bottom-0 left-4 w-0.5 bg-gray-200"></div>

            {history.map((item) => {
              const status = getStatusBadge(item.action_type);
              const dateTime = formatDate(item.created_at);
              const description = getActionDescription(item);

              // Debug log to check each item's user_name
              console.log(
                `Rendering history item ${item.id} with user_name:`,
                item.user_name
              );

              return (
                <div key={item.id} className="relative pl-12">
                  {/* Time circle */}
                  <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-blue-500" />
                  </div>

                  <div className="flex flex-col">
                    <div className="flex items-center gap-3">
                      <span className={status.className}>{status.label}</span>
                      <span className="font-medium">
                        {item.user_name || "System"}
                      </span>
                    </div>

                    <div className="text-sm text-gray-500 mt-1">
                      {dateTime.date}, {dateTime.time}
                    </div>

                    {description && (
                      <div className="mt-2 text-sm">{description}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
