import supabase from "./supabase";
import { createClient } from "@supabase/supabase-js";
import { StorageError } from "@supabase/storage-js";

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

export type ExpenseStatus = "submitted" | "approved" | "rejected";
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
  created_at: string;
  updated_at: string;
}

export interface Voucher {
  id: string;
  expense_id: string;
  your_name: string;
  created_at: string;
  amount: number;
  purpose: string;
  credit_person: string;
  signature_url?: string;
  manager_signature_url?: string;
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

  getById: async (id: string) => {
    return await supabase
      .from("organizations")
      .select("*")
      .eq("id", id)
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
  getById: async (id: string) => {
    const { data, error } = await supabase
      .from("expenses")
      .select(
        `
        *,
        creator:profiles!user_id (
          full_name
        ),
        approver:profiles(
          full_name
        )
      `
      )
      .eq("id", id)
      .single();

    if (error) {
      return { data: null, error: error as DatabaseError };
    }

    return {
      data: data as Expense & {
        creator: { full_name: string };
        approver?: { full_name: string };
      },
      error: null,
    };
  },

  /**
   * Get all expenses for a user in an organization
   */
  getByOrgAndUser: async (orgId: string, userId: string) => {
    const { data, error } = await supabase
      .from("expenses")
      .select(
        `
        *,
        creator:profiles!user_id (
          full_name
        ),
        approver:profiles(
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

    return {
      data: data as (Expense & {
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
    const { data, error } = await supabase
      .from("expenses")
      .select(
        `
        *,
        creator:profiles!user_id (
          full_name
        ),
        approver:profiles(
          full_name
        )
      `
      )
      .eq("org_id", orgId);

    if (error) {
      return { data: null, error: error as DatabaseError };
    }

    return {
      data: data as (Expense & {
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
    const { data, error } = await supabase
      .from("expenses")
      .select(
        `
        *,
        creator:profiles!user_id (
          full_name
        ),
        approver:profiles(
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

    return {
      data: data as (Expense & {
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

      // Use top-level approver_id if present, otherwise fallback to custom_fields
      const approver_id =
        expense.approver_id || expense.custom_fields?.approver || null;
      if (expense.custom_fields) delete expense.custom_fields.approver;

      // Create expense with receipt info and approver_id
      const { data, error } = await supabase
        .from("expenses")
        .insert([
          {
            ...expense,
            receipt,
            approver_id,
            status: "submitted", // Set initial status
          },
        ])
        .select()
        .single();

      if (error) {
        return { data: null, error: error as DatabaseError };
      }

      return {
        data: data as Expense,
        error: null,
      };
    } catch (error) {
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
    const { error } = await supabase.from("expenses").delete().eq("id", id);

    return {
      data: null,
      error,
    };
  },

  // ... rest of the expense functions ...
};

// Vouchers functions
export const vouchers = {
  create: async (data: Omit<Voucher, "id" | "created_at" | "updated_at">) => {
    try {
      const { data: response, error } = await supabase
        .from("vouchers")
        .insert([
          {
            expense_id: data.expense_id,
            your_name: data.your_name,
            amount: data.amount,
            purpose: data.purpose,
            credit_person: data.credit_person,
            signature_url: data.signature_url,
            manager_signature_url: data.manager_signature_url,
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("Voucher creation error:", error);
        return {
          data: null,
          error,
        };
      }

      return {
        data: response,
        error: null,
      };
    } catch (error) {
      console.error("Unexpected error:", error);
      return {
        data: null,
        error,
      };
    }
  },

  /**
   * Get a voucher by expense ID
   */
  getByExpenseId: async (expenseId: string) => {
    const { data, error } = await supabase
      .from("vouchers")
      .select("*")
      .eq("expense_id", expenseId)
      .single();

    if (error) {
      return { data: null, error: error as DatabaseError };
    }

    return {
      data: data as Voucher,
      error: null,
    };
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

  /**
   * Upload a signature image
   */
  uploadSignature: async (
    base64Data: string,
    userId: string,
    orgId: string,
    type: "user" | "manager"
  ): Promise<{ path: string; error: StorageError | null }> => {
    try {
      if (!base64Data) {
        throw new Error("No signature data provided");
      }

      // Convert base64 to blob
      const base64 = base64Data.split(",")[1];
      if (!base64) {
        throw new Error("Invalid base64 signature data");
      }

      const binary = atob(base64);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([array], { type: "image/png" });
      const file = new File([blob], `${type}-signature.png`, {
        type: "image/png",
      });

      // Generate unique filename
      const fileName = `${Math.random().toString(36).slice(2)}.png`;
      const filePath = `${userId}/${orgId}/${fileName}`;

      // Debug logs
      console.log(
        "[uploadSignature] userId:",
        userId,
        "orgId:",
        orgId,
        "type:",
        type
      );
      console.log("[uploadSignature] filePath:", filePath);

      // Upload to storage
      const { error } = await supabase.storage
        .from("voucher-signatures")
        .upload(filePath, file);

      if (error) {
        console.error("[uploadSignature] Storage upload error:", error);
        return { path: "", error: error };
      }

      console.log("[uploadSignature] Upload successful:", filePath);
      return {
        path: filePath,
        error: null,
      };
    } catch (error) {
      console.error("Unexpected error in uploadSignature:", error);
      return {
        path: "",
        error: error as StorageError,
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
      .from("voucher-signatures")
      .createSignedUrl(path, 3600); // URL valid for 1 hour

    if (error) {
      return { url: "", error: error };
    }

    return {
      url: data.signedUrl,
      error: null,
    };
  },

  getByOrgId: async (orgId: string) => {
    const { data, error } = await supabase
      .from("vouchers")
      .select("*")
      .eq("org_id", orgId);
    if (error) {
      console.log("Voucher fetch error:", error, data);
      return { data: null, error };
    }
    console.log("All vouchers fetched:", data);
    return { data, error: null };
  },

  /**
   * Get all vouchers for a list of expense IDs
   */
  getByExpenseIds: async (expenseIds: string[]) => {
    if (!expenseIds || expenseIds.length === 0) {
      return { data: [], error: null };
    }
    const { data, error } = await supabase
      .from("vouchers")
      .select("*")
      .in("expense_id", expenseIds);
    if (error) {
      return { data: null, error };
    }
    return { data, error: null };
  },

  /**
   * Get a voucher by its ID
   */
  getById: async (id: string) => {
    const { data, error } = await supabase
      .from("vouchers")
      .select("*")
      .eq("id", id)
      .single();
    if (error) {
      return { data: null, error };
    }
    return { data, error: null };
  },
};

const attachVoucherInfo = (expensesArr) => {
  return expensesArr.map((exp) => {
    const voucher = allVouchers.find((v) => v.expense_id === exp.id);
    if (voucher) {
      console.log("Voucher matched for expense:", exp.id, voucher);
    }
    return voucher ? { ...exp, voucherId: voucher.id } : exp;
  });
};
