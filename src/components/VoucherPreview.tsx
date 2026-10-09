"use client";

import React from "react";
import { FileText, Eye, EyeOff, Edit2, Save, X } from "lucide-react";
import { vouchers, voucherAttachments, expenses, expenseHistory } from "@/lib/db";
import supabase from "@/lib/supabase";
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
};

export default function VoucherPreview({ expense, expenseId, defaultOpen = true, defaultEditMode = false }: Props) {
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
                    onClick={() => setIsEditing(false)}
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

                        const { error } = await vouchers.update(voucherDetails.id, {
                          your_name: editForm.your_name,
                          amount: parseFloat(editForm.amount) || 0,
                          credit_person: editForm.credit_person,
                          purpose: editForm.purpose,
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
                          await logChange("Voucher Amount", voucherDetails.amount, parseFloat(editForm.amount) || 0);
                          await logChange("Credit Person", voucherDetails.credit_person, editForm.credit_person);
                          await logChange("Purpose", voucherDetails.purpose, editForm.purpose);

                          if (newAttachment) {
                            await logChange("Attachment", "Previous", "Updated");
                          }

                          const oldDate = expense?.date ? new Date(expense.date).toISOString().split("T")[0] : "";
                          if (editForm.date && editForm.date !== oldDate) {
                            await logChange("Date", oldDate, editForm.date);
                            await expenses.update(expense.id, { date: editForm.date });
                            window.location.reload();
                          }
                        } catch (e) { console.error("Error logging history:", e); }

                        if (newAttachment) {
                          window.location.reload();
                        }

                        setVoucherDetails({
                          ...voucherDetails,
                          your_name: editForm.your_name,
                          amount: parseFloat(editForm.amount) || 0,
                          credit_person: editForm.credit_person,
                          purpose: editForm.purpose,
                          ...(newAttachment && { attachment: attachmentValue })
                        });
                        setIsEditing(false);
                        toast.success("Voucher updated successfully");
                      } catch (err) {
                        toast.error("Failed to update voucher");
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    disabled={isSaving}
                  >
                    {isSaving ? <Spinner className="h-4 w-4 mr-1" /> : <Save className="h-4 w-4 mr-1" />} Save
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
                    <Input type="number" value={editForm.amount} onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })} className="mt-1 h-8" />
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
                  <Label className="text-sm text-muted-foreground">Approver</Label>
                  <p className="font-medium">{expense?.approver?.full_name || "N/A"}</p>
                </div>
                <div className="md:col-span-2">
                  <Label className="text-sm text-muted-foreground">Purpose</Label>
                  {isEditing ? (
                    <Textarea value={editForm.purpose} onChange={(e) => setEditForm({ ...editForm, purpose: e.target.value })} className="mt-1 min-h-[60px]" />
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
                  <Label className="text-sm text-muted-foreground">Update Attachment</Label>
                  <Input type="file" onChange={(e) => setNewAttachment(e.target.files?.[0] || null)} className="mt-1" />
                  {newAttachment && <p className="text-sm text-blue-600 mt-1">New file selected: {newAttachment.name}</p>}
                </div>
              )}
              
              {(() => {
                const previewUrl = newAttachment ? URL.createObjectURL(newAttachment) : voucherAttachmentUrl;
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
    </div>
  );
}
