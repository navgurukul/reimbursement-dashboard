"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";
import { useState, useEffect } from "react";
import SignaturePad from "@/components/SignatureCanvas";
import { useOrgStore } from "@/store/useOrgStore";
import { organizations, profiles } from "@/lib/db";
import { useAuthStore } from "@/store/useAuthStore";
import { toast } from "sonner";
import { getUserSignatureUrl, saveUserSignature } from "@/lib/utils";
import supabase from "@/lib/supabase";

type Role = "admin" | "member" | "owner" | null;

interface VoucherFormProps {
  formData: Record<string, any>;
  onInputChange: (key: string, value: any) => void;
  userRole: Role;
  savedUserSignature: string | null;
  errors?: Record<string, string>;
}

export default function VoucherForm({
  formData,
  onInputChange,
  userRole,
  errors,
  savedUserSignature,
}: VoucherFormProps) {
  const getError = (field: string) => errors?.[field] || "";

  // Track voucher signature separately from expense signature
  const [voucherSignature, setVoucherSignature] = useState<string | undefined>(
    formData.voucher_signature_data_url || undefined
  );

  const [loadingSignature, setLoadingSignature] = useState(false);

  const { organization } = useOrgStore();
  const { user } = useAuthStore();

  // Use the saved signature if no voucher signature is set
  useEffect(() => {
    if (savedUserSignature && !formData.voucher_signature_data_url) {
      setVoucherSignature(savedUserSignature);
      onInputChange("voucher_signature_data_url", savedUserSignature);
      onInputChange("voucher_signature_preview", savedUserSignature);
    }
  }, [savedUserSignature, formData.voucher_signature_data_url, onInputChange]);

  // Handle voucher signature save independently from expense signature
  // Handle voucher signature save independently from expense signature
  const handleVoucherSignatureSave = async (dataUrl: string) => {
    if (!dataUrl) {
      console.error("Empty signature data URL in voucher form");
      return;
    }

    // Verify it's a proper data URL
    if (!dataUrl.startsWith("data:image/")) {
      console.error("Invalid signature format in voucher form");
      toast.error("Invalid signature format. Please try again.");
      return;
    }

    // Update local state and form data with the new signature
    setVoucherSignature(dataUrl);
    onInputChange("voucher_signature_data_url", dataUrl);
    onInputChange("voucher_signature_preview", dataUrl);

    // Only save to profile if this is a new signature (not the saved one)
    if (dataUrl !== savedUserSignature && user?.id && organization?.id) {
      try {
        console.log("Saving new signature to user profile");

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

        console.log("Signature saved successfully to:", path);
        toast.success("Your signature has been saved for future use");
      } catch (error) {
        console.error("Unexpected error saving signature:", error);
        toast.error("An error occurred while saving your signature");
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 p-4 rounded-lg flex items-start gap-3">
        <Info className="h-5 w-5 text-blue-500 mt-0.5" />
        <p className="text-sm text-blue-700">
          Create a cash voucher when no receipt is available
        </p>
      </div>

      <div className="border border-dashed border-gray-200 rounded-lg p-6">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="yourName" className="text-sm font-medium">
              Your Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="yourName"
              value={formData.yourName || ""}
              onChange={(e) => onInputChange("yourName", e.target.value)}
              className={`w-full ${getError("yourName") ? "border-red-500" : ""}`}
            />
            {getError("yourName") && (
              <p className="text-red-500 text-sm mt-1">{getError("yourName")}</p>
            )}

          </div>

          <div className="space-y-2">
            <Label htmlFor="date" className="text-sm font-medium">
              Date <span className="text-red-500">*</span>
            </Label>
            <Input
              id="date"
              type="date"
              value={formData.date || ""}
              onChange={(e) => onInputChange("date", e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="voucherAmount" className="text-sm font-medium">
              Amount <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5">₹</span>
              <Input
                id="voucherAmount"
                type="number"
                value={formData.voucherAmount || ""}
                onChange={(e) => onInputChange("voucherAmount", parseFloat(e.target.value))}
                className={`w-full pl-7 ${getError("voucherAmount") ? "border-red-500" : ""}`}
              />
              {getError("voucherAmount") && (
                <p className="text-red-500 text-sm mt-1">{getError("voucherAmount")}</p>
              )}

            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="purpose" className="text-sm font-medium">
              Purpose <span className="text-red-500">*</span>
            </Label>
            <Input
              id="purpose"
              value={formData.purpose || ""}
              onChange={(e) => onInputChange("purpose", e.target.value)}
              className={`w-full ${getError("purpose") ? "border-red-500" : ""}`}
            />
            {getError("purpose") && (
              <p className="text-red-500 text-sm mt-1">{getError("purpose")}</p>
            )}

          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="voucherCreditPerson" className="text-sm font-medium">
            Voucher Credit Person <span className="text-red-500">*</span>
          </Label>
          <Input
            id="voucherCreditPerson"
            value={formData.voucherCreditPerson || ""}
            onChange={(e) => onInputChange("voucherCreditPerson", e.target.value)}
            className={`w-full ${getError("voucherCreditPerson") ? "border-red-500" : ""}`}
          />
          {getError("voucherCreditPerson") && (
            <p className="text-red-500 text-sm mt-1">{getError("voucherCreditPerson")}</p>
          )}

          <p className="text-sm text-gray-500">
            This should be the person to whom the payment is being made
          </p>
        </div>

        {/* Voucher signature section */}
        <div className="mt-6">
          {loadingSignature ? (
            <div className="flex items-center justify-center h-32 bg-gray-50 border rounded-lg">
              <p className="text-sm text-gray-500">Loading your signature...</p>
            </div>
          ) : (
            <>
              <SignaturePad
                onSave={handleVoucherSignatureSave}
                label="Your Signature for Voucher"
                signatureUrl={formData.voucher_signature_preview}
                userSignatureUrl={savedUserSignature || undefined}
              />
              {getError("voucher_signature_data_url") && (
                <p className="text-red-500 text-sm mt-1">
                  {getError("voucher_signature_data_url")}
                </p>
              )}
              {savedUserSignature &&
                formData.voucher_signature_preview !== savedUserSignature && (
                  <p className="text-xs text-blue-600 mt-1">
                    * You're using a new signature. This will replace your saved
                    signature when you submit.
                  </p>
                )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
