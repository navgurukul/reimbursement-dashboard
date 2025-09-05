import { ReactNode } from "react";
import { useAuthorization, Role } from "@/hooks/useAuthorization";
import { useOrgStore } from "@/store/useOrgStore";
import { Spinner } from "@/components/ui/spinner";

interface SecureRouteProps {
  children: ReactNode;
  requiredRole: Role;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
}

export const SecureRoute = ({ 
  children, 
  requiredRole, 
  fallback = <div>Access denied. You don't have permission to view this content.</div>,
  loadingFallback = <div className="flex items-center justify-center p-8"><Spinner /></div>
}: SecureRouteProps) => {
  const { organization } = useOrgStore();
  const { userRole, isLoading, error, hasPermission } = useAuthorization(organization?.id);

  // Show loading state while fetching permissions
  if (isLoading) {
    return <>{loadingFallback}</>;
  }

  // Show error state if permission check failed
  if (error) {
    return <div className="text-red-600 p-4">Error: {error}</div>;
  }

  // Check if user has the required permission
  if (!hasPermission(requiredRole)) {
    return <>{fallback}</>;
  }

  // User has permission, render the protected content
  return <>{children}</>;
};

// Convenience components for common permission levels
export const AdminOnly = ({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) => (
  <SecureRoute requiredRole="admin" fallback={fallback}>
    {children}
  </SecureRoute>
);

export const OwnerOnly = ({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) => (
  <SecureRoute requiredRole="owner" fallback={fallback}>
    {children}
  </SecureRoute>
);

export const MemberOrHigher = ({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) => (
  <SecureRoute requiredRole="member" fallback={fallback}>
    {children}
  </SecureRoute>
);
