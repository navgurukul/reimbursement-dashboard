import { create } from "zustand";

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
  selectedOrgId: string | null;

  setOrganization: (org: Organization | null) => void;
  setUserRole: (role: Role | null) => void;
  setSelectedOrgId: (orgId: string | null) => void;
  resetOrg: () => void;
}

export const useOrgStore = create<OrgState>((set) => ({
  id: null,
  org: null,
  organization: null,
  userRole: null,
  selectedOrgId: null,

  setOrganization: (org) => set({ organization: org }),
  setUserRole: (role) => set({ userRole: role }),
  setSelectedOrgId: (orgId) => set({ selectedOrgId: orgId }),
  resetOrg: () => set({ 
    id: null, 
    org: null, 
    organization: null, 
    userRole: null,
    selectedOrgId: null 
  }),
}));
