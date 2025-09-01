"use server";

import { authUsers, RemovedUsers, organizations, profiles  } from "@/lib/db";

export async function deleteUserAction(memberId: string, orgId: string) {
  try {
    // 1. Get the organization user
    const { data: orgUser, error: fetchError } = await organizations.getMemberById(memberId);
    if (fetchError || !orgUser) {
      return { success: false, error: fetchError?.message || "User not found" };
    }

    const userId = orgUser.user_id;

    // 2. Get user profile
    const { data: profile, error: profileError } = await profiles.getById(userId);
    if (profileError || !profile) {
      return { success: false, error: profileError?.message || "Profile not found" };
    }

    // 3. Backup into RemovedUsers
    const insertResult = await RemovedUsers.create({
      user_id: userId,
      email: profile.email,
      full_name: profile.full_name,
      created_at: profile.created_at,
      removable_at: new Date(),
    });
    if (insertResult.error) {
      return { success: false, error: insertResult.error.message || "Failed to backup user" };
    }

    // 4. Delete the user everywhere (auth + related tables)
    const deleteResult = await authUsers.deleteUserCompletely(userId, profile.email);
    if (!deleteResult.success) {
      return { success: false, error: deleteResult.errors?.[0] || "Failed to delete user account" };
    }

    return { success: true, userId };
  } catch (err: any) {
    console.error("deleteUserAction error:", err);
    return { success: false, error: err.message || "Unexpected error" };
  }
}
