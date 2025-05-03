import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Upload, Info } from "lucide-react";
import { toast } from "sonner";
import { SignaturePad } from "@/components/ui/signature-pad";

type Role = "admin" | "member" | "owner";

interface VoucherFormProps {
  formData: Record<string, any>;
  onInputChange: (key: string, value: any) => void;
  userRole: Role | null;
  isApprover?: boolean;
  disabled?: boolean;
}

export default function VoucherForm({
  formData,
  onInputChange,
  userRole,
  isApprover = false,
  disabled = false,
}: VoucherFormProps) {
  const canSignAsMember =
    userRole === "member" || userRole === "admin" || userRole === "owner";
  const canSignAsManager =
    userRole === "admin" || userRole === "owner" || isApprover;

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
              disabled={disabled}
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
              disabled={disabled}
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
                disabled={disabled}
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
              disabled={disabled}
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
            disabled={disabled}
          />
          <p className="text-sm text-gray-500">
            This should be the person to whom the payment is being made
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <SignaturePad
              label="Approver's Signature"
              onSave={(signature) =>
                onInputChange("manager_signature_url", signature)
              }
              disabled={
                disabled ||
                !(userRole === "admin" || userRole === "owner" || isApprover)
              }
              defaultValue={formData.manager_signature_url}
            />
          </div>

          <div className="space-y-2">
            <SignaturePad
              label="Your Signature"
              onSave={(signature) => onInputChange("signature_url", signature)}
              disabled={disabled}
              defaultValue={formData.signature_url}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
