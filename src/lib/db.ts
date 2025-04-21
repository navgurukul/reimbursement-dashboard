import supabase from "./supabase";

// Types
export interface Organization {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface OrganizationUser {
  id: string;
  org_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  created_at: string;
}

export interface MembershipWithOrg {
  org_id: string;
  role: "owner" | "admin" | "member";
  organizations: {
    id: string;
    name: string;
    slug: string;
    created_at: string;
  };
}

export interface OrganizationMembership {
  org_id: string;
  role: string;
  organizations: {
    id: string;
    name: string;
    slug: string;
    created_at: string;
  };
}

export interface OrganizationMember {
  id: string;
  role: string;
  user_id: string;
  org_id: string;
}

export interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

// Auth functions
export const auth = {
  signIn: async (email: string, password: string) => {
    return await supabase.auth.signInWithPassword({ email, password });
  },

  signUp: async (email: string, password: string) => {
    return await supabase.auth.signUp({ email, password });
  },

  signOut: async () => {
    return await supabase.auth.signOut();
  },

  getUser: async () => {
    return await supabase.auth.getUser();
  },

  getSession: async () => {
    return await supabase.auth.getSession();
  },

  onAuthStateChange: (callback: (event: string, session: any) => void) => {
    return supabase.auth.onAuthStateChange(callback);
  },
};

// Organization functions
export const organizations = {
  getBySlug: async (slug: string) => {
    return await supabase
      .from("organizations")
      .select("*")
      .eq("slug", slug)
      .single();
  },

  create: async (name: string, slug: string) => {
    return await supabase
      .from("organizations")
      .insert([{ name, slug }])
      .select()
      .single();
  },

  getUserOrganizations: async (userId: string) => {
    return await supabase
      .from("organization_users")
      .select(
        `
        org_id,
        role,
        organizations (*)
      `
      )
      .eq("user_id", userId)
      .maybeSingle()
      .returns<OrganizationMembership>();
  },

  addUser: async (orgId: string, userId: string, role: string) => {
    return await supabase
      .from("organization_users")
      .insert([{ org_id: orgId, user_id: userId, role }]);
  },

  getUserRole: async (orgId: string, userId: string) => {
    return await supabase
      .from("organization_users")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .single();
  },

  checkMembership: async (userId: string) => {
    return await supabase
      .from("organization_users")
      .select("org_id")
      .eq("user_id", userId)
      .maybeSingle();
  },

  getOrganizationMembers: async (orgId: string) => {
    return await supabase
      .from("organization_users")
      .select(
        `
        id,
        role,
        user_id,
        org_id
      `
      )
      .eq("org_id", orgId)
      .returns<OrganizationMember[]>();
  },
};

// Profile functions
export const profiles = {
  getByUserId: async (userId: string) => {
    return await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single()
      .returns<Profile>();
  },

  getByIds: async (userIds: string[]) => {
    return await supabase
      .from("profiles")
      .select("*")
      .in("user_id", userIds)
      .returns<Profile[]>();
  },

  create: async (
    profile: Omit<Profile, "id" | "created_at" | "updated_at">
  ) => {
    return await supabase
      .from("profiles")
      .insert([profile])
      .select()
      .single()
      .returns<Profile>();
  },

  update: async (userId: string, updates: Partial<Profile>) => {
    return await supabase
      .from("profiles")
      .update(updates)
      .eq("user_id", userId)
      .select()
      .single()
      .returns<Profile>();
  },
};
