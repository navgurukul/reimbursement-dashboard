import { ReactNode } from "react";
import { useAuthorization, Role } from "@/hooks/useAuthorization";
import { useOrgStore } from "@/store/useOrgStore";
import { Spinner } from "@/components/ui/spinner";

interface SecureNavigationProps {
  children: ReactNode;
  requiredRole: Role;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
}

export const SecureNavigation = ({ 
  children, 
  requiredRole, 
  fallback = null,
  loadingFallback = <Spinner className="h-4 w-4" />
}: SecureNavigationProps) => {
  const { organization } = useOrgStore();
  const { userRole, isLoading, error, hasPermission } = useAuthorization(organization?.id);

  // Show loading state while fetching permissions
  if (isLoading) {
    return <>{loadingFallback}</>;
  }

  // Show error state if permission check failed
  if (error) {
    console.error("Authorization error:", error);
    return <>{fallback}</>;
  }

  // Check if user has the required permission
  if (!hasPermission(requiredRole)) {
    return <>{fallback}</>;
  }

  // User has permission, render the navigation item
  return <>{children}</>;
};

// Convenience components for common permission levels
export const AdminNavigation = ({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) => (
  <SecureNavigation requiredRole="admin" fallback={fallback}>
    {children}
  </SecureNavigation>
);

export const OwnerNavigation = ({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) => (
  <SecureNavigation requiredRole="owner" fallback={fallback}>
    {children}
  </SecureNavigation>
);

export const MemberNavigation = ({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) => (
  <SecureNavigation requiredRole="member" fallback={fallback}>
    {children}
  </SecureNavigation>
);
