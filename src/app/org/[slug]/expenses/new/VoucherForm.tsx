"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface VoucherFormProps {
  formData: any;
  onInputChange: (key: string, value: string) => void;
}

export default function VoucherForm({
  formData,
  onInputChange,
}: VoucherFormProps) {
  return (
    <div className="mt-4">
      <div className="bg-blue-50 p-4 rounded-lg mb-4">
        <div className="flex items-center space-x-2">
          <span className="text-blue-600">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M13 16H12V12H11M12 8H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <p className="text-blue-600 text-sm">
            Create a cash voucher when no receipt is available
          </p>
        </div>
      </div>

      <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 space-y-6">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="your-name" className="text-sm font-medium">
              Your Name<span className="text-red-500">*</span>
            </Label>
            <Input
              id="your-name"
              placeholder="Enter your name"
              value={formData.yourName || ""}
              onChange={(e) => onInputChange("yourName", e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="voucher-date" className="text-sm font-medium">
              Date<span className="text-red-500">*</span>
            </Label>
            <Input
              id="voucher-date"
              type="date"
              value={
                formData.voucherDate || new Date().toISOString().split("T")[0]
              }
              onChange={(e) => onInputChange("voucherDate", e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="amount" className="text-sm font-medium">
              Amount<span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <span className="absolute left-3 top-2.5">$</span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                placeholder="0.00"
                className="pl-7"
                value={formData.voucherAmount || ""}
                onChange={(e) => onInputChange("voucherAmount", e.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="purpose" className="text-sm font-medium">
              Purpose<span className="text-red-500">*</span>
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

        <div className="space-y-2">
          <Label
            htmlFor="voucher-credit-person"
            className="text-sm font-medium"
          >
            Voucher Credit Person<span className="text-red-500">*</span>
          </Label>
          <Input
            id="voucher-credit-person"
            placeholder="Name of person receiving payment"
            value={formData.voucherCreditPerson || ""}
            onChange={(e) =>
              onInputChange("voucherCreditPerson", e.target.value)
            }
            required
          />
          <p className="text-sm text-gray-500 mt-1">
            This should be the person to whom the payment is being made
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Approver's Signature</Label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 h-24 flex flex-col items-center justify-center bg-gray-50">
              <p className="text-sm text-gray-500">Signature required</p>
              <p className="text-xs text-gray-400 mt-1">Sandhya</p>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Your Signature</Label>
            <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 h-24 flex flex-col items-center justify-center bg-gray-50">
              <p className="text-sm text-gray-500">Signature required</p>
              <p className="text-xs text-gray-400 mt-1">You</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
