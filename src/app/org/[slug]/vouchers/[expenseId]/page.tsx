"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { vouchers } from "@/lib/db";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import VoucherForm from "../../expenses/new/VoucherForm";

export default function ViewVoucherPage() {
  const router = useRouter();
  const params = useParams();
  const voucherId = params.expenseId as string;
  const slug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [voucher, setVoucher] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});

  useEffect(() => {
    async function fetchVoucher() {
      try {
        const { data, error } = await vouchers.getById(voucherId);
        if (error || !data) {
          toast.error("Failed to load voucher");
          router.push(`/org/${slug}/expenses`);
          return;
        }
        setVoucher(data);
        setFormData({
          yourName: data.your_name,
          date: data.created_at ? data.created_at.split("T")[0] : "",
          voucherAmount: data.amount,
          purpose: data.purpose,
          voucherCreditPerson: data.credit_person,
          signature_url: data.signature_url,
          manager_signature_url: data.manager_signature_url,
        });
      } catch (error) {
        toast.error("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    }
    fetchVoucher();
  }, [voucherId, router, slug]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!voucher) return null;

  return (
    <div className="max-w-[700px] mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle>Voucher Details</CardTitle>
        </CardHeader>
        <CardContent>
          <VoucherForm
            formData={formData}
            onInputChange={() => {}}
            userRole={null}
            disabled={true}
          />
        </CardContent>
      </Card>
    </div>
  );
}
