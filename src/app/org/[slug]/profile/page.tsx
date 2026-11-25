"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import supabase from "@/lib/supabase";
import {
  User,
  Upload,
  Mail,
  BadgeCheck,
  Landmark,
  Signature,
  CreditCard,
  LockKeyhole,
  ArrowLeft,
  FileText,
  Eye,
  EyeOff,
  ExternalLink,
} from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useRouter, useParams, useSearchParams } from "next/navigation";

import SignaturePad from "@/components/SignatureCanvas";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { StatusDurationSelector } from "@/components/StatusDurationSelector";
import { parseLeaveDuration } from "@/lib/leave-status";

import { useOrgStore } from "@/store/useOrgStore";
import { useAuthStore } from "@/store/useAuthStore";
import {
  getUserSignatureUrl,
  saveUserSignature,
  uploadToProfilePhotos,
  updateProfileAvatarUrl,
  getProfileAvatarUrl,
} from "@/lib/utils";

type AdvanceReturn = {
  amount: number;
  returnedAt: string;
  proofUrl: string | null;
  proofName: string;
};

export default function ProfilePage() {
  const router = useRouter();
  const params = useParams();
  const { organization, userRole } = useOrgStore();
  const { user } = useAuthStore();

  const searchParams = useSearchParams();
  const eventIdFromQuery = searchParams.get("eventId");
  const [loadingSignature, setLoadingSignature] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({
    event_id: eventIdFromQuery || "",
  });
  const [expenseSignature, setExpenseSignature] = useState("");
  const [savedUserSignature, setSavedUserSignature] = useState("");
  const [isDocumentPaneOpen, setIsDocumentPaneOpen] = useState(true);
  const [bankDetails, setBankDetails] = useState<any>(null);
  const [isDocumentValid, setIsDocumentValid] = useState<boolean | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [advances, setAdvances] = useState<
    {
      id: string;
      uniqueId: string;
      paidAt: string | null;
      amount: number;
      remaining: number | null;
      hasReturns: boolean;
      reviewed: boolean;
      returns: AdvanceReturn[];
    }[]
  >([]);
  const [loadingAdvances, setLoadingAdvances] = useState(true);
  const [advanceRefresh, setAdvanceRefresh] = useState(0);
  const [returnTarget, setReturnTarget] = useState<{
    id: string;
    uniqueId: string;
    remaining: number | null;
    editIndex: number | null;
  } | null>(null);
  const [returnAmount, setReturnAmount] = useState("");
  const [returnProof, setReturnProof] = useState<File | null>(null);
  const [submittingReturn, setSubmittingReturn] = useState(false);
  const isEditingRef = useRef(false);
  const [userProfile, setUserProfile] = useState<{
    id?: string;
    user_id?: string;
    full_name: string;
    email: string;
    avatar_url?: string;
    display_name?: string;
    leave_duration?: string;
  } | null>(null);

  // Fetch profile info from `profiles` table
  useEffect(() => {
    async function fetchUserProfile(isPeriodic = false) {
      if (!user?.id) return;

      try {
        const avatar_url = await getProfileAvatarUrl(user.id);

        const { data, error } = await supabase
          .from("profiles")
          .select("id, user_id, full_name, email, display_name, leave_duration, updated_at")
          .eq("user_id", user.id)
          .single();

        if (!error && data) {
          let currentDisplayName = data.display_name;
          let currentLeaveDuration = data.leave_duration;

          const parsed = parseLeaveDuration(data.leave_duration, data.updated_at);
          // If expired or missing duration, automatically remove from DB and state
          if ((parsed.isExpired || (data.display_name && !data.leave_duration)) && (data.display_name || data.leave_duration)) {
            await supabase
              .from("profiles")
              .update({
                display_name: null,
                leave_duration: null,
                updated_at: new Date().toISOString()
              })
              .eq("user_id", user.id);

            currentDisplayName = null;
            currentLeaveDuration = null;
          }

          // If background periodic check and user is currently typing/selecting, don't overwrite form
          if (isPeriodic && isEditingRef.current) {
            return;
          }

          setUserProfile({
            ...data,
            display_name: currentDisplayName || undefined,
            leave_duration: currentLeaveDuration || undefined,
            avatar_url: avatar_url || undefined,
          });
        } else {
          console.error("Error fetching user profile:", error);
        }
      } catch (err) {
        console.error("Failed to fetch profile:", err);
      }
    }

    fetchUserProfile();

    // Re-check periodically so expired leave status auto-clears
    const interval = setInterval(() => {
      fetchUserProfile(true);
    }, 10000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Fetch bank details for the logged-in user
  useEffect(() => {
    async function fetchBankDetails() {
      if (!user?.email) return;
      const { data, error } = await supabase
        .from("bank_details")
        .select("*")
        .eq("email", user.email)
        .single();
      if (!error && data) {
        setBankDetails(data);
      }
    }
    fetchBankDetails();
  }, [user?.email]);

  // Check if bank document is valid
  useEffect(() => {
    if (!bankDetails?.document_url) {
      setIsDocumentValid(false);
      return;
    }

    setIsDocumentValid(null);
    fetch(bankDetails.document_url, { method: "HEAD" })
      .then((res) => {
        setIsDocumentValid(res.ok);
      })
      .catch(() => {
        setIsDocumentValid(false);
      });
  }, [bankDetails?.document_url]);

  // Load the user's saved signature if it exists
  useEffect(() => {
    // Fetch user's saved signature if it exists
    async function fetchUserSignature() {
      if (!user?.id) return;

      try {
        setLoadingSignature(true);

        const { url, error } = await getUserSignatureUrl(user.id);

        if (error) {
          console.error("Error fetching signature:", error);
          return;
        }

        if (url) {
          setSavedUserSignature(url);

          // If no current expense signature is set, use the saved one
          if (!formData.expense_signature_data_url) {
            setExpenseSignature(url);
            setFormData((prev) => ({
              ...prev,
              expense_signature_data_url: url,
              expense_signature_preview: url,
            }));
          }
        } else {
        }
      } catch (error) {
        console.error("Error in fetchUserSignature:", error);
      } finally {
        setLoadingSignature(false);
      }
    }

    fetchUserSignature();
  }, [user?.id]);

  // Fetch the user's paid advances (Advance Details table)
  useEffect(() => {
    async function fetchAdvances() {
      if (!user?.id || !organization?.id) return;
      setLoadingAdvances(true);
      try {
        const { data, error } = await supabase
          .from("expense_new")
          .select("id, unique_id, expense_type, amount, approved_amount, paid_approval_time, custom_fields")
          .eq("org_id", organization.id)
          .eq("user_id", user.id)
          .eq("payment_status", "paid")
          .ilike("expense_type", "advance")
          .order("paid_approval_time", { ascending: false });
        if (error) throw error;
        const rows = (data || [])
          .filter((r: any) => r.custom_fields?.marked_as_advance === true)
          .map((r: any) => {
            const rem = r.custom_fields?.advance_remaining_amount;
            const hasRem = rem !== null && rem !== undefined && rem !== "";
            return {
              id: r.id as string,
              uniqueId: String(r.unique_id || "").trim() || "—",
              paidAt: (r.paid_approval_time ?? null) as string | null,
              amount: Number(r.approved_amount ?? r.amount ?? 0) || 0,
              remaining: hasRem ? Number(rem) || 0 : null,
              reviewed: r.custom_fields?.advance_return_reviewed === true,
              hasReturns:
                Array.isArray(r.custom_fields?.advance_returns) &&
                r.custom_fields.advance_returns.length > 0,
              returns: [] as AdvanceReturn[],
            };
          });
        // Signed proof links for advances that have returns
        await Promise.all(
          rows
            .filter((r) => r.hasReturns)
            .map(async (r) => {
              try {
                const res = await fetch(`/api/expenses/advance-return?advanceId=${r.id}`);
                if (res.ok) r.returns = (await res.json()).returns || [];
              } catch {
                /* proofs just won't show */
              }
            })
        );
        setAdvances(rows);
      } catch (err) {
        console.error("Failed to fetch advances:", err);
      } finally {
        setLoadingAdvances(false);
      }
    }
    fetchAdvances();
  }, [user?.id, organization?.id, advanceRefresh]);

  const closeReturn = () => {
    if (submittingReturn) return;
    setReturnTarget(null);
    setReturnAmount("");
    setReturnProof(null);
  };

  const submitReturn = async () => {
    if (!returnTarget || returnTarget.remaining === null) return;
    const amt = Number(returnAmount);
    if (!(amt > 0)) {
      toast.error("Enter a valid return amount");
      return;
    }
    if (amt > returnTarget.remaining + 0.001) {
      toast.error(`Amount cannot exceed remaining ${formatMoney(returnTarget.remaining)}`);
      return;
    }
    const isEdit = returnTarget.editIndex !== null;
    if (!isEdit && !returnProof) {
      toast.error("Please upload a proof");
      return;
    }
    setSubmittingReturn(true);
    try {
      const fd = new FormData();
      fd.append("advanceId", returnTarget.id);
      fd.append("amount", String(amt));
      if (returnProof) fd.append("proof", returnProof);
      if (isEdit) fd.append("index", String(returnTarget.editIndex));
      const res = await fetch("/api/expenses/advance-return", {
        method: isEdit ? "PATCH" : "POST",
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Failed to save return");
      toast.success(isEdit ? "Return updated successfully" : "Remaining amount returned successfully");
      setSubmittingReturn(false);
      setReturnTarget(null);
      setReturnAmount("");
      setReturnProof(null);
      setAdvanceRefresh((n) => n + 1);
    } catch (err: any) {
      toast.error(err?.message || "Failed to return advance");
      setSubmittingReturn(false);
    }
  };

  const formatMoney = (n: number) =>
    `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatTime = (t: string | null) =>
    t
      ? new Date(t).toLocaleString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Asia/Kolkata",
        })
      : "—";

  // Handle expense signature save - separate from voucher signature
  const handleExpenseSignatureSave = async (dataUrl: string) => {
    // Update local state
    setExpenseSignature(dataUrl);
    setFormData((prev) => ({
      ...prev,
      expense_signature_data_url: dataUrl,
      expense_signature_preview: dataUrl,
    }));

    // Only save to profile if this is a new signature (not the saved one)
    if (dataUrl !== savedUserSignature && user?.id && organization?.id) {
      try {
        // Use the comprehensive function that handles both upload and profile update
        const { success, path, error } = await saveUserSignature(
          dataUrl,
          user.id,
          organization.id
        );

        if (error || !success) {
          console.error("Error saving signature:", error);
          toast.error("Could not save your signature for future use");
          return;
        }

        toast.success("Your signature has been saved for future use");

        // Refresh the saved signature URL
        const { url } = await getUserSignatureUrl(user.id);
        if (url) {
          setSavedUserSignature(url);
        }
      } catch (error) {
        console.error("Unexpected error saving signature:", error);
        toast.error("An error occurred while saving your signature");
      }
    }
  };

  const handleProfilePhotoChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    setUploadingPhoto(true);
    try {
      // 1. Upload to storage bucket
      const { path, error: uploadError } = await uploadToProfilePhotos(
        supabase,
        file,
        user.id
      );

      if (uploadError || !path) {
        throw uploadError || new Error("Upload failed");
      }

      // 2. Update profile table
      const { error: updateError } = await updateProfileAvatarUrl(
        user.id,
        path
      );

      if (updateError) {
        console.error(
          "Profile update failed (but file uploaded):",
          updateError
        );
        toast.error("Profile update failed");
        // Continue to update UI since upload succeeded
      }

      // 3. Get public URL for display with cache busting
      const url = await getProfileAvatarUrl(user.id);
      if (!url) throw new Error("Failed to get public URL");

      // Add cache busting parameter
      const cacheBustedUrl = `${url}?t=${Date.now()}`;

      // Update both formData and userProfile state
      setFormData((prev) => ({
        ...prev,
        profile_photo_url: cacheBustedUrl,
      }));

      // Also update userProfile state to ensure the photo shows immediately
      setUserProfile((prev) =>
        prev
          ? {
            ...prev,
            avatar_url: cacheBustedUrl,
          }
          : null
      );

      toast.success("Profile photo updated");

      // Clear the file input to allow re-uploading the same file
      e.target.value = "";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast.error(message);
      console.error("Profile photo error:", err);
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <div className="max-w-[1320px] mx-auto space-y-6">
      <PageHeader
        title="My Profile"
        description="View personal and bank information"
      />

      {/* Personal Information */}
      <div className="bg-card border rounded-xl shadow-sm p-4 sm:p-6 lg:p-8 flex flex-col xl:flex-row gap-6 xl:gap-8">
        <div className="flex flex-col items-center w-full xl:w-[340px] xl:shrink-0 bg-muted/50 rounded-xl border p-6 sm:p-8">
          <div className="w-[180px] h-[180px] rounded bg-white flex items-center justify-center mb-4 border border-[#e5e7eb] overflow-hidden">
            {formData.profile_photo_url ? (
              <img
                key={formData.profile_photo_url}
                src={formData.profile_photo_url}
                alt="Profile"
                className="w-full h-full object-fit rounded"
              />
            ) : userProfile?.avatar_url ? (
              <img
                key={userProfile.avatar_url}
                src={userProfile.avatar_url}
                alt="Profile Photo"
                className="w-full h-full object-fit rounded"
              />
            ) : (
              <User className="w-[100px] h-[100px] text-slate-300" />
            )}
          </div>
          <span className="text-lg font-semibold text-[#111827] mb-1">
            Profile Photo
          </span>
          <span className="text-[15px] text-[#64748b] mb-4 text-center">
            Add a photo to complete your profile
          </span>
          <label htmlFor="profilePhotoInput" className="w-full max-w-xs block">
            <input
              type="file"
              id="profilePhotoInput"
              accept="image/*"
              className="peer sr-only"
              onChange={handleProfilePhotoChange}
              disabled={uploadingPhoto}
            />
            <div
              className={`w-full h-12 rounded-lg border border-[#e5e7eb] bg-white text-[#111827] font-semibold flex items-center justify-center gap-2 text-base transition hover:bg-[#f1f5f9] cursor-pointer peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 ${uploadingPhoto ? "opacity-50 cursor-not-allowed" : ""
                }`}
            >
              {uploadingPhoto ? (
                <>
                  <Spinner size="sm" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5 text-[#64748b]" />
                  Upload Photo
                </>
              )}
            </div>
          </label>
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-3 justify-start">
          <div className="flex items-center gap-2 mb-2">
            {/* <User className="w-6 h-6 text-[#111827]" /> */}
            <h2 className="card-title">
              Personal Information
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-base font-semibold mb-2 text-[#111827]">
                Full Name
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2">
                  <User className="w-5 h-5 text-slate-400" />
                </span>
                <input
                  className={`w-full h-12 rounded-lg border border-[#e5e7eb] pl-12 pr-3 text-base text-[#111827] bg-white placeholder-[#94a3b8]
                                        ${bankDetails?.full_name
                      ? "text-[#111827]"
                      : "text-slate-600"
                    }`}
                  placeholder="Enter your full name"
                  value={userProfile?.full_name || "Full name not available"}
                  readOnly
                />
              </div>
            </div>
            <div>
              <label className="block text-base font-semibold mb-2 text-[#111827]">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2">
                  <Mail className="w-5 h-5 text-slate-400" />
                </span>
                <input
                  className={`w-full h-12 rounded-lg border border-[#e5e7eb] pl-12 pr-3 text-base text-[#111827] bg-white placeholder-[#94a3b8]
                                        ${bankDetails?.email
                      ? "text-[#111827]"
                      : "text-slate-600"
                    }`}
                  placeholder="Enter your email"
                  value={userProfile?.email || "Email not available"}
                  readOnly
                />
              </div>
            </div>
            <div>
              <label htmlFor="profile-display-name" className="block text-base font-semibold mb-2 text-[#111827]">
                Display Name
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2">
                  <User className="w-5 h-5 text-slate-400" />
                </span>
                <input
                  id="profile-display-name"
                  className="w-full h-12 rounded-lg border border-[#e5e7eb] pl-12 pr-3 text-base text-[#111827] bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g. OOO"
                  value={userProfile?.display_name || ""}
                  maxLength={3}
                  onChange={(e) => {
                    isEditingRef.current = true;
                    const val = e.target.value.toUpperCase();
                    if (val.length > 3) return;
                    if (/^[O]*$/.test(val)) {
                      setUserProfile((prev) =>
                        prev ? { ...prev, display_name: val } : null
                      );
                    } else {
                      toast.warning("Only 'OOO' characters are allowed", {
                        id: "display-name-error",
                        style: {
                          backgroundColor: "#f9f6eaff", // amber-100
                          borderColor: "#F59E0B",     // amber-500
                          color: "#92400E"            // amber-900
                        }
                      });
                    }
                  }}
                />
              </div>
              <p className="text-sm text-muted-foreground mt-2">When on leave, please set your status to OOO (Out of Office)</p>
            </div>
            <div>
              <label className="block text-base font-semibold mb-2 text-[#111827]">
                Duration
              </label>
              <StatusDurationSelector
                value={userProfile?.leave_duration || ""}
                onChange={(duration) => {
                  isEditingRef.current = true;
                  setUserProfile((prev) =>
                    prev ? { ...prev, leave_duration: duration } : null
                  );
                }}
              />
              <p className="text-sm text-muted-foreground mt-2">Specify how long you will be on leave</p>
            </div>
            <div>
              <label className="block text-base font-semibold mb-2 text-[#111827]">
                Unique ID
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2">
                  <BadgeCheck className="w-5 h-5 text-slate-400" />
                </span>
                <input
                  className={`w-full h-12 rounded-lg border border-[#e5e7eb] pl-12 pr-3 text-base text-[#111827] bg-white placeholder-[#94a3b8]
                                        ${bankDetails?.unique_id
                      ? "text-[#111827]"
                      : "text-slate-600"
                    }`}
                  placeholder="Enter your unique ID"
                  value={bankDetails?.unique_id || "Unique ID not available"}
                  readOnly
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-2">
            <Button
              disabled={savingProfile}
              onClick={async () => {
                if (!user?.id) return;

                if (userProfile?.display_name && userProfile.display_name !== "OOO") {
                  toast.error("Display name must be 'OOO'", {
                    style: {
                      backgroundColor: "#fef2f2",
                      borderColor: "#ef4444",
                      color: "#991b1b"
                    }
                  });
                  return;
                }

                if (userProfile?.display_name === "OOO" && !userProfile?.leave_duration) {
                  toast.error("Please select a duration for OOO status", {
                    style: {
                      backgroundColor: "#fef2f2",
                      borderColor: "#ef4444",
                      color: "#991b1b"
                    }
                  });
                  return;
                }

                setSavingProfile(true);
                try {
                  const updatePayload = {
                    display_name: userProfile?.display_name || null,
                    leave_duration: userProfile?.display_name ? (userProfile?.leave_duration || null) : null,
                    updated_at: new Date().toISOString(),
                  };

                  let error = null;
                  if (userProfile?.id) {
                    const res = await supabase
                      .from("profiles")
                      .update(updatePayload)
                      .eq("id", userProfile.id);
                    error = res.error;
                  }

                  if (!userProfile?.id || error) {
                    const res = await supabase
                      .from("profiles")
                      .update(updatePayload)
                      .eq("user_id", user.id);
                    error = res.error;
                  }

                  if (error) {
                    console.error("Error updating profile display name:", error);
                    toast.error("Failed to update display name: " + error.message);
                  } else {
                    isEditingRef.current = false;
                    toast.success("Display name and duration updated successfully", {
                      style: {
                        backgroundColor: "#f3f8f6ff",
                        borderColor: "#10B981",
                        color: "#047857"
                      }
                    });
                  }
                } catch (err: any) {
                  console.error("Save error:", err);
                  toast.error("An error occurred while saving: " + err.message);
                } finally {
                  setSavingProfile(false);
                }
              }}
            >
              {savingProfile ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </div>

      {/* Bank Information */}
      <div className="bg-card border rounded-xl shadow-sm p-4 sm:p-6 lg:p-8">
        <div className="flex items-center gap-2 mb-6">
          {/* <Landmark className="w-6 h-6 text-[#111827]" /> */}
          <h2 className="card-title">
            Bank Information
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-base font-semibold mb-2 text-[#111827]">
              Account Holder Name
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2">
                <User className="w-5 h-5 text-slate-400" />
              </span>
              <input
                className={`w-full h-12 rounded-lg border border-[#e5e7eb] pl-12 pr-3 text-base text-[#111827] bg-white placeholder-[#94a3b8]
                                    ${bankDetails?.account_holder
                    ? "text-[#111827]"
                    : "text-slate-600"
                  }`}
                placeholder="Enter account holder name"
                value={
                  bankDetails?.account_holder ||
                  "Account holder name not available"
                }
                readOnly
              />
            </div>
          </div>
          <div>
            <label className="block text-base font-semibold mb-2 text-[#111827]">
              Bank Name
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2">
                <Landmark className="w-5 h-5 text-slate-400" />
              </span>
              <input
                className={`w-full h-12 rounded-lg border border-[#e5e7eb] pl-12 pr-3 text-base text-[#111827] bg-white placeholder-[#94a3b8]
                                    ${bankDetails?.bank_name
                    ? "text-[#111827]"
                    : "text-slate-600"
                  }`}
                placeholder="Enter bank name"
                value={bankDetails?.bank_name || "Bank name not available"}
                readOnly
              />
            </div>
          </div>
          <div>
            <label className="block text-base font-semibold mb-2 text-[#111827]">
              Account Number
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2">
                <CreditCard className="w-5 h-5 text-slate-400" />
              </span>
              <input
                className={`w-full h-12 rounded-lg border border-[#e5e7eb] pl-12 pr-3 text-base text-[#111827] bg-white placeholder-[#94a3b8]
                                    ${bankDetails?.account_number
                    ? "text-[#111827]"
                    : "text-slate-600"
                  }`}
                placeholder="Enter account number"
                value={
                  bankDetails?.account_number || "Account number not available"
                }
                readOnly
              />
            </div>
          </div>
          <div>
            <label className="block text-base font-semibold mb-2 text-[#111827]">
              IFSC Code
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2">
                <LockKeyhole className="w-5 h-5 text-slate-400" />
              </span>
              <input
                className={`w-full h-12 rounded-lg border border-[#e5e7eb] pl-12 pr-3 text-base bg-white placeholder-[#94a3b8] 
                                    ${bankDetails?.ifsc_code
                    ? "text-[#111827]"
                    : "text-slate-600"
                  }`}
                placeholder="Enter IFSC code"
                value={bankDetails?.ifsc_code || "IFSC code not available"}
                readOnly
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bank Document Preview */}
      <div className="border-[#e5e7eb]">
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="border-b px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-5 w-5 text-blue-600" />
                <div>
                  <h2 className="card-title">
                    Bank Document
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Opens by default for quick review
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <TooltipProvider delayDuration={150}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() => bankDetails?.document_url && window.open(bankDetails.document_url, "_blank")}
                        aria-label="Open document in new tab"
                        disabled={!isDocumentValid}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>Open in new tab</p>
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="icon"
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() => setIsDocumentPaneOpen((prev) => !prev)}
                        aria-label={
                          isDocumentPaneOpen
                            ? "Hide document preview"
                            : "Show document preview"
                        }
                      >
                        {isDocumentPaneOpen ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>
                        {isDocumentPaneOpen
                          ? "Hide document preview"
                          : "Show document preview"}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>

          {isDocumentPaneOpen && (
            <div className="p-4 sm:p-6">
              {isDocumentValid === null ? (
                <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
                  <Spinner size="md" className="mb-2" />
                  <p className="mt-2 text-sm">Checking document...</p>
                </div>
              ) : isDocumentValid && bankDetails?.document_url ? (
                bankDetails.document_url.match(/\.(jpeg|jpg|gif|png)$/i) ? (
                  <div
                    className="overflow-y-auto rounded-md border bg-muted"
                    style={{ height: "auto" }}
                  >
                    <img
                      src={bankDetails.document_url}
                      alt="Bank Document"
                      className="w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="h-[68vh] min-h-[360px] sm:h-[500px] rounded-md border bg-white overflow-hidden">
                    <iframe
                      src={`${bankDetails.document_url}#toolbar=0&navpanes=0&scrollbar=1&view=FitH&zoom=page-width`}
                      className="h-full w-full border-none"
                      title="Bank Document"
                    />
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground bg-muted/50 rounded-lg border border-dashed">
                  <FileText className="w-10 h-10 mb-2 text-muted-foreground" />
                  <p className="font-medium text-muted-foreground">Bank Document not available</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Signature */}
      <div className="p-4 sm:p-6 bg-card rounded-xl border shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <Signature className="h-5 w-5 text-muted-foreground" />
          <h2 className="card-title">
            User Signature <span className="text-red-500">*</span>
          </h2>
        </div>

        {loadingSignature ? (
          <div className="flex items-center justify-center h-32 bg-muted/50 border rounded-lg">
            <p className="text-sm text-muted-foreground">Loading your signature...</p>
          </div>
        ) : (
          <SignaturePad
            onSave={handleExpenseSignatureSave}
            label="Your Signature"
            signatureUrl={formData.expense_signature_preview}
            userSignatureUrl={savedUserSignature || undefined}
          />
        )}

        {savedUserSignature &&
          formData.expense_signature_preview !== savedUserSignature && (
            <p className="text-xs text-blue-600">
              * You're using a new signature. This will replace your saved
              signature when you submit.
            </p>
          )}
      </div>

      {/* Advance Details */}
      <div className="p-4 sm:p-6 bg-card rounded-xl border shadow-sm space-y-4">
        <h2 className="card-title">Advance Details</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-3 font-semibold">Advance ID</th>
                <th className="px-4 py-3 font-semibold">Paid Approval Time</th>
                <th className="px-4 py-3 font-semibold text-right">Advance Amount</th>
                <th className="px-4 py-3 font-semibold text-right">Remaining Amount</th>
                <th className="px-4 py-3 font-semibold">Returned / Proof</th>
                <th className="px-4 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loadingAdvances ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    Loading advance details...
                  </td>
                </tr>
              ) : advances.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    No advance details available
                  </td>
                </tr>
              ) : (
                advances.map((a) => (
                  <tr key={a.id} className="border-t">
                    <td className="px-4 py-3">{a.uniqueId}</td>
                    <td className="px-4 py-3">{formatTime(a.paidAt)}</td>
                    <td className="px-4 py-3 text-right">{formatMoney(a.amount)}</td>
                    <td className="px-4 py-3 text-right">
                      {a.remaining !== null ? formatMoney(a.remaining) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {a.returns.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <ul className="space-y-1">
                          {a.returns.map((r, i) => (
                            <li key={i} className="flex flex-wrap items-center gap-x-2">
                              <span className="font-medium">{formatMoney(r.amount)}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatTime(r.returnedAt)}
                              </span>
                              {r.proofUrl ? (
                                <a
                                  href={r.proofUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                                >
                                  <ExternalLink className="h-3 w-3" />
                                  View proof
                                </a>
                              ) : (
                                <span className="text-xs text-muted-foreground">Proof unavailable</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex flex-col items-end gap-1">
                        {a.remaining !== null && a.remaining > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReturnTarget({
                                id: a.id,
                                uniqueId: a.uniqueId,
                                remaining: a.remaining,
                                editIndex: null,
                              });
                              setReturnAmount(String(a.remaining));
                              setReturnProof(null);
                            }}
                          >
                            Return Remaining
                          </Button>
                        )}
                        {a.reviewed && a.returns.length > 0 && (
                          <span className="text-xs font-medium text-green-600">Reviewed</span>
                        )}
                        {!a.reviewed && a.returns.map((r, i) => (
                          <Button
                            key={i}
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReturnTarget({
                                id: a.id,
                                uniqueId: a.uniqueId,
                                remaining: (a.remaining ?? 0) + r.amount,
                                editIndex: i,
                              });
                              setReturnAmount(String(r.amount));
                              setReturnProof(null);
                            }}
                          >
                            Edit{a.returns.length > 1 ? ` #${i + 1}` : ""}
                          </Button>
                        ))}
                        {!(a.remaining !== null && a.remaining > 0) && a.returns.length === 0 && !a.reviewed && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Return remaining advance modal */}
      {returnTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeReturn}
        >
          <div
            className="w-full max-w-md rounded-xl bg-card border shadow-lg p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-lg font-semibold">
                {returnTarget.editIndex !== null ? "Edit Returned Amount" : "Return Remaining Advance"}
              </h3>
              <p className="text-sm text-muted-foreground">
                Advance {returnTarget.uniqueId} ·{" "}
                {returnTarget.editIndex !== null ? "Max" : "Remaining"}{" "}
                {formatMoney(returnTarget.remaining ?? 0)}
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Return Amount (₹)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                max={returnTarget.remaining ?? undefined}
                value={returnAmount}
                onChange={(e) => setReturnAmount(e.target.value)}
                className="w-full h-10 rounded-lg border px-3 bg-white text-[#111827]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">
                Proof (image or PDF){" "}
                {returnTarget.editIndex !== null ? (
                  <span className="text-xs font-normal text-muted-foreground">
                    (optional – leave empty to keep current proof)
                  </span>
                ) : (
                  <span className="text-red-500">*</span>
                )}
              </label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setReturnProof(e.target.files?.[0] || null)}
                className="w-full text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeReturn} disabled={submittingReturn}>
                Cancel
              </Button>
              <Button onClick={submitReturn} disabled={submittingReturn}>
                {submittingReturn ? "Submitting..." : "Submit"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
