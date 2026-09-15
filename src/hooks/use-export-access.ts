import { useState, useEffect } from "react";
import { useOrgStore } from "@/store/useOrgStore";
import { useAuthStore } from "@/store/useAuthStore";
import { accessPermissions } from "@/lib/db";
import { isExportEnabled } from "@/lib/features";

/**
 * Hook to determine if the current user has access to the export feature.
 * It checks the `access_permissions` table in the database for the current organization.
 * It also falls back to the NEXT_PUBLIC_ENABLE_EXPORT env variable if no DB access is granted.
 */
export function useExportAccess() {
  const { organization, userRole } = useOrgStore();
  const { profile, user } = useAuthStore();
  
  // Fallback to the environment variable based global enable if needed
  const [hasAccess, setHasAccess] = useState<boolean>(() => isExportEnabled);

  useEffect(() => {
    const checkAccess = async () => {
      if (!organization?.id) return;

      const userEmail = profile?.email || user?.email || user?.user_metadata?.email;
      if (!userEmail) return;

      try {
        const { hasAccess: dbAccess } = await accessPermissions.checkAccess(
          organization.id,
          userEmail,
          "export"
        );
        
        if (dbAccess) {
          setHasAccess(true);
        }
      } catch (err) {
        console.error("Failed to check export access:", err);
      }
    };

    checkAccess();
  }, [organization?.id, profile, user, userRole]);

  return hasAccess;
}
