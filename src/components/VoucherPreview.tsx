"use client";

import React from "react";
import { FileText, Eye, EyeOff } from "lucide-react";
import { vouchers, voucherAttachments } from "@/lib/db";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { ExpenseStatusBadge } from "@/components/ExpenseStatusBadge";
import { useOrgStore } from "@/store/useOrgStore";
import VoucherDownloadAsPdf from "@/components/VoucherDownloadAsPdf";

type Props = {
  expense: any;
  expenseId?: string;
  defaultOpen?: boolean;
};

export default function VoucherPreview({ expense, expenseId, defaultOpen = true }: Props) {
  const { organization } = useOrgStore();
  const [voucherDetails, setVoucherDetails] = React.useState<any | null>(null);
  const [voucherSignatureUrl, setVoucherSignatureUrl] = React.useState<string | null>(null);
  const [voucherAttachmentUrl, setVoucherAttachmentUrl] = React.useState<string | null>(null);
  const [voucherAttachmentFilename, setVoucherAttachmentFilename] = React.useState<string | null>(null);
  const [voucherPreviewLoading, setVoucherPreviewLoading] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState<boolean>(defaultOpen);

  React.useEffect(() => {
    let cancelled = false;

    const loadVoucherPreview = async () => {
      const id = expenseId || expense?.id;
      if (!id) return;

      try {
        setVoucherPreviewLoading(true);
        const { data: voucherData, error } = await vouchers.getByExpenseId(id as string);
        if (error || !voucherData) {
          if (!cancelled) {
            setVoucherDetails(null);
            setIsOpen(false);
          }
          return;
        }

        if (cancelled) return;

        setVoucherDetails(voucherData);
        setIsOpen(true);

        if (voucherData.signature_url) {
          const { url } = await vouchers.getSignatureUrl(voucherData.signature_url);
          if (!cancelled) setVoucherSignatureUrl(url || null);
        }

        if ((voucherData as any).attachment_url || (voucherData as any).attachment) {
          const attachmentValue = (voucherData as any).attachment_url || (voucherData as any).attachment;
          const [filename, filePath] = String(attachmentValue).split(",");
          if (filePath) {
            const { url, error } = await voucherAttachments.getUrl(filePath);
            if (!cancelled) {
              setVoucherAttachmentUrl(!error ? url || null : null);
              setVoucherAttachmentFilename(filename || null);
            }
          }
        } else {
          if (!cancelled) setVoucherAttachmentFilename(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("Voucher preview load error:", err);
          setVoucherDetails(null);
          setIsOpen(false);
        }
      } finally {
        if (!cancelled) setVoucherPreviewLoading(false);
      }
    };

    loadVoucherPreview();

    return () => {
      cancelled = true;
    };
  }, [expenseId, expense?.id]);

  return (
    <div className="bg-white p-6 rounded shadow border">
      <div className="border-b pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 text-blue-600" />
            <div>
              <p className="text-base font-semibold">Voucher Preview</p>
              <p className="text-sm text-muted-foreground">Opens by default for quick review</p>
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
                    onClick={() => setIsOpen(!isOpen)}
                    aria-label={isOpen ? "Hide voucher preview" : "Show voucher preview"}
                  >
                    {isOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{isOpen ? "Hide voucher preview" : "Show voucher preview"}</p>
                </TooltipContent>
              </Tooltip>
              {voucherDetails && (
                <VoucherDownloadAsPdf
                  expense={expense}
                  expenseId={expenseId || expense?.id || ""}
                  voucherDetails={voucherDetails}
                  voucherSignatureUrl={voucherSignatureUrl}
                  organization={organization}
                />
              )}
            </TooltipProvider>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="space-y-4 p-4">
          {voucherPreviewLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Your Name</p>
                  <p className="font-medium">{voucherDetails?.your_name || expense.creator?.full_name || "—"}</p>
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">Amount</p>
                    <ExpenseStatusBadge status={expense.status} />
                  </div>
                  <p className="font-medium">{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(voucherDetails?.amount || expense.amount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">{new Date(expense.date).toLocaleDateString("en-GB")}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Credit Person</p>
                  <p className="font-medium">{voucherDetails?.credit_person || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Approver</p>
                  <p className="font-medium">{expense.approver?.full_name || "—"}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-muted-foreground">Purpose</p>
                  <div className="mt-1 rounded-md border bg-gray-50 px-3 py-2 text-sm">{voucherDetails?.purpose || "—"}</div>
                </div>
              </div>

              <div>
                <p className="text-sm text-muted-foreground mb-2">Signature</p>
                {voucherSignatureUrl ? (
                  <div className="border rounded-md p-3 bg-white">
                    <img src={voucherSignatureUrl} alt="Voucher signature" className="max-h-28 mx-auto" />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Signature not available</p>
                )}
              </div>

              {voucherAttachmentUrl ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Attachment</p>
                  </div>
                  {voucherAttachmentFilename?.toLowerCase().endsWith(".pdf") ? (
                    <div className="rounded-md border bg-white overflow-hidden" style={{ height: "500px" }}>
                      <iframe src={`${voucherAttachmentUrl}#toolbar=0&navpanes=0&scrollbar=1`} className="h-full w-full border-none" title="Attachment PDF Preview" />
                    </div>
                  ) : (
                    <div className="rounded-md border bg-muted">
                      <img src={voucherAttachmentUrl} alt="Voucher attachment preview" className="max-h-[500px] w-full object-contain" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex gap-1">
                  <p className="text-sm font-medium">Attachment : </p>
                  <p className="text-sm text-muted-foreground">Not Available</p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
