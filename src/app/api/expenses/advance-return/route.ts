import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { forbidden, getOrgRole, getSignedInUser, unauthorized } from "@/lib/server/auth";

const BUCKET = "advance-return-proofs";
const MAX_BYTES = 10 * 1024 * 1024;

const amountOf = (r: any) => Number(r?.approved_amount ?? r?.amount ?? 0) || 0;

/**
 * Edit one earlier return: change its amount and/or replace its proof. The
 * advance's Remaining Amount is recomputed from the difference.
 */
export async function PATCH(req: NextRequest) {
  const caller = await getSignedInUser();
  if (!caller) return unauthorized();

  try {
    const form = await req.formData();
    const advanceId = String(form.get("advanceId") || "");
    const index = Number(form.get("index"));
    const newAmount = Math.round((Number(form.get("amount")) || 0) * 100) / 100;
    const file = form.get("proof");
    const hasFile = file instanceof File && file.size > 0;

    if (!advanceId || !Number.isInteger(index) || index < 0) {
      return NextResponse.json({ error: "advanceId and index are required" }, { status: 400 });
    }
    if (!(newAmount > 0)) {
      return NextResponse.json({ error: "Enter a valid return amount" }, { status: 400 });
    }
    if (hasFile) {
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: "Proof must be 10 MB or smaller" }, { status: 400 });
      }
      if (!/^(image\/|application\/pdf)/.test(file.type)) {
        return NextResponse.json({ error: "Proof must be an image or PDF" }, { status: 400 });
      }
    }

    const supabase = getSupabaseAdmin();
    const { data: advance } = await supabase
      .from("expense_new")
      .select("id, org_id, user_id, amount, approved_amount, custom_fields")
      .eq("id", advanceId)
      .maybeSingle();
    if (!advance || advance.user_id !== caller.id) {
      return NextResponse.json({ error: "Advance not found" }, { status: 404 });
    }
    const cf = (advance.custom_fields || {}) as Record<string, any>;
    const returns: any[] = Array.isArray(cf.advance_returns) ? [...cf.advance_returns] : [];
    if (cf.advance_return_reviewed === true) {
      return NextResponse.json(
        { error: "This return has been reviewed and can no longer be edited" },
        { status: 403 }
      );
    }
    const entry = returns[index];
    if (!entry) {
      return NextResponse.json({ error: "Return not found" }, { status: 404 });
    }

    const original = amountOf(advance);
    const rem = cf.advance_remaining_amount;
    const remaining =
      rem !== null && rem !== undefined && rem !== "" ? Number(rem) || 0 : original;
    const oldAmount = Number(entry.amount) || 0;
    const available = remaining + oldAmount;
    if (newAmount > available + 0.001) {
      return NextResponse.json(
        { error: `Return amount cannot exceed ₹${available.toFixed(2)}` },
        { status: 400 }
      );
    }

    let proofPath = entry.proof_path as string;
    const oldPath = proofPath;
    if (hasFile) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      proofPath = `${advance.org_id}/${advance.id}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from(entry.bucket || BUCKET)
        .upload(proofPath, Buffer.from(await file.arrayBuffer()), {
          contentType: file.type,
          upsert: false,
        });
      if (upErr) throw upErr;
    }

    const at = new Date().toISOString();
    returns[index] = {
      ...entry,
      amount: newAmount,
      proof_path: proofPath,
      edited_at: at,
      edited_by: caller.id,
    };
    const totalReturned = returns.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const newRemaining = Math.max(Math.round((available - newAmount) * 100) / 100, 0);

    const { error: updErr } = await supabase
      .from("expense_new")
      .update({
        custom_fields: {
          ...cf,
          advance_remaining_amount: newRemaining,
          advance_returned_amount: totalReturned,
          advance_returns: returns,
          advance_updated_at: at,
        },
      })
      .eq("id", advance.id);
    if (updErr) {
      if (hasFile) await supabase.storage.from(entry.bucket || BUCKET).remove([proofPath]);
      throw updErr;
    }
    // The replaced proof is no longer referenced.
    if (hasFile && oldPath) {
      await supabase.storage.from(entry.bucket || BUCKET).remove([oldPath]);
    }

    return NextResponse.json({ success: true, remainingAmount: newRemaining, returnedAmount: totalReturned });
  } catch (error: any) {
    console.error("Error editing advance return:", error);
    return NextResponse.json({ error: error?.message || "Failed to edit return" }, { status: 500 });
  }
}

/** Returns made against one of the signed-in user's advances, with signed proof links. */
export async function GET(req: NextRequest) {
  const caller = await getSignedInUser();
  if (!caller) return unauthorized();

  const advanceId = req.nextUrl.searchParams.get("advanceId");
  if (!advanceId) {
    return NextResponse.json({ error: "advanceId is required" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data: advance } = await supabase
    .from("expense_new")
    .select("id, org_id, user_id, custom_fields")
    .eq("id", advanceId)
    .maybeSingle();
  if (!advance) {
    return NextResponse.json({ error: "Advance not found" }, { status: 404 });
  }
  // The owner, or any member of the advance's organisation (Finance views proofs).
  if (advance.user_id !== caller.id && !(await getOrgRole(caller.id, advance.org_id))) {
    return forbidden();
  }
  const list: any[] = Array.isArray(advance.custom_fields?.advance_returns)
    ? advance.custom_fields.advance_returns
    : [];
  const returns = await Promise.all(
    list.map(async (r) => {
      const { data } = await supabase.storage
        .from(r.bucket || BUCKET)
        .createSignedUrl(r.proof_path, 3600);
      return {
        amount: Number(r.amount) || 0,
        returnedAt: r.returned_at as string,
        proofUrl: data?.signedUrl || null,
        proofName: String(r.proof_path || "").split("/").pop()?.replace(/^\d+-/, "") || "proof",
      };
    })
  );
  return NextResponse.json({ returns });
}

/**
 * The advance owner returns (part of) the unused balance of one advance and
 * uploads a proof. The proof goes to a storage bucket and the returned amount
 * is deducted from that same advance's Remaining Amount, so returning the
 * whole balance brings it to 0.
 */
export async function POST(req: NextRequest) {
  const caller = await getSignedInUser();
  if (!caller) return unauthorized();

  try {
    const form = await req.formData();
    const advanceId = String(form.get("advanceId") || "");
    const returnAmount = Math.round((Number(form.get("amount")) || 0) * 100) / 100;
    const file = form.get("proof");

    if (!advanceId) {
      return NextResponse.json({ error: "advanceId is required" }, { status: 400 });
    }
    if (!(returnAmount > 0)) {
      return NextResponse.json({ error: "Enter a valid return amount" }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Proof is required" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "Proof must be 10 MB or smaller" }, { status: 400 });
    }
    if (!/^(image\/|application\/pdf)/.test(file.type)) {
      return NextResponse.json({ error: "Proof must be an image or PDF" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data: advance } = await supabase
      .from("expense_new")
      .select("id, org_id, user_id, unique_id, expense_type, amount, approved_amount, custom_fields")
      .eq("id", advanceId)
      .maybeSingle();
    if (!advance) {
      return NextResponse.json({ error: "Advance not found" }, { status: 404 });
    }
    // Only the advance's owner can return against it.
    if (advance.user_id !== caller.id) {
      return NextResponse.json({ error: "You can only return your own advance" }, { status: 403 });
    }
    const cf = (advance.custom_fields || {}) as Record<string, any>;
    if (String(advance.expense_type || "").trim().toLowerCase() !== "advance" || cf.marked_as_advance !== true) {
      return NextResponse.json({ error: "Not an advance" }, { status: 400 });
    }

    const original = amountOf(advance);
    const rem = cf.advance_remaining_amount;
    const remaining =
      rem !== null && rem !== undefined && rem !== "" ? Number(rem) || 0 : original;
    if (returnAmount > remaining + 0.001) {
      return NextResponse.json(
        { error: `Return amount cannot exceed the remaining amount (₹${remaining.toFixed(2)})` },
        { status: 400 }
      );
    }

    // Make sure the bucket exists (private; proofs are read via signed URLs).
    const { data: bucket } = await supabase.storage.getBucket(BUCKET);
    if (!bucket) {
      const { error: bErr } = await supabase.storage.createBucket(BUCKET, { public: false });
      if (bErr && !/already exists/i.test(bErr.message)) throw bErr;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${advance.org_id}/${advance.id}/${Date.now()}-${safeName}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type,
        upsert: false,
      });
    if (upErr) throw upErr;

    const at = new Date().toISOString();
    const newRemaining = Math.max(Math.round((remaining - returnAmount) * 100) / 100, 0);
    const totalReturned = (Number(cf.advance_returned_amount) || 0) + returnAmount;
    const returns = Array.isArray(cf.advance_returns) ? cf.advance_returns : [];

    const { error: updErr } = await supabase
      .from("expense_new")
      .update({
        custom_fields: {
          ...cf,
          advance_remaining_amount: newRemaining,
          advance_returned_amount: totalReturned,
          advance_returns: [
            ...returns,
            { amount: returnAmount, proof_path: path, bucket: BUCKET, returned_at: at, returned_by: caller.id },
          ],
          advance_updated_at: at,
        },
      })
      .eq("id", advance.id);
    if (updErr) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw updErr;
    }

    return NextResponse.json({
      success: true,
      remainingAmount: newRemaining,
      returnedAmount: totalReturned,
    });
  } catch (error: any) {
    console.error("Error returning advance:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to return advance" },
      { status: 500 }
    );
  }
}
