// app/org/[slug]/finance/records/page.tsx
import { BadgeDollarSign } from "lucide-react";

export default function PaymentRecords() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BadgeDollarSign className="h-5 w-5" />
        <h2 className="text-xl font-semibold">Payment Records</h2>
      </div>
    </div>
  );
}