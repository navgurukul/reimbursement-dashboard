import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Upload, Info } from "lucide-react";
import { toast } from "sonner";

type Role = "admin" | "member" | "owner";

interface VoucherFormProps {
  formData: Record<string, any>;
  onInputChange: (key: string, value: any) => void;
  userRole: Role | null;
}

export default function VoucherForm({
  formData,
  onInputChange,
  userRole,
}: VoucherFormProps) {
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

        <div className="mt-6 grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Approver's Signature</Label>
            <div className="border border-gray-200 rounded-lg p-4 h-32 flex flex-col items-center justify-center bg-gray-50">
              <p className="text-sm text-gray-500">Signature required</p>
              <p className="text-xs text-gray-400">Sandhya</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Your Signature</Label>
            <div className="border border-gray-200 rounded-lg p-4 h-32 flex flex-col items-center justify-center bg-gray-50">
              <p className="text-sm text-gray-500">Signature required</p>
              <p className="text-xs text-gray-400">You</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
