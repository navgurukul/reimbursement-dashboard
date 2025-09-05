import { useEffect } from "react";
import { useOrgStore } from "@/store/useOrgStore";
import { useAuthStore } from "@/store/useAuthStore";
import { organizations } from "@/lib/db";

// Cache expiration time (5 minutes)
const CACHE_EXPIRY_MS = 5 * 60 * 1000;

// Manual localStorage helpers
const ORG_CACHE_KEY = "org-cache";

const getCachedOrgData = () => {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem(ORG_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
};

const setCachedOrgData = (data: any) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ORG_CACHE_KEY, JSON.stringify(data));
  } catch {
    // Ignore localStorage errors
  }
};

const clearCachedOrgData = () => {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(ORG_CACHE_KEY);
  } catch {
    // Ignore localStorage errors
  }
};

export const useOrgInitialization = () => {
  const { 
    organization,
    userRole,
    setOrganization, 
    setUserRole, 
    setCachedOrgData, 
    setCachedRoleData 
  } = useOrgStore();
  const { user } = useAuthStore();

  useEffect(() => {
    const initializeOrg = async () => {
      if (!user?.id) {
        return;
      }

      // If organization is already loaded, we're good
      if (organization) {
        return;
      }

      // Try to load from localStorage cache first
      const cachedData = getCachedOrgData();
      
      if (cachedData) {
        const now = Date.now();
        const isExpired = now - cachedData.timestamp > CACHE_EXPIRY_MS;
        
        if (!isExpired && cachedData.userId === user.id) {
          // Use cached data immediately
          setOrganization(cachedData.organization);
          setUserRole(cachedData.role);
          
          // Validate in background
          try {
            const { data: freshOrgData, error } = await organizations.getById(cachedData.organization.id);
            if (!error && freshOrgData) {
              // Update with fresh data if different
              if (JSON.stringify(freshOrgData) !== JSON.stringify(cachedData.organization)) {
                setOrganization(freshOrgData);
                const updatedCacheData = {
                  organization: freshOrgData,
                  role: cachedData.role,
                  userId: user.id,
                  timestamp: Date.now(),
                };
                setCachedOrgData(updatedCacheData);
              }
            }
          } catch (err) {
            console.error("Error validating organization data:", err);
          }
          return;
        } else {
          // Cache expired or wrong user, clear it
          clearCachedOrgData();
        }
      }

      // No valid cache, fetch from server
      try {
        const { data: membership, error } = await organizations.getUserOrganizations(user.id);
        
        if (!error && membership && membership.organizations) {
          setOrganization(membership.organizations);
          setUserRole(membership.role as "owner" | "admin" | "member");
          
          // Cache the data
          const cacheData = {
            organization: membership.organizations,
            role: membership.role,
            userId: user.id,
            timestamp: Date.now(),
          };
          setCachedOrgData(cacheData);
        }
      } catch (err) {
        console.error("Error fetching user organization:", err);
      }
    };

    initializeOrg();
  }, [user?.id, organization, setOrganization, setUserRole, setCachedOrgData, setCachedRoleData]);
};
