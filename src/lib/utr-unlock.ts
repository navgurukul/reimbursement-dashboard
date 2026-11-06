/** Asks the server whether the UTR unlock password is right for this organisation. */
export async function checkUtrUnlockPassword(
  slug: string,
  password: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch("/api/utr-unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, password }),
    });
    if (response.ok) return { ok: true };
    const body = await response.json().catch(() => ({}));
    return { ok: false, error: body?.error };
  } catch {
    return { ok: false, error: "Couldn't check the password. Try again." };
  }
}
