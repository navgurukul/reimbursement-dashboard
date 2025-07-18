import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Role = "owner" | "admin" | "member";

interface Organization {
  id: string;
  name: string;
  slug: string;
}

interface OrgState {
  id: any;
  org: any;
  organization: Organization | null;
  userRole: Role | null;

  setOrganization: (org: Organization | null) => void;
  setUserRole: (role: Role | null) => void;
  resetOrg: () => void;
}

export const useOrgStore = create(
  persist<OrgState>(
    (set) => ({
      organization: null,
      userRole: null,

      setOrganization: (org) => set({ organization: org }),
      setUserRole: (role) => set({ userRole: role }),
      resetOrg: () => set({ organization: null, userRole: null }),
    }),
    {
      name: "org-storage",
    }
  )
);
