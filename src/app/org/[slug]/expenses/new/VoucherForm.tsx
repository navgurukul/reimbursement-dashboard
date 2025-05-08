"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Info } from "lucide-react";
import { useState, useEffect } from "react";
import SignaturePad from "@/components/SignatureCanvas";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useOrgStore } from "@/store/useOrgStore";
import { organizations, profiles } from "@/lib/db";
import { toast } from "sonner";

type Role = "admin" | "member" | "owner" | null;

interface VoucherFormProps {
  formData: Record<string, any>;
  onInputChange: (key: string, value: any) => void;
  userRole: Role;
}

export default function VoucherForm({
  formData,
  onInputChange,
  userRole,
}: VoucherFormProps) {
  // Track if signatures are changed
  const [userSignature, setUserSignature] = useState<string | undefined>(
    formData.signature_data_url || undefined
  );
  const [approverSignature, setApproverSignature] = useState<
    string | undefined
  >(formData.manager_signature_data_url || undefined);

  const [approvers, setApprovers] = useState<
    Array<{
      id: string;
      full_name: string;
      role: string;
    }>
  >([]);
  const [loadingApprovers, setLoadingApprovers] = useState(true);

  const { organization } = useOrgStore();

  // Load approvers (admin users) for selection
  useEffect(() => {
    async function loadApprovers() {
      if (!organization?.id) return;

      try {
        setLoadingApprovers(true);
        const { data: members, error } =
          await organizations.getOrganizationMembers(organization.id);

        if (error) throw error;

        // Get only admin and owner roles
        const approversData =
          members?.filter(
            (member) => member.role === "admin" || member.role === "owner"
          ) || [];

        // Get profiles for these users
        if (approversData.length > 0) {
          const userIds = approversData.map((a) => a.user_id);
          const { data: profilesData } = await profiles.getByIds(userIds);

          // Merge the data
          const approversWithProfiles = approversData.map((a) => {
            const profile = profilesData?.find((p) => p.user_id === a.user_id);
            return {
              id: a.user_id,
              full_name: profile?.full_name || "Unknown User",
              role: a.role,
            };
          });

          setApprovers(approversWithProfiles);
        } else {
          setApprovers([]);
        }
      } catch (error: any) {
        console.error("Failed to load approvers:", error);
        toast.error("Could not load approvers");
      } finally {
        setLoadingApprovers(false);
      }
    }

    loadApprovers();
  }, [organization?.id]);

  // Update local state when formData changes externally
  useEffect(() => {
    if (formData.signature_data_url && !userSignature) {
      setUserSignature(formData.signature_data_url);
    }
    if (formData.manager_signature_data_url && !approverSignature) {
      setApproverSignature(formData.manager_signature_data_url);
    }
  }, [formData, userSignature, approverSignature]);

  const handleUserSignatureSave = (dataUrl: string) => {
    setUserSignature(dataUrl);
    // Store the full data URL
    onInputChange("signature_data_url", dataUrl);
    // Also store preview version
    onInputChange("signature_preview", dataUrl);
  };

  const handleApproverSignatureSave = (dataUrl: string) => {
    setApproverSignature(dataUrl);
    // Store the full data URL
    onInputChange("manager_signature_data_url", dataUrl);
    // Also store preview version
    onInputChange("manager_signature_preview", dataUrl);
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
              placeholder="Enter your name"
              value={formData.yourName || ""}
              onChange={(e) => onInputChange("yourName", e.target.value)}
              required
            />
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
              <span className="absolute left-3 top-2.5">$</span>
              <Input
                id="voucherAmount"
                type="number"
                placeholder="0.00"
                className="pl-7"
                value={formData.voucherAmount || ""}
                onChange={(e) =>
                  onInputChange("voucherAmount", parseFloat(e.target.value))
                }
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="purpose" className="text-sm font-medium">
              Purpose <span className="text-red-500">*</span>
            </Label>
            <Input
              id="purpose"
              placeholder="Purpose of the expense"
              value={formData.purpose || ""}
              onChange={(e) => onInputChange("purpose", e.target.value)}
              required
            />
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="voucherCreditPerson" className="text-sm font-medium">
            Voucher Credit Person <span className="text-red-500">*</span>
          </Label>
          <Input
            id="voucherCreditPerson"
            placeholder="Name of person receiving payment"
            value={formData.voucherCreditPerson || ""}
            onChange={(e) =>
              onInputChange("voucherCreditPerson", e.target.value)
            }
            required
          />
          <p className="text-sm text-gray-500">
            This should be the person to whom the payment is being made
          </p>
        </div>

        {/* Approver selection dropdown */}
        <div className="mt-4 space-y-2">
          <Label htmlFor="approver_id" className="text-sm font-medium">
            Approver <span className="text-red-500">*</span>
          </Label>
          <Select
            value={formData.approver_id || ""}
            onValueChange={(value) => {
              console.log("Setting approver_id to:", value);
              onInputChange("approver_id", value);
            }}
            disabled={loadingApprovers || approvers.length === 0}
          >
            <SelectTrigger id="approver_id" className="w-full">
              <SelectValue placeholder="Select an approver" />
            </SelectTrigger>
            <SelectContent>
              {approvers.map((approver) => (
                <SelectItem key={approver.id} value={approver.id}>
                  {approver.full_name} ({approver.role})
                </SelectItem>
              ))}
              {approvers.length === 0 && !loadingApprovers && (
                <SelectItem value="none" disabled>
                  No approvers available
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {loadingApprovers && (
            <p className="text-xs text-gray-500">Loading approvers...</p>
          )}
          {!loadingApprovers && approvers.length === 0 && (
            <p className="text-xs text-amber-500">
              No approvers available. An admin or owner must be assigned as an
              approver.
            </p>
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <SignaturePad
              onSave={handleApproverSignatureSave}
              label="Approver's Signature"
              signatureUrl={formData.manager_signature_preview}
            />
          </div>

          <div className="space-y-2">
            <SignaturePad
              onSave={handleUserSignatureSave}
              label="Your Signature"
              signatureUrl={formData.signature_preview}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
