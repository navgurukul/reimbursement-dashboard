import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Role = "owner" | "admin" | "member";

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface CachedRoleData {
  role: Role;
  orgId: string;
  userId: string;
  timestamp: number;
}

interface CachedOrgData {
  organization: Organization;
  timestamp: number;
}

interface OrgState {
  id: any;
  org: any;
  organization: Organization | null;
  userRole: Role | null;
  selectedOrgId: string | null;
  cachedRoleData: CachedRoleData | null;
  cachedOrgData: CachedOrgData | null;

  setOrganization: (org: Organization | null) => void;
  setUserRole: (role: Role | null) => void;
  setSelectedOrgId: (orgId: string | null) => void;
  setCachedRoleData: (roleData: CachedRoleData | null) => void;
  setCachedOrgData: (orgData: CachedOrgData | null) => void;
  resetOrg: () => void;
}

export const useOrgStore = create<OrgState>((set) => ({
  id: null,
  org: null,
  organization: null,
  userRole: null,
  selectedOrgId: null,
  cachedRoleData: null,
  cachedOrgData: null,

  setOrganization: (org) => {
    set({ organization: org });
    // Cache organization data when setting
    if (org) {
      const cacheData = {
        organization: org,
        timestamp: Date.now(),
      };
      set({ cachedOrgData: cacheData });
      // Also save to localStorage
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("org-cache", JSON.stringify(cacheData));
        } catch {
          // Ignore localStorage errors
        }
      }
    } else {
      set({ cachedOrgData: null });
      // Clear localStorage
      if (typeof window !== "undefined") {
        try {
          localStorage.removeItem("org-cache");
        } catch {
          // Ignore localStorage errors
        }
      }
    }
  },
  setUserRole: (role) => set({ userRole: role }),
  setSelectedOrgId: (orgId) => set({ selectedOrgId: orgId }),
  setCachedRoleData: (roleData) => set({ cachedRoleData: roleData }),
  setCachedOrgData: (orgData) => set({ cachedOrgData: orgData }),
  resetOrg: () => {
    set({ 
      id: null, 
      org: null, 
      organization: null, 
      userRole: null,
      selectedOrgId: null,
      cachedRoleData: null,
      cachedOrgData: null
    });
    // Clear localStorage
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("org-cache");
      } catch {
        // Ignore localStorage errors
      }
    }
  },
}));
