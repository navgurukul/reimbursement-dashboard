"use client";

import React from "react";
import { FileText, Eye, EyeOff, Edit2, Save, X, Loader2 } from "lucide-react";
import { vouchers, voucherAttachments, expenses, expenseHistory } from "@/lib/db";
import supabase from "@/lib/supabase";
import { mergeReceiptsToPdf } from "@/lib/receipt-pdf-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Props = {
  expense: any;
  expenseId?: string;
  defaultOpen?: boolean;
  defaultEditMode?: boolean;
  onEditingChange?: (isEditing: boolean) => void;
};

export default function VoucherPreview({
  expense,
  expenseId,
  defaultOpen = true,
  defaultEditMode = false,
  onEditingChange,
}: Props) {
  const { organization } = useOrgStore();
  const [voucherDetails, setVoucherDetails] = React.useState<any | null>(null);
  const [voucherSignatureUrl, setVoucherSignatureUrl] = React.useState<string | null>(null);
  const [voucherAttachmentUrl, setVoucherAttachmentUrl] = React.useState<string | null>(null);
  const [voucherAttachmentFilename, setVoucherAttachmentFilename] = React.useState<string | null>(null);
  const [voucherPreviewLoading, setVoucherPreviewLoading] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState<boolean>(defaultOpen);
  const [isEditing, setIsEditing] = React.useState(defaultEditMode);
  const [isSaving, setIsSaving] = React.useState(false);
  const [editForm, setEditForm] = React.useState<any>({});
  const [newAttachment, setNewAttachment] = React.useState<File | null>(null);
  const [isAttachmentProcessing, setIsAttachmentProcessing] = React.useState(false);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = React.useState<string | null>(null);
  const [attachmentPageImages, setAttachmentPageImages] = React.useState<string[]>([]);
  const [previewPdfModal, setPreviewPdfModal] = React.useState<{
    open: boolean;
    url: string;
    title: string;
    pageImages?: string[];
  }>({
    open: false,
    url: "",
    title: "",
    pageImages: [],
  });

  React.useEffect(() => {
    if (voucherDetails) {
      onEditingChange?.(isEditing);
    } else {
      onEditingChange?.(false);
    }
  }, [isEditing, voucherDetails, onEditingChange]);

  React.useEffect(() => {
    return () => {
      onEditingChange?.(false);
    };
  }, [onEditingChange]);

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
        if (defaultEditMode) {
          setEditForm({
            your_name: voucherData.your_name || "",
            amount: voucherData.amount || "",
            credit_person: voucherData.credit_person || "",
            purpose: voucherData.purpose || "",
            date: expense?.date ? new Date(expense.date).toISOString().split("T")[0] : "",
          });
        }

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
    <div className="bg-white p-6 rounded-lg shadow border">
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

              {voucherDetails && !isEditing && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      className="cursor-pointer"
                      onClick={() => {
                        setEditForm({
                          your_name: voucherDetails.your_name || "",
                          amount: voucherDetails.amount || "",
                          credit_person: voucherDetails.credit_person || "",
                          purpose: voucherDetails.purpose || "",
                          date: expense?.date ? new Date(expense.date).toISOString().split("T")[0] : "",
                        });
                        setNewAttachment(null);
                        setIsEditing(true);
                      }}
                      aria-label="Edit voucher"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    <p>Edit voucher</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {voucherDetails && isEditing && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="cursor-pointer"
                    onClick={() => {
                      if (attachmentPreviewUrl) {
                        try {
                          URL.revokeObjectURL(attachmentPreviewUrl);
                        } catch {}
                      }
                      setNewAttachment(null);
                      setAttachmentPreviewUrl(null);
                      setAttachmentPageImages([]);
                      setIsEditing(false);
                    }}
                    disabled={isSaving}
                  >
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="cursor-pointer"
                    onClick={async () => {
                      try {
                        setIsSaving(true);

                        let attachmentValue = voucherDetails.attachment_url || voucherDetails.attachment;

                        if (newAttachment) {
                          const { path, error: uploadError } = await voucherAttachments.upload(
                            newAttachment,
                            expense.user_id || organization?.id || "unknown",
                            organization?.id || "unknown"
                          );
                          if (uploadError) throw uploadError;
                          attachmentValue = `${newAttachment.name},${path}`;
                        }

                        const vAmount = parseFloat(String(editForm.amount ?? ""));
                        const roundedVAmount = isNaN(vAmount) ? 0 : Math.round(vAmount);

                        const { error } = await vouchers.update(voucherDetails.id, {
                          your_name: editForm.your_name,
                          amount: roundedVAmount,
                          credit_person: editForm.credit_person,
                          purpose: editForm.purpose || "",
                          ...(newAttachment && { attachment: attachmentValue })
                        });
                        if (error) throw error;

                        try {
                          const { data: { session } } = await supabase.auth.getSession();
                          let userName = "Unknown User";
                          let userId = session?.user?.id || expense?.user_id || "unknown";

                          const authRaw = localStorage.getItem('auth-storage');
                          const authStorage = JSON.parse(authRaw || '{}');
                          if (authStorage?.state?.user?.profile?.full_name) {
                            userName = authStorage.state.user.profile.full_name;
                          } else if (typeof authRaw === 'string' && authRaw.includes('full_name')) {
                            const match = authRaw.match(/"full_name":\s*"([^"]+)"/);
                            if (match && match[1]) userName = match[1];
                          }

                          const logChange = async (fieldLabel: string, oldVal: any, newVal: any) => {
                            if (String(oldVal || "") !== String(newVal || "")) {
                              await expenseHistory.addEntry(
                                expense?.id || voucherDetails.expense_id,
                                userId,
                                userName,
                                'updated',
                                `${fieldLabel}: ${oldVal || "None"}`,
                                `${fieldLabel}: ${newVal || "None"}`
                              ).catch(console.error);
                            }
                          };

                          await logChange("Voucher Name", voucherDetails.your_name, editForm.your_name);
                          await logChange("Voucher Amount", voucherDetails.amount, parseFloat(String(editForm.amount ?? "")) || 0);
                          await logChange("Credit Person", voucherDetails.credit_person, editForm.credit_person);
                          await logChange("Purpose", voucherDetails.purpose, editForm.purpose);

                          if (newAttachment) {
                            await logChange("Attachment", "Previous", "Updated");
                          }

                          const oldDate = expense?.date ? new Date(expense.date).toISOString().split("T")[0] : "";
                          if (editForm.date && editForm.date !== oldDate) {
                            await logChange("Date", oldDate, editForm.date);
                            await expenses.update(expense.id, { date: editForm.date });
                          }
                        } catch (e) { console.error("Error logging history:", e); }

                        setVoucherDetails({
                          ...voucherDetails,
                          your_name: editForm.your_name,
                          amount: parseFloat(String(editForm.amount ?? "")) || 0,
                          credit_person: editForm.credit_person,
                          purpose: editForm.purpose,
                          ...(newAttachment && { attachment: attachmentValue })
                        });
                        if (newAttachment && attachmentPreviewUrl) {
                          setVoucherAttachmentFilename(newAttachment.name);
                          setVoucherAttachmentUrl(attachmentPreviewUrl);
                        }
                        setNewAttachment(null);
                        setAttachmentPreviewUrl(null);
                        setAttachmentPageImages([]);
                        setIsEditing(false);
                        toast.success("Voucher updated successfully");
                      } catch (err) {
                        toast.error("Failed to update voucher");
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    disabled={isSaving || isAttachmentProcessing}
                  >
                    {isSaving || isAttachmentProcessing ? (
                      <Spinner className="h-4 w-4 mr-1" />
                    ) : (
                      <Save className="h-4 w-4 mr-1" />
                    )}{" "}
                    Save
                  </Button>
                </>
              )}
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
                  <Label className="text-sm text-muted-foreground">Your Name</Label>
                  {isEditing ? (
                    <Input value={editForm.your_name} onChange={(e) => setEditForm({ ...editForm, your_name: e.target.value })} className="mt-1 h-8" />
                  ) : (
                    <p className="font-medium">{voucherDetails?.your_name || expense?.creator?.full_name || "N/A"}</p>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <Label className="text-sm text-muted-foreground">Amount</Label>
                    <ExpenseStatusBadge status={expense?.status} />
                  </div>
                  {isEditing ? (
                    <div>
                      <Input
                        type="number"
                        step="1"
                        value={editForm.amount}
                        onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                        onBlur={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            const rounded = Math.round(val);
                            if (rounded !== val) {
                              setEditForm({ ...editForm, amount: rounded });
                              toast.success(`Amount rounded off: ₹${val} → ₹${rounded}`);
                            }
                          }
                        }}
                        className="mt-1 h-8"
                      />
                      <p className="text-xs text-muted-foreground mt-0.5">Decimal amounts are automatically rounded off.</p>
                    </div>
                  ) : (
                    <p className="font-medium">{new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(voucherDetails?.amount ?? expense?.amount ?? 0)}</p>
                  )}
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Date</Label>
                  {isEditing ? (
                    <Input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} className="mt-1 h-8 block w-full" />
                  ) : (
                    <p className="font-medium">{expense?.date ? new Date(expense.date).toLocaleDateString("en-GB") : "N/A"}</p>
                  )}
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Credit Person</Label>
                  {isEditing ? (
                    <Input value={editForm.credit_person} onChange={(e) => setEditForm({ ...editForm, credit_person: e.target.value })} className="mt-1 h-8" />
                  ) : (
                    <p className="font-medium">{voucherDetails?.credit_person || "N/A"}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Approver</p>
                  <p className="font-medium">{expense?.custom_fields?.approver_name || expense?.approver?.full_name || "—"}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Second Approver</p>
                  <p className="font-medium">{expense?.custom_fields?.second_approver_name || "N/A"}</p>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-sm text-muted-foreground">Purpose</Label>
                  {isEditing ? (
                    <Textarea
                      value={editForm.purpose}
                      onChange={(e) => setEditForm({ ...editForm, purpose: e.target.value })}
                      className="mt-1 min-h-[60px]"
                    />
                  ) : (
                    <div className="mt-1 rounded-md border bg-gray-50 px-3 py-2 text-sm">{voucherDetails?.purpose || "N/A"}</div>
                  )}
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

              {isEditing && (
                <div className="space-y-2 border-t pt-4 mt-4 mb-4">
                  <Label htmlFor="voucher-attachment-edit" className="text-sm font-medium text-gray-700">
                    Update Attachment
                  </Label>
                  <Input
                    id="voucher-attachment-edit"
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length === 0) return;

                      setIsAttachmentProcessing(true);
                      try {
                        const result = await mergeReceiptsToPdf(files, {
                          label: "voucher_attachments",
                        });
                        setNewAttachment(result.file);
                        setAttachmentPreviewUrl(result.previewUrl);
                        setAttachmentPageImages(result.pageImages || []);

                        if (files.length > 1) {
                          toast.success(
                            `Merged ${files.length} voucher attachments into a single PDF (${result.pageCount} pages)`
                          );
                        } else if (!files[0].name.toLowerCase().endsWith(".pdf")) {
                          toast.success("Voucher attachment converted to PDF");
                        }
                      } catch (err: any) {
                        console.error("Voucher attachment processing error:", err);
                        toast.error(err?.message || "Failed to process attachment into PDF");
                      } finally {
                        setIsAttachmentProcessing(false);
                      }
                    }}
                    disabled={isAttachmentProcessing}
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Upload proof of payment (JPG, PNG, or PDF). Multiple files will be merged into a single PDF.
                  </p>

                  <div className="text-sm text-gray-500 mt-1 flex items-center justify-between">
                    <span>
                      {newAttachment
                        ? newAttachment.name
                        : voucherAttachmentFilename
                        ? `Current: ${voucherAttachmentFilename}`
                        : "No file chosen"}
                    </span>
                    {isAttachmentProcessing ? (
                      <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Merging into PDF...
                      </span>
                    ) : newAttachment ? (
                      <span className="text-xs text-emerald-600 font-medium">
                        PDF Ready
                      </span>
                    ) : null}
                  </div>

                  {newAttachment && attachmentPreviewUrl && (
                    <div className="mt-2.5">
                      <div className="p-3 bg-gray-50 rounded-md border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                        <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
                          <FileText className="w-4 h-4 text-red-500 shrink-0" />
                          <p className="text-sm text-gray-700 font-medium truncate">
                            {newAttachment.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setPreviewPdfModal({
                                open: true,
                                url: attachmentPreviewUrl,
                                title:
                                  newAttachment.name ||
                                  "Voucher Attachment PDF Preview",
                                pageImages: attachmentPageImages,
                              })
                            }
                            className="text-xs h-7 px-2.5 text-blue-600 border-blue-200 hover:bg-blue-50"
                          >
                            Preview & Verify PDF
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (attachmentPreviewUrl) {
                                try {
                                  URL.revokeObjectURL(attachmentPreviewUrl);
                                } catch {}
                              }
                              setNewAttachment(null);
                              setAttachmentPreviewUrl(null);
                              setAttachmentPageImages([]);
                              const input = document.getElementById(
                                "voucher-attachment-edit"
                              ) as HTMLInputElement | null;
                              if (input) input.value = "";
                            }}
                            className="text-xs h-7 px-2 text-red-600 border border-red-300"
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(() => {
                const previewUrl = attachmentPreviewUrl || voucherAttachmentUrl;
                const previewFilename = newAttachment ? newAttachment.name : voucherAttachmentFilename;

                return previewUrl ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Attachment</p>
                    </div>
                    {previewFilename?.toLowerCase().endsWith(".pdf") ? (
                      <div className="rounded-md border bg-white overflow-hidden" style={{ height: "500px" }}>
                        <iframe src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`} className="h-full w-full border-none" title="Attachment PDF Preview" />
                      </div>
                    ) : (
                      <div className="rounded-md border bg-muted">
                        <img src={previewUrl} alt="Voucher attachment preview" className="w-full max-h-[500px] object-contain" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <p className="text-sm font-medium">Attachment : </p>
                    <p className="text-sm text-muted-foreground">Not Available</p>
                  </div>
                );
              })()}
            </>
          )}
        </div>
      )}

      {/* Merged Voucher Attachment PDF Preview & Verification Modal */}
      <Dialog
        open={previewPdfModal.open}
        onOpenChange={(open) =>
          setPreviewPdfModal((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 bg-white text-gray-900 overflow-hidden shadow-2xl">
          <DialogHeader className="p-4 pb-3 border-b bg-gray-50/80 pr-10 text-left">
            <DialogTitle className="text-base font-semibold text-gray-900 truncate">
              {previewPdfModal.title}
            </DialogTitle>
            <div className="flex items-center justify-between mt-1 text-xs text-gray-500">
              <DialogDescription asChild>
                <span>
                  {previewPdfModal.pageImages && previewPdfModal.pageImages.length > 0
                    ? `${previewPdfModal.pageImages.length} page${previewPdfModal.pageImages.length > 1 ? "s" : ""} in merged PDF`
                    : "Verify all pages of your merged voucher attachment PDF."}
                </span>
              </DialogDescription>
              {previewPdfModal.url && (
                <a
                  href={previewPdfModal.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium inline-flex items-center gap-1 border border-blue-700 rounded-md px-1 py-1"
                >
                  Open in new tab
                </a>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-100/70 max-h-[calc(90vh-80px)]">
            {previewPdfModal.pageImages && previewPdfModal.pageImages.length > 0 ? (
              previewPdfModal.pageImages.map((imgSrc, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col items-center p-3"
                >
                  <div className="w-full flex items-center justify-between pb-2 mb-2 border-b text-xs text-gray-500 font-medium">
                    <span>Page {idx + 1} of {previewPdfModal.pageImages?.length}</span>
                  </div>
                  <img
                    src={imgSrc}
                    alt={`Attachment page ${idx + 1}`}
                    className="max-w-full h-auto object-contain rounded"
                  />
                </div>
              ))
            ) : (
              <div className="w-full h-[60vh] bg-white rounded border overflow-hidden">
                <iframe
                  src={`${previewPdfModal.url}#toolbar=0&navpanes=0&scrollbar=1`}
                  className="w-full h-full border-0"
                  title="Attachment PDF Preview"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
