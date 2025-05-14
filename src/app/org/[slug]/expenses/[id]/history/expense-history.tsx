"use client";

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { Clock } from 'lucide-react';
import supabase from '@/lib/supabase';

interface ExpenseHistoryItem {
  id: string;
  expense_id: string;
  user_id: string;
  action_type: string;
  changed_field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  user_name?: string;
}

interface ExpenseHistoryProps {
  expenseId: string;
}

export default function ExpenseHistory({ expenseId }: ExpenseHistoryProps) {
  const [history, setHistory] = useState<ExpenseHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchHistory() {
      try {
        setLoading(true);
        
        const { data, error } = await supabase
          .rpc('get_expense_history', { expense_id_param: expenseId });
        
        if (error) {
          console.error('Error fetching expense history:', error);
          setError(error.message);
          return;
        }
        
        setHistory(data || []);
      } catch (err) {
        console.error('Failed to load history:', err);
        setError('Failed to load history');
      } finally {
        setLoading(false);
      }
    }

    if (expenseId) {
      fetchHistory();
    }
  }, [expenseId]);

  // Helper function to get status badge style
  const getStatusBadge = (actionType: string) => {
    switch (actionType) {
      case 'created':
      case 'submitted':
        return { 
          label: 'Submitted', 
          className: 'bg-slate-600 text-white rounded-full px-3 py-1 text-xs font-medium' 
        };
      case 'updated':
        return { 
          label: 'Updated', 
          className: 'bg-blue-600 text-white rounded-full px-3 py-1 text-xs font-medium' 
        };
      case 'approved':
        return { 
          label: 'Approved', 
          className: 'bg-green-600 text-white rounded-full px-3 py-1 text-xs font-medium' 
        };
      case 'reviewed':
        return { 
          label: 'Reviewed', 
          className: 'bg-blue-600 text-white rounded-full px-3 py-1 text-xs font-medium' 
        };
      case 'rejected':
        return { 
          label: 'Rejected', 
          className: 'bg-red-600 text-white rounded-full px-3 py-1 text-xs font-medium' 
        };
      default:
        return { 
          label: actionType.charAt(0).toUpperCase() + actionType.slice(1), 
          className: 'bg-gray-600 text-white rounded-full px-3 py-1 text-xs font-medium' 
        };
    }
  };

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return {
        date: format(date, 'MMM d, yyyy'),
        time: format(date, 'h:mm a')
      };
    } catch (e) {
      return { date: 'Invalid date', time: '' };
    }
  };

  // Get comment or description about action
  const getActionDescription = (item: ExpenseHistoryItem) => {
    if (item.action_type === 'rejected' && item.changed_field === 'status') {
      return 'Amount exceeds policy limit for meals';
    }
    
    if (item.action_type === 'updated' && item.changed_field === 'amount') {
      return `Amount changed from ${item.old_value} to ${item.new_value}`;
    }
    
    if (item.action_type === 'created' && item.changed_field === 'record') {
      return item.new_value;
    }
    
    return null;
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
          <div className="text-center text-muted-foreground p-4">No history available</div>
        ) : (
          <div className="space-y-8 relative">
            {/* Vertical line */}
            <div className="absolute top-0 bottom-0 left-4 w-0.5 bg-gray-200"></div>
            
            {history.map((item) => {
              const status = getStatusBadge(item.action_type);
              const dateTime = formatDate(item.created_at);
              const description = getActionDescription(item);

              return (
                <div key={item.id} className="relative pl-12">
                  {/* Time circle */}
                  <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center">
                    <Clock className="h-4 w-4 text-blue-500" />
                  </div>
                  
                  <div className="flex flex-col">
                    <div className="flex items-center gap-3">
                      <span className={status.className}>
                        {status.label}
                      </span>
                      <span className="font-medium">
                        {item.user_name || 'System'}
                      </span>
                    </div>
                    
                    <div className="text-sm text-gray-500 mt-1">
                      {dateTime.date}, {dateTime.time}
                    </div>
                    
                    {description && (
                      <div className="mt-2 text-sm">
                        {description}
                      </div>
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

