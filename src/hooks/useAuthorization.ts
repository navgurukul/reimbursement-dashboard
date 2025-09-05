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

// Cache expiration time (5 minutes)
const CACHE_EXPIRY_MS = 5 * 60 * 1000;

export const useAuthorization = (orgId?: string): AuthorizationState => {
  const { user } = useAuthStore();
  const { userRole, setUserRole, cachedRoleData, setCachedRoleData } = useOrgStore();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if cached data is valid
  const isCachedDataValid = (cachedData: any, currentUserId: string, currentOrgId: string): boolean => {
    if (!cachedData) return false;
    
    const now = Date.now();
    const isExpired = now - cachedData.timestamp > CACHE_EXPIRY_MS;
    const isForCurrentUser = cachedData.userId === currentUserId;
    const isForCurrentOrg = cachedData.orgId === currentOrgId;
    
    return !isExpired && isForCurrentUser && isForCurrentOrg;
  };

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
  const refreshPermissions = async (useCache: boolean = true) => {
    if (!user?.id || !orgId) {
      setUserRole(null);
      setCachedRoleData(null);
      return;
    }

    // Check if we can use cached data
    if (useCache && isCachedDataValid(cachedRoleData, user.id, orgId)) {
      setUserRole(cachedRoleData.role);
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
        setCachedRoleData(null);
      } else if (data) {
        const role = data.role as Role;
        setUserRole(role);
        
        // Cache the role data with timestamp
        setCachedRoleData({
          role,
          orgId,
          userId: user.id,
          timestamp: Date.now(),
        });
      } else {
        setUserRole(null);
        setCachedRoleData(null);
      }
    } catch (err) {
      console.error("Error refreshing permissions:", err);
      setError("Failed to refresh permissions");
      setUserRole(null);
      setCachedRoleData(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-refresh permissions when user or org changes
  useEffect(() => {
    if (user?.id && orgId) {
      // First try to use cached data for immediate UI response
      if (isCachedDataValid(cachedRoleData, user.id, orgId)) {
        setUserRole(cachedRoleData.role);
        // Still refresh in background to ensure data is current
        refreshPermissions(false);
      } else {
        // No valid cache, fetch from server
        refreshPermissions(false);
      }
    } else {
      setUserRole(null);
      setCachedRoleData(null);
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
