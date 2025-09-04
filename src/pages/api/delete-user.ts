// File: src/pages/api/delete-user.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const logs: string[] = [];
  const addLog = (msg: string) => {
    console.log(msg); // still log to server
    logs.push(msg);   // also store for response
  };

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    addLog("🔹 [START] /api/delete-user request");

    const { userId, email } = req.body;
    addLog(`➡️ Parsed body: ${JSON.stringify({ userId, email })}`);

    if (!userId || typeof userId !== "string") {
      addLog(`⚠️ Invalid userId received: ${userId}`);
      return res.status(400).json({ error: "Valid userId required", logs });
    }

    // 1. Delete from organization_users
    addLog(`🗑️ Deleting from organization_users for userId: ${userId}`);
    const { data: orgUsers, error: orgUserError } = await getSupabaseAdmin()
      .from("organization_users")
      .delete()
      .eq("user_id", userId)
      .select();
    if (orgUserError) {
      addLog(`❌ organization_users error: ${orgUserError.message}`);
      return res.status(500).json({ error: orgUserError.message, logs });
    }
    addLog(`✅ organization_users deleted: ${orgUsers.length}`);

    // 2. Delete from invite_link_usage
    addLog(`🗑️ Deleting from invite_link_usage for userId: ${userId}`);
    const { data: inviteUsage, error: inviteUsageError } = await getSupabaseAdmin()
      .from("invite_link_usage")
      .delete()
      .eq("user_id", userId)
      .select();
    if (inviteUsageError) {
      addLog(`❌ invite_link_usage error: ${inviteUsageError.message}`);
      return res.status(500).json({ error: inviteUsageError.message, logs });
    }
    addLog(`✅ invite_link_usage deleted: ${inviteUsage.length}`);

    // 3. Delete from invites
    if (email) {
      addLog(`🗑️ Deleting from invites for email: ${email.toLowerCase()}`);
      const { data: invites, error: inviteError } = await getSupabaseAdmin()
        .from("invites")
        .delete()
        .eq("email", email.toLowerCase())
        .select();
      if (inviteError) {
        addLog(`❌ invites error: ${inviteError.message}`);
        return res.status(500).json({ error: inviteError.message, logs });
      }
      addLog(`✅ invites deleted: ${invites.length}`);
    }

    // 4. Delete from vouchers
    addLog(`🗑️ Deleting from vouchers created_by: ${userId}`);
    const { data: vouchers, error: voucherError } = await getSupabaseAdmin()
      .from("vouchers")
      .delete()
      .eq("created_by", userId)
      .select();
    if (voucherError) {
      addLog(`❌ vouchers error: ${voucherError.message}`);
      return res.status(500).json({ error: voucherError.message, logs });
    }
    addLog(`✅ vouchers deleted: ${vouchers.length}`);

    // 5. Delete from profiles
    addLog(`🗑️ Deleting from profiles for userId: ${userId}`);
    const { data: profiles, error: profileError } = await getSupabaseAdmin()
      .from("profiles")
      .delete()
      .eq("user_id", userId)
      .select();
    if (profileError) {
      addLog(`❌ profiles error: ${profileError.message}`);
      return res.status(500).json({ error: profileError.message, logs });
    }
    addLog(`✅ profiles deleted: ${profiles.length}`);

    // 6. Delete Supabase auth user
    addLog(`🗑️ Deleting Supabase auth user: ${userId}`);
    const { error: authError } = await getSupabaseAdmin().auth.admin.deleteUser(userId);
    if (authError) {
      addLog(`❌ Supabase auth error: ${authError.message}`);
      return res.status(500).json({ error: authError.message, logs });
    }
    addLog("✅ Supabase auth user deleted");

    addLog(`🎉 [SUCCESS] User deletion flow completed for userId: ${userId}`);
    return res.status(200).json({ success: true, logs });
  } catch (err: any) {
    const msg = `💥 [FATAL] Unexpected error: ${err?.message || err}`;
    addLog(msg);
    return res.status(500).json({ error: "Internal server error", logs });
  }
}
