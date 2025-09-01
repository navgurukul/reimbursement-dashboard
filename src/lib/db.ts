import supabase from "./supabase";
import { createClient } from "@supabase/supabase-js";
import { StorageError } from "@supabase/storage-js";
import { StorageApiError } from "@supabase/storage-js";
import { getProfileSignatureUrl } from "./utils";
import { log } from "node:console";
// Types

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);


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
  full_name: string;
}

export interface Profile {
  id: string;
  user_id: string;
  email: string;
  full_name?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  signature_url?: string;
}

export interface InviteRow {
  id: string;
  email: string;
  org_id: string;
  role: "member" | "admin" | "owner";
  used: boolean;
  created_at: string;
}

export interface Policy {
  id: string;
  org_id: string;
  expense_type: string;
  per_unit_cost: string | null;
  upper_limit: number | null;
  eligibility: string | null;
  conditions: string | null;
  created_at: string;
  updated_at: string;
  policy_url?: string | null;
}

export type ColumnType =
  | "text"
  | "number"
  | "date"
  | "dropdown"
  | "radio"
  | "checkbox"
  | "textarea"
  | "file";

export interface ColumnConfig {
  key: string;
  label: string;
  type: ColumnType;
  visible: boolean;
  options?: string[] | { value: string; label: string }[];
  required?: boolean;
}

export interface BrandingConfig {
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
}

export interface DatabaseError {
  message: string;
  details: string;
  hint: string;
  code: string;
}

export interface OrganizationSettings {
  id: string;
  org_id: string;
  expense_columns: ColumnConfig[];
  branding: BrandingConfig;
  created_at: string;
  updated_at: string;
}

export type ExpenseStatus =
  | "submitted"
  | "approved"
  | "approved_as_per_policy"
  | "rejected"
  // | "finance_approved";
  | "ready_for_payment";

export type ValidationStatus = "valid" | "warning" | "violation";

export interface ReceiptInfo {
  filename: string;
  path: string;
  size: number;
  mime_type: string;
}

export interface PolicyValidation {
  policy_type: string;
  status: ValidationStatus;
  message: string | null;
}

export interface ExpenseEvent {
  id: string;
  org_id: string;
  user_id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  status: "draft" | "submitted" | "approved" | "rejected" | "reimbursed";
  total_amount: number;
  custom_fields: Record<string, any>;
  created_at: string;
  updated_at: string;
}

// Modify your Expense interface to include the event_id field
export interface Expense {
  id: string;
  org_id: string;
  user_id: string;
  expense_type: string;
  amount: number;
  date: string;
  status: ExpenseStatus;
  receipt: ReceiptInfo | null;
  custom_fields: Record<string, any> & {
    isVoucher?: boolean;
    yourName?: string;
    voucherDate?: string;
    voucherAmount?: number;
    purpose?: string;
    voucherCreditPerson?: string;
  };
  policy_validations: PolicyValidation[];
  approver_id?: string;
  event_id?: string; // Add this field
  created_at: string;
  signature_url?: string;
  updated_at: string;
  approved_amount?: number | null;
  approver_signature_url?: string | null; // Added approver signature URL
}

export interface Voucher {
  id: string;
  expense_id: string;
  your_name: string;
  created_at: string;
  amount: number;
  purpose: string;
  credit_person: string;
  created_by: string;
  signature_url?: string;
  manager_signature_url?: string;
  approver_id?: string; // Added approver_id field
  updated_at: string;
}

export interface ExpenseHistoryEntry {
  id: string;
  expense_id: string;
  user_id: string;
  user_name: string;
  created_at: string;
  action_type: "created" | "updated" | "approved" | "rejected";
  old_value: string | null;
  new_value: string;
}

export interface ExpenseComment {
  id: string;
  expense_id: string;
  user_id: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface ExpenseCommentWithUser extends ExpenseComment {
  user: {
    id: string;
    full_name: string;
    avatar_url?: string;
  };
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

  deleteUser: async (userId: string) => {
    // Delete the user from Supabase Auth
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      console.error("Error deleting user:", error);
      return { success: false, error };
    }
    return { success: true };
  }
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

  getById: async (id: string) => {
    return await supabase
      .from("organizations")
      .select("*")
      .eq("id", id)
      .single();
  },

  create: async (name: string, slug: string) => {
    console.log("Creating organization:", name, slug);

    try {
      const { data, error } = await supabase.rpc(
        "create_organization_properly",
        {
          org_name: name,
          org_slug: slug,
        }
      );

      if (error) {
        console.error("Error creating organization:", error);
      }

      return { data, error };
    } catch (err) {
      console.error("Exception creating organization:", err);
      return { data: null, error: err };
    }
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

  getMemberById: async (memberId: string) => {
    return supabase
      .from("organization_users")
      .select("user_id")
      .eq("id", memberId)
      .single();
  },

  deleteOrganizationMember: async (org_id: string, user_id: string) => {
    const { error } = await supabase
      .from("organization_users")
      .delete()
      .match({ id: user_id, org_id: org_id });

    return { error };
  },
};

// Add this entire object to your db.ts file with other database functions
export const expenseEvents = {
  // Create a new expense event
  async create(
    data: Omit<
      ExpenseEvent,
      "id" | "created_at" | "updated_at" | "total_amount"
    >
  ): Promise<{ data: ExpenseEvent | null; error: DatabaseError | null }> {
    try {
      const { data: eventData, error } = await supabase
        .from("expense_events")
        .insert(data)
        .select("*")
        .single();

      if (error) {
        return { data: null, error: error as DatabaseError };
      }

      return { data: eventData as ExpenseEvent, error: null };
    } catch (error: any) {
      console.error("Error creating expense event:", error);
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          details: "",
          hint: "Check your input and try again",
          code: "UNKNOWN_ERROR",
        },
      };
    }
  },
  // Add this function to the expenseEvents object in db.ts
  async getAvailableEvents(
    orgId: string,
    userId: string,
    userRole: string
  ): Promise<{ data: ExpenseEvent[] | null; error: DatabaseError | null }> {
    try {
      let query = supabase
        .from("expense_events")
        .select("*")
        .eq("org_id", orgId);

      // If user is admin or owner, show them all events
      if (userRole === "admin" || userRole === "owner") {
        // No additional filtering needed - admins/owners see all events
      } else {
        // For regular members, show:
        // 1. Events they created (with any status)
        // 2. Events created by others with "submitted" status
        query = query.or(`user_id.eq.${userId},status.eq.submitted`);
      }

      const { data, error } = await query.order("created_at", {
        ascending: false,
      });

      if (error) {
        return { data: null, error: error as DatabaseError };
      }

      return { data: data as ExpenseEvent[], error: null };
    } catch (error: any) {
      console.error("Error fetching available expense events:", error);
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          details: "",
          hint: "Check your input and try again",
          code: "UNKNOWN_ERROR",
        },
      };
    }
  },

  async getById(
    id: string
  ): Promise<{ data: ExpenseEvent | null; error: DatabaseError | null }> {
    try {
      const { data, error } = await supabase
        .from("expense_events")
        .select("*")
        .eq("id", id)
        .single();

      if (error) {
        return { data: null, error: error as DatabaseError };
      }

      return { data: data as ExpenseEvent, error: null };
    } catch (error: any) {
      console.error("Error fetching expense event:", error);
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          details: "",
          hint: "Check your input and try again",
          code: "UNKNOWN_ERROR",
        },
      };
    }
  },

  // Get expense events by organization and user
  async getByOrgAndUser(
    orgId: string,
    userId: string
  ): Promise<{ data: ExpenseEvent[] | null; error: DatabaseError | null }> {
    try {
      const { data, error } = await supabase
        .from("expense_events")
        .select("*")
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (error) {
        return { data: null, error: error as DatabaseError };
      }

      return { data: data as ExpenseEvent[], error: null };
    } catch (error: any) {
      console.error("Error fetching expense events:", error);
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          details: "",
          hint: "Check your input and try again",
          code: "UNKNOWN_ERROR",
        },
      };
    }
  },

  // Get expense events by organization
  async getByOrg(
    orgId: string
  ): Promise<{ data: ExpenseEvent[] | null; error: DatabaseError | null }> {
    try {
      const { data, error } = await supabase
        .from("expense_events")
        .select("*")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false });

      if (error) {
        return { data: null, error: error as DatabaseError };
      }

      return { data: data as ExpenseEvent[], error: null };
    } catch (error: any) {
      console.error("Error fetching expense events:", error);
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          details: "",
          hint: "Check your input and try again",
          code: "UNKNOWN_ERROR",
        },
      };
    }
  },

  // Update an expense event
  async update(
    id: string,
    updates: Partial<ExpenseEvent>
  ): Promise<{ error: DatabaseError | null }> {
    try {
      const { error } = await supabase
        .from("expense_events")
        .update(updates)
        .eq("id", id);

      if (error) {
        return { error: error as DatabaseError };
      }

      return { error: null };
    } catch (error: any) {
      console.error("Error updating expense event:", error);
      return {
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          details: "",
          hint: "Check your input and try again",
          code: "UNKNOWN_ERROR",
        },
      };
    }
  },

  // Delete an expense event
  async delete(id: string): Promise<{ error: DatabaseError | null }> {
    try {
      const { error } = await supabase
        .from("expense_events")
        .delete()
        .eq("id", id);

      if (error) {
        return { error: error as DatabaseError };
      }

      return { error: null };
    } catch (error: any) {
      console.error("Error deleting expense event:", error);
      return {
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          details: "",
          hint: "Check your input and try again",
          code: "UNKNOWN_ERROR",
        },
      };
    }
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
    console.log("getByIds called with:", userIds);

    if (userIds.length === 0) {
      return { data: [], error: null };
    }

    // Use the IN filter for optimal performance
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .in("user_id", userIds);

    console.log("Supabase returned profiles:", data?.length || 0);

    if (error) {
      console.error("Error fetching profiles:", error);
      return { data: null, error };
    }

    return { data, error: null };
  },

  async getById(userId: string) {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single(); // since user_id is unique

    return { data, error };
  },

  saveSignature: async (userId: string, signaturePath: string) => {
    return await supabase
      .from("profiles")
      .update({ signature_url: signaturePath })
      .eq("user_id", userId)
      .select()
      .single();
  },

  // Add these functions to the profiles object in db.ts
  getSignatureUrl: async (userId: string, orgId: string) => {
    try {
      // First get the signature path from the profile
      const { data, error } = await supabase
        .from("profiles")
        .select("signature_url")
        .eq("user_id", userId)
        .single();

      if (error || !data || !data.signature_url) {
        return { url: null, error: error || new Error("No signature found") };
      }

      // Then get the download URL
      const { data: urlData, error: urlError } = await supabase.storage
        .from("user-signatures")
        .createSignedUrl(data.signature_url, 3600); // URL valid for 1 hour

      if (urlError) {
        return { url: null, error: urlError };
      }

      return { url: urlData.signedUrl, error: null };
    } catch (error) {
      console.error("Error fetching signature URL:", error);
      return {
        url: null,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  },

  updateSignature: async (userId: string, signaturePath: string) => {
    return await supabase
      .from("profiles")
      .update({ signature_url: signaturePath })
      .eq("user_id", userId);
  },

  /**
   * Insert or update (upsert) a profile by user_id.
   * If a row exists, it will update the email/full_name fields.
   */
  upsert: async (
    profile: Omit<Profile, "id" | "created_at" | "updated_at">
  ) => {
    return await supabase
      .from("profiles")
      .upsert(profile, { onConflict: "user_id" })
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

  deleteByUserId: async (userId: string) => {
    return supabase.from("profiles").delete().eq("user_id", userId);
  },
};

// Removed users functions
export const RemovedUsers = {
  create: async (data: {
    user_id: string;
    email: string;
    full_name: string;
    created_at: string;
    removable_at: Date;
  }) => {
    const { data: result, error } = await supabase
      .from("removed_users")
      .insert([data])
      .select()
      .single();

    return { data: result, error };
  },
};

// Invites functions
export const invites = {
  create: async (
    org_id: string,
    email: string,
    role: "admin" | "manager" | "member"
  ) =>
    supabase
      .from("invites")
      .insert([{ org_id, email, role }])
      .select()
      .single(),

  getById: async (inviteId: string) => {
    return await supabase
      .from("invites")
      .select("id, email, org_id, role, used")
      .eq("id", inviteId)
      .maybeSingle()
      .returns<InviteRow>();
  },

  // mark that invite as used
  markUsed: async (inviteId: string) => {
    return await supabase
      .from("invites")
      .update({ used: true })
      .eq("id", inviteId);
  },
};

// Policy functions
export const policies = {
  getPoliciesByOrgId: async (orgId: string) => {
    return await supabase
      .from("policies")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true })
      .returns<Policy[]>();
  },
  getByTypeAndOrg: async (expenseType: string, orgId: string) => {
    try {
      const { data, error } = await supabase
        .from("policies")
        .select("*")
        .eq("expense_type", expenseType)
        .eq("organization_id", orgId)
        .maybeSingle();

      return { data, error };
    } catch (error) {
      console.error("Error in getByTypeAndOrg:", error);
      return { data: null, error };
    }
  },
  createPolicy: async (
    policyData: Omit<Policy, "id" | "created_at" | "updated_at">
  ) => {
    return await supabase
      .from("policies")
      .insert([policyData])
      .select()
      .single()
      .returns<Policy>();
  },

  updatePolicy: async (
    policyId: string,
    updates: Partial<
      Omit<Policy, "id" | "org_id" | "created_at" | "updated_at">
    >
  ) => {
    return await supabase
      .from("policies")
      .update(updates)
      .eq("id", policyId)
      .select()
      .single()
      .returns<Policy>();
  },

  deletePolicy: async (policyId: string) => {
    return await supabase.from("policies").delete().eq("id", policyId);
  },
};

export const policyFiles = {
  upload: async (file: File, orgId: string) => {
    try {
      // Validate PDF
      if (!file.type.includes("pdf")) {
        throw new Error("Only PDF files are allowed");
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new Error("File size must be under 5MB");
      }

      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${file.name}`;

      // Upload to Supabase Storage
      const { error } = await supabase.storage
        .from("policies-bucket")
        .upload(fileName, file, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (error) throw error;

      // Get public URL
      const { data } = supabase.storage
        .from("policies-bucket")
        .getPublicUrl(fileName);

      return { success: true, url: data.publicUrl };
    } catch (err: any) {
      return { success: false, error: err.message || "Upload failed" };
    }
  },
};

// Organization Settings functions
export const orgSettings = {
  getByOrgId: async (orgId: string) => {
    const { data, error } = await supabase
      .from("org_settings")
      .select("*")
      .eq("org_id", orgId)
      .single();

    if (error) {
      return { data: null, error: error as DatabaseError };
    }

    return {
      data: data as OrganizationSettings,
      error: null,
    };
  },

  /**
   * Create or update organization settings
   */
  upsert: async (
    orgId: string,
    settings: Partial<
      Omit<OrganizationSettings, "id" | "org_id" | "created_at" | "updated_at">
    >
  ) => {
    const { data, error } = await supabase
      .from("org_settings")
      .upsert({
        org_id: orgId,
        ...settings,
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error as DatabaseError };
    }

    return {
      data: data as OrganizationSettings,
      error: null,
    };
  },

  /**
   * Update expense columns configuration
   */
  updateExpenseColumns: async (orgId: string, columns: ColumnConfig[]) => {
    const { data, error } = await supabase
      .from("org_settings")
      .upsert(
        {
          org_id: orgId,
          expense_columns: columns,
          branding: {}, // Include default branding if not exists
        },
        {
          onConflict: "org_id",
          ignoreDuplicates: false,
        }
      )
      .select()
      .single();

    if (error) {
      return { data: null, error: error as DatabaseError };
    }

    return {
      data: data as OrganizationSettings,
      error: null,
    };
  },

  /**
   * Update branding configuration
   */
  updateBranding: async (orgId: string, branding: BrandingConfig) => {
    const { data, error } = await supabase
      .from("org_settings")
      .upsert({
        org_id: orgId,
        branding,
      })
      .select()
      .single();

    if (error) {
      return { data: null, error: error as DatabaseError };
    }

    return {
      data: data as OrganizationSettings,
      error: null,
    };
  },
};



// Expenses functions
export const expenses = {
  /**
   * Get an expense by ID
   */
  /**
   * Get an expense by ID
   */
  /**
   * Get an expense by ID
   */
  getById: async (id: string) => {
    // First get the expense with just the creator relationship
    const { data: expense, error } = await supabase
      .from("expenses")
      .select(
        `
      *,
      creator:profiles!user_id (
        full_name
      )
    `
      )
      .eq("id", id)
      .single();

    if (error) {
      return { data: null, error: error as DatabaseError };
    }

    // Now manually handle the approver relationship
    if (expense && expense.approver_id) {
      const { data: approverData } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", expense.approver_id)
        .single();

      if (approverData) {
        // Add the approver data to the result
        expense.approver = { full_name: approverData.full_name };
      }
    }

    return {
      data: expense as Expense & {
        creator: { full_name: string };
        approver?: { full_name: string };
      },
      error: null,
    };
  },
  /**
   
   */ /**
* Get expenses by event ID
*/
  getByEventId: async (eventId: string) => {
    // Get expenses with creator
    const { data: expenses, error } = await supabase
      .from("expenses")
      .select(
        `
      *,
      creator:profiles!user_id (
        full_name
      )
    `
      )
      .eq("event_id", eventId)
      .order("date", { ascending: false });

    if (error) {
      return { data: null, error: error as DatabaseError };
    }

    // Get all unique approver IDs
    const approverIds = [
      ...new Set(
        (expenses || [])
          .map((expense) => expense.approver_id)
          .filter((id) => id)
      ),
    ];

    if (approverIds.length > 0) {
      // Get all approvers in one query
      const { data: approvers } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", approverIds);

      if (approvers && approvers.length > 0) {
        // Create a lookup map
        const approverMap: Record<
          string,
          { user_id: string; full_name: string }
        > = {};
        approvers.forEach((a) => {
          approverMap[a.user_id] = a;
        });

        // Add approver data to each expense
        expenses.forEach((expense) => {
          if (expense.approver_id && approverMap[expense.approver_id]) {
            expense.approver = {
              full_name: approverMap[expense.approver_id].full_name,
            };
          }
        });
      }
    }

    return {
      data: expenses as (Expense & {
        creator: { full_name: string };
        approver?: { full_name: string };
      })[],
      error: null,
    };
  },

  /**
   * Get all expenses for a user in an organization
   */
  getByOrgAndUser: async (orgId: string, userId: string) => {
    // Get expenses with creator
    const { data: expenses, error } = await supabase
      .from("expenses")
      .select(
        `
      *,
      creator:profiles!user_id (
        full_name
      )
    `
      )
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return { data: null, error: error as DatabaseError };
    }

    // Get all unique approver IDs
    const approverIds = [
      ...new Set(
        (expenses || [])
          .map((expense) => expense.approver_id)
          .filter((id) => id)
      ),
    ];

    if (approverIds.length > 0) {
      // Get all approvers in one query
      const { data: approvers } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", approverIds);

      if (approvers && approvers.length > 0) {
        // Create a lookup map
        const approverMap: Record<
          string,
          { user_id: string; full_name: string }
        > = {};
        approvers.forEach((a) => {
          approverMap[a.user_id] = a;
        });

        // Add approver data to each expense
        expenses.forEach((expense) => {
          if (expense.approver_id && approverMap[expense.approver_id]) {
            expense.approver = {
              full_name: approverMap[expense.approver_id].full_name,
            };
          }
        });
      }
    }

    return {
      data: expenses as (Expense & {
        creator: { full_name: string };
        approver?: { full_name: string };
      })[],
      error: null,
    };
  },

  /**
   * Get all expenses for an organization (admin only)
   */
  getByOrg: async (orgId: string) => {
    // Get expenses with creator
    const { data: expenses, error } = await supabase
      .from("expenses")
      .select(
        `
      *,
      creator:profiles!user_id (
        full_name
      )
    `
      )
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (error) {
      return { data: null, error: error as DatabaseError };
    }

    // Get all unique approver IDs
    const approverIds = [
      ...new Set(
        (expenses || [])
          .map((expense) => expense.approver_id)
          .filter((id) => id)
      ),
    ];

    if (approverIds.length > 0) {
      // Get all approvers in one query
      const { data: approvers } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", approverIds);

      if (approvers && approvers.length > 0) {
        // Create a lookup map
        const approverMap: Record<
          string,
          { user_id: string; full_name: string }
        > = {};
        approvers.forEach((a) => {
          approverMap[a.user_id] = a;
        });

        // Add approver data to each expense
        expenses.forEach((expense) => {
          if (expense.approver_id && approverMap[expense.approver_id]) {
            expense.approver = {
              full_name: approverMap[expense.approver_id].full_name,
            };
          }
        });
      }
    }

    return {
      data: expenses as (Expense & {
        creator: { full_name: string };
        approver?: { full_name: string };
      })[],
      error: null,
    };
  },

  /**
   * Get pending approvals for a user
   */
  getPendingApprovals: async (orgId: string, userId: string) => {
    // Get expenses with creator
    const { data: expenses, error } = await supabase
      .from("expenses")
      .select(
        `
      *,
      creator:profiles!user_id (
        full_name
      )
    `
      )
      .eq("org_id", orgId)
      .eq("approver_id", userId)
      .eq("status", "submitted")
      .order("created_at", { ascending: false });

    if (error) {
      return { data: null, error: error as DatabaseError };
    }

    // For pending approvals, the approver is the current user
    // So we can get the user's profile in one query
    if (expenses && expenses.length > 0) {
      const { data: approver } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", userId)
        .single();

      if (approver) {
        // Add the same approver info to all expenses
        expenses.forEach((expense) => {
          expense.approver = { full_name: approver.full_name };
        });
      }
    }

    return {
      data: expenses as (Expense & {
        creator: { full_name: string };
        approver?: { full_name: string };
      })[],
      error: null,
    };
  },
  /**
   * Upload a receipt file
   */
  uploadReceipt: async (
    file: File,
    userId: string,
    orgId: string
  ): Promise<{ path: string; error: StorageError | null }> => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random().toString(36).slice(2)}.${fileExt}`;
    const filePath = `${userId}/${orgId}/${fileName}`;

    const { error } = await supabase.storage
      .from("expense-receipts")
      .upload(filePath, file);

    if (error) {
      return { path: "", error: error };
    }

    return {
      path: filePath,
      error: null,
    };
  },

  /**
   * Get a download URL for a receipt
   */
  getReceiptUrl: async (
    path: string
  ): Promise<{ url: string; error: StorageError | null }> => {
    const { data, error } = await supabase.storage
      .from("expense-receipts")
      .createSignedUrl(path, 3600); // URL valid for 1 hour

    if (error) {
      return { url: "", error: error };
    }

    return {
      url: data.signedUrl,
      error: null,
    };
  },
  // Add this function to the expenses object in db.ts
  async getApproverNames(
    expenseIds: string[]
  ): Promise<Record<string, string>> {
    try {
      if (!expenseIds || expenseIds.length === 0) {
        return {};
      }

      const { data, error } = await supabase.rpc("get_expense_approver", {
        expense_ids: expenseIds,
      });

      if (error) {
        console.error("Error getting approver names:", error);
        return {};
      }

      const approverMap: Record<string, string> = {};
      if (data && data.length > 0) {
        data.forEach((item: { expense_id: string; approver_name: string }) => {
          approverMap[item.expense_id] = item.approver_name;
        });
      }

      return approverMap;
    } catch (error) {
      console.error("Exception in getApproverNames:", error);
      return {};
    }
  },
  /**
   * Create a new expense with receipt
   */
  create: async (
    expense: Omit<
      Expense,
      "id" | "status" | "policy_validations" | "created_at" | "updated_at"
    >,
    receiptFile?: File
  ) => {
    try {
      let receipt: ReceiptInfo | null = null;

      // Upload receipt if provided
      if (receiptFile) {
        const { path, error: uploadError } = await expenses.uploadReceipt(
          receiptFile,
          expense.user_id,
          expense.org_id
        );

        if (uploadError) {
          return {
            data: null,
            error: {
              message: `Failed to upload receipt: ${uploadError.message}`,
              details: uploadError.message,
              hint: "Check file size and type",
              code: "STORAGE_UPLOAD_ERROR",
            },
          };
        }

        receipt = {
          filename: receiptFile.name,
          path,
          size: receiptFile.size,
          mime_type: receiptFile.type,
        };
      }

      // Get approver_id - first check if it's directly in the expense object
      // If not, try to get it from custom_fields
      let approver_id = expense.approver_id || null;

      // If approver_id is not in the expense object but exists in custom_fields
      if (
        !approver_id &&
        expense.custom_fields &&
        expense.custom_fields.approver
      ) {
        approver_id = expense.custom_fields.approver;

        // Remove it from custom_fields since we're using it directly
        delete expense.custom_fields.approver;
      }

      // Log for debugging
      console.log("Inserting expense with approver_id:", approver_id);

      // Create expense with receipt info, approver_id, and signature_url
      const { data, error } = await supabase
        .from("expenses")
        .insert([
          {
            ...expense,
            receipt,
            approver_id, // Explicitly set approver_id
            status: "submitted", // Set initial status
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Error inserting expense:", error);
        return { data: null, error: error as DatabaseError };
      }

      return {
        data: data as Expense,
        error: null,
      };
    } catch (error) {
      console.error("Caught error in expenses.create:", error);
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          details: "",
          hint: "Check your input and try again",
          code: "UNKNOWN_ERROR",
        },
      };
    }
  },


  /**
   * Update an expense by finance
   */

  updateByFinance: async (id: string, approved: boolean, comment: string) => {
    try {
      const status = approved ? "finance_approved" : "finance_rejected";
      // const status = approved ? "approved" : "rejected";

      const updates = {
        status,
        finance_comment: comment,
        finance_decision_at: new Date().toISOString(),
        payment_status: approved ? "pending" : null,
      };

      // Step 1: Update the expense record
      const { data, error } = await supabase
        .from("expenses")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("❌ Expense update error:", error);
        return { data: null, error };
      }

      // Step 2: Insert into expense_history
      // const { error: historyError } = await supabase.from("expense_history").insert({
      //   expense_id: id,
      //   action: status,
      //   actor_type: "finance",
      //   comment,
      //   changed_fields: updates, // Make sure 'changed_fields' is a JSONB column in Supabase
      //   created_at: new Date().toISOString(), // Optional: if you have this field
      // });

      // if (historyError) {
      //   console.warn("⚠️ Expense history insert failed:", historyError);
      //   // Not returning error here to prevent blocking the flow
      // }

      return { data, error: null };

    } catch (err: any) {
      console.error(" Unhandled error in updateByFinance:", err);

      return {
        data: null,
        error: {
          message: err.message || "Unexpected error",
          code: "UNHANDLED_EXCEPTION",
          details: "",
          hint: "Check column existence and JSON formats",
        },
      };
    }
  },

  /**
   * Update an expense
   */
  update: async (
    id: string,
    updates: Partial<
      Omit<Expense, "id" | "org_id" | "user_id" | "created_at" | "updated_at">
    >,
    receiptFile?: File
  ) => {
    try {
      // First check if expense exists
      const { data: existingExpense, error: fetchError } = await supabase
        .from("expenses")
        .select("user_id, org_id")
        .eq("id", id)
        .single();

      if (fetchError) {
        console.error("Error fetching expense:", fetchError);
        return {
          data: null,
          error: {
            message: "Error checking expense existence",
            details: fetchError.message,
            hint: "Check the expense ID and try again",
            code: "FETCH_ERROR",
          },
        };
      }

      if (!existingExpense) {
        console.error("Expense not found with ID:", id);
        return {
          data: null,
          error: {
            message: "Expense not found",
            details: `No expense found with ID: ${id}`,
            hint: "Check the expense ID and try again",
            code: "EXPENSE_NOT_FOUND",
          },
        };
      }

      let receipt = updates.receipt;

      // Upload new receipt if provided
      if (receiptFile) {
        const { path, error: uploadError } = await expenses.uploadReceipt(
          receiptFile,
          existingExpense.user_id,
          existingExpense.org_id
        );

        if (uploadError) {
          console.error("Error uploading receipt:", uploadError);
          return {
            data: null,
            error: {
              message: `Failed to upload receipt: ${uploadError.message}`,
              details: uploadError.message,
              hint: "Check file size and type",
              code: "STORAGE_UPLOAD_ERROR",
            },
          };
        }

        receipt = {
          filename: receiptFile.name,
          path,
          size: receiptFile.size,
          mime_type: receiptFile.type,
        };
      }

      // Update the expense
      const { data, error } = await supabase
        .from("expenses")
        .update({ ...updates, receipt })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error updating expense:", error);
        return {
          data: null,
          error: {
            message: error.message,
            details: error.details || "Unknown error occurred",
            hint: error.hint || "Check your input and try again",
            code: error.code || "UNKNOWN_ERROR",
          },
        };
      }

      if (!data) {
        console.error("No data returned after update for ID:", id);
        return {
          data: null,
          error: {
            message: "Update failed",
            details: "No data returned after update operation",
            hint: "Check the expense ID and try again",
            code: "UPDATE_FAILED",
          },
        };
      }

      return {
        data: data as Expense,
        error: null,
      };
    } catch (error) {
      console.error("Unexpected error in update:", error);
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          details: "",
          hint: "Check your input and try again",
          code: "UNKNOWN_ERROR",
        },
      };
    }
  },

  /**
   * Delete an expense by ID
   */
  delete: async (id: string) => {
    // Delete related records first
    await supabase.from("vouchers").delete().eq("expense_id", id);
    await supabase.from("expense_history").delete().eq("expense_id", id);
    await supabase.from("expense_comments").delete().eq("expense_id", id);

    // Delete the expense
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    return { data: null, error };
  },


};

// Vouchers functions
export const vouchers = {
  // Fix the Voucher create function
  create: async (data: {
    expense_id: string;
    your_name: string;
    amount: number;
    purpose: string;
    credit_person: string;
    signature_url: string | null;
    created_by?: string;
    manager_signature_url: string | null;
    approver_id?: string; // Added approver_id parameter
    org_id?: string;
  }) => {
    try {
      console.log("Creating voucher with data:", data);

      // Explicitly define the payload with correct types
      const payload = {
        expense_id: data.expense_id,
        your_name: data.your_name,
        amount: data.amount,
        purpose: data.purpose,
        credit_person: data.credit_person,
        signature_url: data.signature_url,
        manager_signature_url: data.manager_signature_url,
        created_by: data.created_by,
        approver_id: data.approver_id || null, // Include approver_id in payload
        org_id: data.org_id,
      };

      console.log("Final voucher payload:", payload);

      const { data: response, error } = await supabase
        .from("vouchers")
        .insert([payload])
        .select()
        .single();

      if (error) {
        console.error("Voucher creation error from Supabase:", error);
        return {
          data: null,
          error,
        };
      }

      console.log("Voucher created successfully, response:", response);
      return {
        data: response,
        error: null,
      };
    } catch (error) {
      console.error("Unexpected error in voucher creation:", error);
      return {
        data: null,
        error,
      };
    }
  },
  /**
   * Get a voucher by expense ID
   */
  /**
   * Get a voucher by expense ID (Fixed version)
   */
  getByExpenseId: async (expenseId: string) => {
    try {
      // First, get just the voucher itself without trying to join profiles
      const { data: voucher, error } = await supabase
        .from("vouchers")
        .select("*")
        .eq("expense_id", expenseId)
        .single();

      if (error) {
        return { data: null, error: error as DatabaseError };
      }

      // If voucher exists and has an approver_id, fetch the approver profile separately
      if (voucher && voucher.approver_id) {
        const { data: approverData, error: approverError } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", voucher.approver_id)
          .single();

        if (!approverError && approverData) {
          // Add the approver data to the result as a property
          (voucher as any).approver = { full_name: approverData.full_name };
        }
      }

      return {
        data: voucher as Voucher,
        error: null,
      };
    } catch (error) {
      console.error("Error fetching voucher:", error);
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          details: "",
          hint: "Check your input and try again",
          code: "UNKNOWN_ERROR",
        } as DatabaseError,
      };
    }
  },

  /**
   * Update a voucher
   */
  update: async (
    id: string,
    updates: Partial<
      Omit<Voucher, "id" | "expense_id" | "created_at" | "updated_at">
    >
  ) => {
    const { data, error } = await supabase
      .from("vouchers")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return { data: null, error: error as DatabaseError };
    }

    return {
      data: data as Voucher,
      error: null,
    };
  },

  // Add this function to your vouchers object in db.ts
  uploadSignature: async (
    signatureDataUrl: string,
    userId: string,
    orgId: string,
    type: "user" | "approver"
  ): Promise<{ path: string; error: StorageError | null }> => {
    try {
      // Skip the base64 prefix to get the actual data
      const base64Data = signatureDataUrl.split(",")[1];
      if (!base64Data) {
        console.error("Invalid data URL format");
        return {
          path: "",
          error: new StorageApiError("Invalid data URL format", 400),
        };
      }

      // Convert base64 to binary
      const binaryData = atob(base64Data);
      const arrayBuffer = new ArrayBuffer(binaryData.length);
      const uint8Array = new Uint8Array(arrayBuffer);
      for (let i = 0; i < binaryData.length; i++) {
        uint8Array[i] = binaryData.charCodeAt(i);
      }

      // Create blob from the binary data
      const blob = new Blob([uint8Array], { type: "image/png" });

      const fileName = `sig_${type}_${Math.random().toString(36).slice(2)}.png`;
      const filePath = `${userId}/${orgId}/${fileName}`;

      const { error } = await supabase.storage
        .from("voucher-signatures")
        .upload(filePath, blob);

      if (error) {
        console.error("Supabase storage error:", error);
        return { path: "", error: error };
      }

      console.log(`Signature uploaded successfully at path: ${filePath}`);
      return {
        path: filePath,
        error: null,
      };
    } catch (error) {
      console.error("Error uploading signature:", error);
      // Import and use StorageError or StorageApiError at the top of your file
      return {
        path: "",
        error: new StorageApiError(
          "Failed to upload signature: " +
          (error instanceof Error ? error.message : String(error)),
          500
        ),
      };
    }
  },

  /**
   * Get a download URL for a signature
   */
  getSignatureUrl: async (
    path: string
  ): Promise<{ url: string; error: StorageError | null }> => {
    const { data, error } = await supabase.storage
      .from("user-signatures")
      .createSignedUrl(path, 3600); // URL valid for 1 hour

    if (error) {
      return { url: "", error: error };
    }

    return {
      url: data.signedUrl,
      error: null,
    };
  },
};

// Voucher attachment helper for bucket "voucher-ss-payment"
export const voucherAttachments = {
  // Upload file to "voucher-ss-payment" bucket
  upload: async (
    file: File,
    userId: string,
    orgId: string
  ): Promise<{ path: string | null; error: any }> => {
    try {
      const { data, error } = await supabase.storage
        .from("voucher-ss-payment")
        .upload(`${userId}/${orgId}/${Date.now()}_${file.name}`, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        return { path: null, error: error };
      }

      return {
        path: data.path,
        error: null,
      };
    } catch (err) {
      return { path: null, error: err };
    }
  },

  // Get signed URL for a file in "voucher-ss-payment"
  getUrl: async (
    path: string
  ): Promise<{ url: string; error: any }> => {
    const { data, error } = await supabase.storage
      .from("voucher-ss-payment")
      .createSignedUrl(path, 3600); // URL valid for 1 hour

    if (error) {
      return { url: "", error: error };
    }

    return {
      url: data.signedUrl,
      error: null,
    };
  },
};

// Update the ExpenseHistoryEntry interface to match the simpler structure

// Replace the existing expenseHistory object with this simpler version
export const expenseHistory = {
  /**
   * Add a history entry for any expense action
   */
  addEntry: async (
    expenseId: string,
    userId: string,
    userName: string,
    actionType: "created" | "updated" | "approved" | "rejected",
    oldValue: string | null,
    newValue: string
  ): Promise<{
    data: ExpenseHistoryEntry | null;
    error: DatabaseError | null;
  }> => {
    try {
      const { data, error } = await supabase
        .from("expense_history")
        .insert({
          expense_id: expenseId,
          user_id: userId,
          user_name: userName,
          action_type: actionType,
          old_value: oldValue,
          new_value: newValue,
        })
        .select()
        .single();

      if (error) {
        console.error("Error adding expense history entry:", error);
        return {
          data: null,
          error: error as DatabaseError,
        };
      }

      return {
        data: data as ExpenseHistoryEntry,
        error: null,
      };
    } catch (error) {
      console.error("Exception in addEntry:", error);
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          details: "",
          hint: "An error occurred while adding history entry",
          code: "UNKNOWN_ERROR",
        },
      };
    }
  },

  /**
   * Get expense history for a specific expense
   */
  getByExpenseId: async (
    expenseId: string
  ): Promise<{ data: ExpenseHistoryEntry[]; error: DatabaseError | null }> => {
    try {
      const { data, error } = await supabase
        .from("expense_history")
        .select("*")
        .eq("expense_id", expenseId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error getting expense history:", error);
        return {
          data: [],
          error: error as DatabaseError,
        };
      }

      return {
        data: data as ExpenseHistoryEntry[],
        error: null,
      };
    } catch (error) {
      console.error("Exception in getByExpenseId:", error);
      return {
        data: [],
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          details: "",
          hint: "An error occurred while retrieving expense history",
          code: "UNKNOWN_ERROR",
        },
      };
    }
  },

  /**
   * Get all history entries for an organization
   */
  getByOrgId: async (
    orgId: string,
    limit: number = 50
  ): Promise<{ data: ExpenseHistoryEntry[]; error: DatabaseError | null }> => {
    try {
      const { data, error } = await supabase
        .from("expense_history")
        .select(
          `
          *,
          expenses!expense_id (org_id)
        `
        )
        .eq("expenses.org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) {
        console.error("Error getting organization expense history:", error);
        return {
          data: [],
          error: error as DatabaseError,
        };
      }

      return {
        data: data as ExpenseHistoryEntry[],
        error: null,
      };
    } catch (error) {
      console.error("Exception in getByOrgId:", error);
      return {
        data: [],
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          details: "",
          hint: "An error occurred while retrieving organization expense history",
          code: "UNKNOWN_ERROR",
        },
      };
    }
  },
};

export const expenseComments = {
  /**
   * Get comments for a specific expense
   */
  getByExpenseId: async (expenseId: string) => {
    try {
      const { data, error } = await supabase
        .from("expense_comments")
        .select(
          `
          *,
          user:profiles!user_id (
            id,
            user_id,
            full_name,
            email,
            avatar_url
          )
        `
        )
        .eq("expense_id", expenseId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching comments:", error);
        return {
          data: null,
          error: error as DatabaseError,
        };
      }

      return {
        data: data as ExpenseCommentWithUser[],
        error: null,
      };
    } catch (error) {
      console.error("Exception in getByExpenseId:", error);
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          details: "",
          hint: "An error occurred while retrieving comments",
          code: "UNKNOWN_ERROR",
        },
      };
    }
  },

  /**
   * Add a comment to an expense
   */
  add: async (comment: {
    expense_id: string;
    user_id: string;
    content: string;
    parent_id?: string | null;
  }) => {
    try {
      // Get current user profile ID first
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", comment.user_id)
        .single();

      if (profileError || !profileData) {
        console.error("Error finding user profile:", profileError);
        return {
          data: null,
          error: {
            message: "User profile not found",
            details:
              profileError?.message || "Profile ID could not be determined",
            hint: "Make sure the user exists in the profiles table",
            code: "PROFILE_NOT_FOUND",
          } as DatabaseError,
        };
      }

      // Now use the profile ID for the comment
      const { data, error } = await supabase
        .from("expense_comments")
        .insert({
          expense_id: comment.expense_id,
          user_id: profileData.id, // Use the profile ID, not the auth user ID
          content: comment.content,
          parent_id: comment.parent_id || null,
          is_deleted: false,
        })
        .select(
          `
          *,
          user:profiles!user_id (
            id,
            user_id,
            full_name,
            email,
            avatar_url
          )
        `
        )
        .single();

      if (error) {
        console.error("Error adding comment:", error);
        return {
          data: null,
          error: error as DatabaseError,
        };
      }

      return {
        data: data as ExpenseCommentWithUser,
        error: null,
      };
    } catch (error) {
      console.error("Exception in add:", error);
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          details: "",
          hint: "An error occurred while adding a comment",
          code: "UNKNOWN_ERROR",
        },
      };
    }
  },

  /**
   * Get replies for a comment
   */
  getReplies: async (commentId: string) => {
    try {
      const { data, error } = await supabase
        .from("expense_comments")
        .select(
          `
          *,
          user:profiles!user_id (
            id,
            user_id,
            full_name,
            email,
            avatar_url
          )
        `
        )
        .eq("parent_id", commentId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching replies:", error);
        return {
          data: null,
          error: error as DatabaseError,
        };
      }

      return {
        data: data as ExpenseCommentWithUser[],
        error: null,
      };
    } catch (error) {
      console.error("Exception in getReplies:", error);
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Unknown error",
          details: "",
          hint: "An error occurred while retrieving replies",
          code: "UNKNOWN_ERROR",
        },
      };
    }
  },
};

export const authUsers = {
  deleteUserCompletely: async (userId: string, email?: string) => {
    const successes: string[] = [];
    const errors: string[] = [];

    try {
      if (!userId || typeof userId !== "string") {
        return { success: false, errors: ["Valid userId required"] };
      }

      // 1. Delete from organization_users
      const { error: orgUserError } = await supabaseAdmin
        .from("organization_users")
        .delete()
        .eq("user_id", userId);
      if (orgUserError) {
        errors.push(`organization_users: ${orgUserError.message}`);
      } else {
        successes.push("Deleted from organization_users");
      }

      // 2. Delete from invite_link_usage
      const { error: inviteLinkError } = await supabaseAdmin
        .from("invite_link_usage")
        .delete()
        .eq("user_id", userId);
      if (inviteLinkError) {
        errors.push(`invite_link_usage: ${inviteLinkError.message}`);
      } else {
        successes.push("Deleted from invite_link_usage");
      }

      // 3. Delete from invites
      if (email) {
        const { error: invitesError } = await supabaseAdmin
          .from("invites")
          .delete()
          .eq("email", email.toLowerCase());
        if (invitesError) {
          errors.push(`invites: ${invitesError.message}`);
        } else {
          successes.push("Deleted from invites");
        }
      }

      // 4. Delete from vouchers
      const { error: vouchersError } = await supabaseAdmin
        .from("vouchers")
        .delete()
        .eq("created_by", userId);
      if (vouchersError) {
        errors.push(`vouchers: ${vouchersError.message}`);
      } else {
        successes.push("Deleted from vouchers");
      }

      // 5. Delete from profiles
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("user_id", userId);
      if (profileError) {
        errors.push(`profiles: ${profileError.message}`);
      } else {
        successes.push("Deleted from profiles");
      }

      // 6. Delete auth user
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authError) {
        errors.push(`auth: ${authError.message}`);
      } else {
        successes.push("Deleted from auth users");
      }

      return {
        success: errors.length === 0,
        successes,
        errors,
      };
    } catch (err: any) {
      console.error("Unexpected error in deleteUserCompletely:", err);
      return {
        success: false,
        successes,
        errors: [...errors, err.message || "Unexpected internal server error"],
      };
    }
  },
};