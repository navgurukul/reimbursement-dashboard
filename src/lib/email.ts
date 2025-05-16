import supabase from "./supabase";

/**
 * Sends an invitation email using the Supabase Edge Function
 */
export async function sendInviteEmail(
  email: string,
  inviteUrl: string,
  organization: string
) {
  try {
    // Call the serverless function to send the invite
    const { data, error } = await supabase.functions.invoke("send-invite", {
      body: { email, inviteUrl, organization },
    });

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error("Error sending invite email:", error);
    return { data: null, error };
  }
}
