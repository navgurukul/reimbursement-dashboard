"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Info, Edit3, Check } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import SignaturePad from "@/components/SignatureCanvas";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useOrgStore } from "@/store/useOrgStore";
import { organizations, profiles } from "@/lib/db";
import { useAuthStore } from "@/store/useAuthStore";
import { toast } from "sonner";
import { getUserSignatureUrl, saveUserSignature } from "@/lib/utils";
import supabase from "@/lib/supabase";

type Role = "admin" | "member" | "owner" | "manager" | null;

interface VoucherFormProps {
  formData: Record<string, any>;
  onInputChange: (key: string, value: any) => void;
  userRole: Role;
  savedUserSignature: string | null;
  selectedEvent?: { start_date: string; end_date: string };
  errors?: Record<string, string>;
}

export default function VoucherForm({
  formData,
  onInputChange,
  userRole,
  errors,
  savedUserSignature,
  selectedEvent,
}: VoucherFormProps) {
  const getError = (field: string) => errors?.[field] || "";

  // Track voucher signature separately from expense signature
  const [voucherSignature, setVoucherSignature] = useState<string | undefined>(
    formData.voucher_signature_data_url || undefined
  );

  const [loadingSignature, setLoadingSignature] = useState(false);

  const { organization } = useOrgStore();
  const { user, profile, isLoading: authLoading } = useAuthStore();

  const [isEditingName, setIsEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  // inside VoucherForm
  useEffect(() => {
    if (!formData.date) {
      const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
      onInputChange("date", today);
    }
  }, [formData.date, onInputChange]);

  // Prefill Your Name from profile or user when not provided
  useEffect(() => {
    if (!formData.yourName) {
      const prefName = (profile && (profile.full_name as string)) || user?.email || "";
      if (prefName) onInputChange("yourName", prefName);
    }
  }, [formData.yourName, profile, user, onInputChange]);

  // Use the saved signature if no voucher signature is set
  useEffect(() => {
    if (savedUserSignature && !formData.voucher_signature_data_url) {
      setVoucherSignature(savedUserSignature);
      onInputChange("voucher_signature_data_url", savedUserSignature);
      onInputChange("voucher_signature_preview", savedUserSignature);
    }
  }, [savedUserSignature, formData.voucher_signature_data_url, onInputChange]);

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
            <div className="relative">
              <Input
                id="yourName"
                name="yourName"
                value={formData.yourName || ""}
                onChange={(e) => onInputChange("yourName", e.target.value)}
                aria-invalid={getError("yourName") ? "true" : "false"}
                aria-describedby={getError("yourName") ? "yourName-error" : undefined}
                className={`w-full ${getError("yourName") ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""} ${!isEditingName ? "bg-gray-50" : ""}`}
                readOnly={!isEditingName}
                ref={nameInputRef}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={isEditingName ? "Save name" : "Edit name"}
                    onClick={() => {
                      if (!isEditingName) {
                        setIsEditingName(true);
                        setTimeout(() => nameInputRef.current?.focus(), 50);
                      } else {
                        setIsEditingName(false);
                        onInputChange("yourName", (formData.yourName || "").trim());
                      }
                    }}
                    className="absolute right-2 top-2 p-1 rounded text-gray-500 hover:bg-gray-100 z-10 bg-white"
                  >
                    {isEditingName ? <Check className="h-4 w-4" /> : <Edit3 className="h-4 w-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent sideOffset={6}>{isEditingName ? "Save" : "Edit Name"}</TooltipContent>
              </Tooltip>
            </div>
            {getError("yourName") && (
              <p id="yourName-error" className="text-red-500 text-sm mt-1" role="alert">
                {getError("yourName")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="date" className="text-sm font-medium">
              Date Of Expense <span className="text-red-500">*</span>
            </Label>
            <Input
              id="date"
              name="date"
              type="date"
              value={formData.date || ""}
              onChange={(e) => onInputChange("date", e.target.value)}
              min={selectedEvent ? selectedEvent.start_date.split("T")[0] : undefined}
              max={selectedEvent ? selectedEvent.end_date.split("T")[0] : undefined}
              aria-invalid={getError("date") ? "true" : "false"}
              aria-describedby={getError("date") ? "date-error" : undefined}
              className={getError("date") ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}
              required
            />
            {getError("date") && (
              <p id="date-error" className="text-red-500 text-sm mt-1" role="alert">
                {getError("date")}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="voucherAmount" className="text-sm font-medium">
              Amount <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5">₹</span>
              <Input
                id="voucherAmount"
                name="voucherAmount"
                type="number"
                value={formData.voucherAmount || ""}
                onChange={(e) => onInputChange("voucherAmount", parseFloat(e.target.value))}
                aria-invalid={getError("voucherAmount") ? "true" : "false"}
                aria-describedby={getError("voucherAmount") ? "voucherAmount-error" : undefined}
                className={`w-full pl-7 ${getError("voucherAmount") ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}`}
              />
              {getError("voucherAmount") && (
                <p id="voucherAmount-error" className="text-red-500 text-sm mt-1" role="alert">
                  {getError("voucherAmount")}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="purpose" className="text-sm font-medium">
              Purpose <span className="text-red-500">*</span>
            </Label>
            <Input
              id="purpose"
              name="purpose"
              value={formData.purpose || ""}
              onChange={(e) => onInputChange("purpose", e.target.value)}
              aria-invalid={getError("purpose") ? "true" : "false"}
              aria-describedby={getError("purpose") ? "purpose-error" : undefined}
              className={`w-full ${getError("purpose") ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}`}
            />
            {getError("purpose") && (
              <p id="purpose-error" className="text-red-500 text-sm mt-1" role="alert">
                {getError("purpose")}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="voucherCreditPerson" className="text-sm font-medium">
            Voucher Credit Person <span className="text-red-500">*</span>
          </Label>
          <Input
            id="voucherCreditPerson"
            name="voucherCreditPerson"
            value={formData.voucherCreditPerson || ""}
            onChange={(e) => onInputChange("voucherCreditPerson", e.target.value)}
            aria-invalid={getError("voucherCreditPerson") ? "true" : "false"}
            aria-describedby={getError("voucherCreditPerson") ? "voucherCreditPerson-error" : undefined}
            className={`w-full ${getError("voucherCreditPerson") ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}`}
          />
          {getError("voucherCreditPerson") && (
            <p id="voucherCreditPerson-error" className="text-red-500 text-sm mt-1" role="alert">
              {getError("voucherCreditPerson")}
            </p>
          )}
          <p className="text-sm text-gray-500">
            credit person name description should beName of the person or vendor who will receive the payment from NavGurukul.
          </p>
        </div>

        {/* Payment Screenshot Upload */}
        <div className="mt-4">
          <Label htmlFor="attachment" className="text-sm font-medium">
            Attachment (Optional)
          </Label>
          <Input
            id="attachment"
            name="attachment"
            type="file"
            accept="image/*,application/pdf"
            onChange={(e) => onInputChange("attachment", e.target.files?.[0] || null)}
          />
          <p className="text-sm text-gray-500">
            Upload proof of payment (JPG, PNG, or PDF)
          </p>
          {formData.attachment && (
            <p className="text-xs text-gray-500 mt-1">
              Selected: {formData.attachment.name}
            </p>
          )}
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
                <p className="text-red-500 text-sm mt-1" role="alert">
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