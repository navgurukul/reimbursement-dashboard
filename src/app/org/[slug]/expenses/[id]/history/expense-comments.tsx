
import { useState, useEffect } from "react";
import { expenseComments } from "@/lib/db";
import { ExpenseCommentWithUser } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";

interface CommentProps {
  expenseId: string;
}

export function ExpenseComments({ expenseId }: CommentProps) {
  const [comments, setComments] = useState<ExpenseCommentWithUser[]>([]);
  const [newComment, setNewComment] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Get current user from localStorage
  const getUserFromLocalStorage = () => {
    try {
      const authString = localStorage.getItem('auth-storage');
      if (!authString) return null;
      
      const authData = JSON.parse(authString);
      
      // Extract all user info including profile details
      return {
        id: authData.state?.user?.id,
        profile: authData.state?.profile || {},
        full_name: authData.state?.profile?.full_name || 'User'
      };
    } catch (error) {
      console.error("Error parsing user from localStorage:", error);
      return null;
    }
  };

  const currentUser = getUserFromLocalStorage();

  useEffect(() => {
    loadComments();
  }, [expenseId]);

  const loadComments = async () => {
    if (!expenseId) return;
    
    const { data, error } = await expenseComments.getByExpenseId(expenseId);
    if (error) {
      console.error("Error loading comments:", error);
      return;
    }
    
    if (data) {
      setComments(data);
    }
  };

  const handleAddComment = async () => {
    if (!currentUser || !newComment.trim()) return;
    
    setIsLoading(true);
    try {
      const { data, error } = await expenseComments.add({
        expense_id: expenseId,
        user_id: currentUser.id,
        content: newComment.trim()
      });
      
      if (error) {
        console.error("Error adding comment:", error);
        return;
      }
      
      if (data) {
        setComments([...comments, data]);
        setNewComment("");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Improved initials generation function
  const getInitials = (name: string) => {
    if (!name) return "U";
    
    const nameParts = name.split(" ");
    if (nameParts.length === 1) {
      return nameParts[0].charAt(0).toUpperCase();
    }
    
    // Get first letter of first name and first letter of last name
    return (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase();
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMM d, yyyy 'at' h:mm a");
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div>
      <div className="flex items-center mb-4">
        <svg 
          xmlns="http://www.w3.org/2000/svg" 
          width="20" 
          height="20" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2" 
          strokeLinecap="round" 
          strokeLinejoin="round"
          className="mr-2 text-gray-500"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <h2 className="text-lg font-medium text-gray-900">Comments</h2>
      </div>

      <div className="space-y-4 border-b border-gray-200 pb-5">
        {comments.length === 0 ? (
          <p className="text-gray-500 text-sm">No comments yet</p>
        ) : (
          comments.map(comment => (
            <div key={comment.id} className="flex gap-3 pb-4">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-200 text-gray-600 text-sm font-medium">
                  {getInitials(comment.user?.full_name || '')}
                </div>
              </div>
              <div className="flex-grow">
                <div className="flex flex-col">
                  <div className="flex flex-col md:flex-row md:items-center">
                      <p className="font-medium text-gray-900">
                        {comment.user?.full_name || 'Unknown User'}
                      </p>
                      <span className="mt-1 text-xs text-gray-500 md:mt-0 md:ml-2">
                        {formatDate(comment.created_at)}
                      </span>
                    </div>
                  <p className="text-gray-700 mt-1">{comment.content}</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="pt-4 mt-2">
        <div className="flex gap-3">
          <div className="flex-shrink-0">
            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-200 text-gray-600 text-sm font-medium">
              {getInitials(currentUser?.full_name || '')}
            </div>
          </div>
          <div className="flex-grow">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              className="w-full min-h-[80px] resize-none border rounded-md p-2 text-sm"
            />
            <div className="mt-2 flex justify-end">
              <Button 
                onClick={handleAddComment}
                disabled={!newComment.trim() || isLoading}
                className="flex items-center gap-1.5 bg-black hover:bg-gray-800 text-white px-4 py-2 rounded-md"
              >
                {isLoading ? (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    width="16" 
                    height="16" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                  >
                    <path d="M22 2l-7 20-4-9-9-4 20-7z"></path>
                  </svg>
                )}
                Add Comment
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}