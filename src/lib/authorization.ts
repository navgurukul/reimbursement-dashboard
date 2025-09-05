import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { organizations } from "./db";

export type Role = "owner" | "admin" | "member";

// Server-side function to get current user
export async function getCurrentUser() {
  const cookieStore = await cookies();
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // Server-side cookies are handled differently
        },
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error || !user) {
    return { user: null, error };
  }

  return { user, error: null };
}

// Server-side function to check user role in organization
export async function getUserRole(orgId: string, userId: string): Promise<{ role: Role | null; error: any }> {
  try {
    const { data, error } = await organizations.getUserRole(orgId, userId);
    
    if (error) {
      return { role: null, error };
    }
    
    return { role: data?.role as Role || null, error: null };
  } catch (err) {
    return { role: null, error: err };
  }
}

// Server-side function to check if user has permission
export async function hasPermission(
  orgId: string, 
  userId: string, 
  requiredRole: Role
): Promise<{ hasPermission: boolean; error: any }> {
  try {
    const { role, error } = await getUserRole(orgId, userId);
    
    if (error) {
      return { hasPermission: false, error };
    }
    
    if (!role) {
      return { hasPermission: false, error: null };
    }
    
    const roleHierarchy: Record<Role, number> = {
      member: 1,
      admin: 2,
      owner: 3,
    };
    
    const hasPermission = roleHierarchy[role] >= roleHierarchy[requiredRole];
    
    return { hasPermission, error: null };
  } catch (err) {
    return { hasPermission: false, error: err };
  }
}

// Server-side function to validate organization access
export async function validateOrgAccess(orgId: string, userId: string): Promise<{ 
  hasAccess: boolean; 
  role: Role | null; 
  error: any 
}> {
  try {
    const { role, error } = await getUserRole(orgId, userId);
    
    if (error) {
      return { hasAccess: false, role: null, error };
    }
    
    return { hasAccess: !!role, role, error: null };
  } catch (err) {
    return { hasAccess: false, role: null, error: err };
  }
}
