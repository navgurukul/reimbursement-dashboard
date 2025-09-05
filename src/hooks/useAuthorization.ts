import { useAuthStore } from "@/store/useAuthStore";
import { useOrgStore } from "@/store/useOrgStore";
import { organizations } from "@/lib/db";
import { useEffect, useState } from "react";

export type Role = "owner" | "admin" | "member";

interface AuthorizationState {
  userRole: Role | null;
  isLoading: boolean;
  error: string | null;
  hasPermission: (requiredRole: Role) => boolean;
  refreshPermissions: () => Promise<void>;
}

export const useAuthorization = (orgId?: string): AuthorizationState => {
  const { user } = useAuthStore();
  const { userRole, setUserRole } = useOrgStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user has permission for a specific role
  const hasPermission = (requiredRole: Role): boolean => {
    if (!userRole || !orgId) return false;
    
    const roleHierarchy: Record<Role, number> = {
      member: 1,
      admin: 2,
      owner: 3,
    };
    
    return roleHierarchy[userRole] >= roleHierarchy[requiredRole];
  };

  // Refresh user permissions from server
  const refreshPermissions = async () => {
    if (!user?.id || !orgId) {
      setUserRole(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: roleError } = await organizations.getUserRole(orgId, user.id);
      
      if (roleError) {
        console.error("Error fetching user role:", roleError);
        setError("Failed to fetch user permissions");
        setUserRole(null);
      } else if (data) {
        setUserRole(data.role as Role);
      } else {
        setUserRole(null);
      }
    } catch (err) {
      console.error("Error refreshing permissions:", err);
      setError("Failed to refresh permissions");
      setUserRole(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-refresh permissions when user or org changes
  useEffect(() => {
    if (user?.id && orgId) {
      refreshPermissions();
    } else {
      setUserRole(null);
    }
  }, [user?.id, orgId]);

  return {
    userRole,
    isLoading,
    error,
    hasPermission,
    refreshPermissions,
  };
};
