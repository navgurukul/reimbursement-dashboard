"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { createClient } from "@supabase/supabase-js";
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
} from "lucide-react";

import { useRouter, useParams, useSearchParams } from "next/navigation";

import SignaturePad from "@/components/SignatureCanvas";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { useOrgStore } from "@/store/useOrgStore";
import { useAuthStore } from "@/store/useAuthStore";
import {
  getUserSignatureUrl,
  saveUserSignature,
  uploadToProfilePhotos,
  updateProfileAvatarUrl,
  getProfileAvatarUrl,
} from "@/lib/utils";

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
  const [bankDetails, setBankDetails] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<{
    full_name: string;
    email: string;
    avatar_url?: string;
  } | null>(null);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // Fetch profile info from `profiles` table
  useEffect(() => {
    async function fetchUserProfile() {
      if (!user?.id) return;

      try {
        const avatar_url = await getProfileAvatarUrl(user.id);

        const { data, error } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("user_id", user.id)
          .single();

        if (!error && data) {
          setUserProfile({
            ...data,
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
    <div className="max-w-[1320px] mx-auto min-h-screen">
      <Button
        variant="link"
        onClick={() => router.push(`/org/${organization?.slug}`)}
        // className="text-sm"
      >
        <ArrowLeft /> Back to Dashboard
      </Button>
      <h1 className="section-heading my-1 text-center">My Profile</h1>
      <p className="descriptive-text mb-8 text-center text-base">
        View personal and bank information
      </p>

      {/* Personal Information */}
      <div className="bg-white border border-[#e5e7eb] rounded-2xl p-8 mb-8 flex flex-col md:flex-row gap-8 shadow-sm">
        <div className="flex flex-col items-center w-full md:w-[340px] bg-[#f9fafb] rounded-2xl border border-[#e5e7eb] p-8">
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
          <label htmlFor="profilePhotoInput" className="w-full block">
            <input
              type="file"
              id="profilePhotoInput"
              accept="image/*"
              className="hidden"
              onChange={handleProfilePhotoChange}
              disabled={uploadingPhoto}
            />
            <div
              className={`w-full h-12 rounded-lg border border-[#e5e7eb] bg-white text-[#111827] font-semibold flex items-center justify-center gap-2 text-base transition hover:bg-[#f1f5f9] cursor-pointer ${
                uploadingPhoto ? "opacity-50 cursor-not-allowed" : ""
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

        <div className="flex-1 flex flex-col gap-8 justify-center">
          <div className="flex items-center gap-2 mb-2">
            <User className="w-6 h-6 text-[#111827]" />
            <span className="font-bold text-xl text-[#111827]">
              Personal Information
            </span>
          </div>

          <div className="flex flex-col gap-6">
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
                                        ${
                                          bankDetails?.full_name
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
                                        ${
                                          bankDetails?.email
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
              <label className="block text-base font-semibold mb-2 text-[#111827]">
                Unique ID
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2">
                  <BadgeCheck className="w-5 h-5 text-slate-400" />
                </span>
                <input
                  className={`w-full h-12 rounded-lg border border-[#e5e7eb] pl-12 pr-3 text-base text-[#111827] bg-white placeholder-[#94a3b8]
                                        ${
                                          bankDetails?.unique_id
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
        </div>
      </div>

      {/* Bank Information */}
      <div className="bg-white border border-[#e5e7eb] rounded-2xl p-8 mb-8 shadow-sm">
        <div className="flex items-center gap-2 mb-6">
          <Landmark className="w-6 h-6 text-[#111827]" />
          <span className="font-bold text-xl text-[#111827]">
            Bank Information
          </span>
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
                                    ${
                                      bankDetails?.account_holder
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
                                    ${
                                      bankDetails?.bank_name
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
                                    ${
                                      bankDetails?.account_number
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
                                    ${
                                      bankDetails?.ifsc_code
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

      {/* Signature */}
      <div className="p-4 bg-gray-50/50 rounded-lg border space-y-4">
        <div className="flex items-center space-x-3">
          <Signature className="h-5 w-5 text-gray-500" />
          <Label className="text-sm font-medium text-gray-900">
            User Signature <span className="text-red-500">*</span>
          </Label>
        </div>

        {loadingSignature ? (
          <div className="flex items-center justify-center h-32 bg-gray-50 border rounded-lg">
            <p className="text-sm text-gray-500">Loading your signature...</p>
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
    </div>
  );
}
