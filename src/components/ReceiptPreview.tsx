"use client";

import React from "react";
import { FileText, Eye, EyeOff } from "lucide-react";
import { expenses } from "@/lib/db";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

type Props = {
  expense: any;
  defaultOpen?: boolean;
};

export default function ReceiptPreview({ expense, defaultOpen = true }: Props) {
  const [receiptPreviewUrl, setReceiptPreviewUrl] = React.useState<string | null>(null);
  const [isOpen, setIsOpen] = React.useState<boolean>(defaultOpen);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [isPdf, setIsPdf] = React.useState<boolean>(false);

  React.useEffect(() => {
    let isCancelled = false;

    const loadReceiptPreview = async () => {
      if (!expense?.receipt?.path) {
        setReceiptPreviewUrl(null);
        setIsOpen(false);
        return;
      }

      try {
        setLoading(true);
        const { url, error } = await expenses.getReceiptUrl(expense.receipt.path);
        if (isCancelled) return;
        if (error || !url) {
          console.error("Error loading receipt preview:", error);
          setReceiptPreviewUrl(null);
          setIsOpen(false);
          return;
        }

        setReceiptPreviewUrl(url);
        setIsOpen(true);
        setIsPdf(url.toLowerCase().includes(".pdf"));
      } catch (err) {
        if (!isCancelled) {
          console.error("Receipt preview error:", err);
          setReceiptPreviewUrl(null);
          setIsOpen(false);
        }
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    loadReceiptPreview();

    return () => {
      isCancelled = true;
    };
  }, [expense?.receipt?.path, expense]);

  return (
    <div className="bg-white p-6 rounded shadow border">
      <div className="border-b pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <FileText className="mt-0.5 h-5 w-5 text-blue-600" />
            <div>
              <p className="text-base font-semibold">Receipt Preview</p>
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
                    onClick={() => setIsOpen((v) => !v)}
                    aria-label={isOpen ? "Hide receipt preview" : "Show receipt preview"}
                  >
                    {isOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{isOpen ? "Hide receipt preview" : "Show receipt preview"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {isOpen && (
        <div className="p-4">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : receiptPreviewUrl ? (
            isPdf ? (
              <div className="rounded-md border bg-white overflow-hidden" style={{ height: "500px" }}>
                <iframe
                  src={`${receiptPreviewUrl}#toolbar=0&navpanes=0&scrollbar=1`}
                  className="h-full w-full border-none"
                  title="Receipt PDF Preview"
                />
              </div>
            ) : (
              <div className="overflow-y-auto rounded-md border bg-muted" style={{ height: "auto" }}>
                <img src={receiptPreviewUrl} alt={expense.receipt?.filename || "Receipt preview"} className="w-full object-contain" />
              </div>
            )
          ) : (
            <p className="text-sm text-muted-foreground">Receipt preview not available right now.</p>
          )}
        </div>
      )}
    </div>
  );
}
