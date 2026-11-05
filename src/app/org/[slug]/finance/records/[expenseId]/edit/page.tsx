"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import {
  orgSettings,
  expenses,
  expenseHistory,
  vouchers,
  profiles,
  expenseEvents,
  organizations,
} from "@/lib/db";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Upload, X, FileText, Loader2, Pencil } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import supabase from "@/lib/supabase";
import ReceiptPreview from "@/components/ReceiptPreview";
import VoucherPreview from "@/components/VoucherPreview";
import { mergeReceiptsToPdf } from "@/lib/receipt-pdf-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function RecordsEditExpensePage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { organization, userRole } = useOrgStore();
  const orgId = organization?.id!;
  const expenseId = (params.expenseId || params.id) as string;
  const slug = params.slug as string;

  const bankTabParam = searchParams.get("activeTab");
  const activeTab =
    bankTabParam === "ngidfc" ||
    bankTabParam === "fcidfc" ||
    bankTabParam === "kotak"
      ? bankTabParam
      : "all";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expense, setExpense] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [isReceiptProcessing, setIsReceiptProcessing] = useState(false);
  const [receiptPageImages, setReceiptPageImages] = useState<string[]>([]);
  const [previewPdfModal, setPreviewPdfModal] = useState<{
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

  const [columns, setColumns] = useState<any[]>([]);
  const [expenseTypeOptions, setExpenseTypeOptions] = useState<string[]>([]);
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [expenseCreditPersonOptions, setExpenseCreditPersonOptions] = useState<string[]>([]);
  const [hasVoucher, setHasVoucher] = useState(false);
  const [approverOptions, setApproverOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [isVoucherEditing, setIsVoucherEditing] = useState(false);
  const [voucherData, setVoucherData] = useState<any>(null);
  const [eventTitle, setEventTitle] = useState<string | null>(null);
  const [eventsList, setEventsList] = useState<Array<{ id: string; title: string }>>([]);

  const getDisplayFieldLabel = (key: string) => {
    const labelMap: Record<string, string> = {
      description: "Description",
      approver_name: "Approver Name",
      location_of_expense: "Project of Expense",
      project_of_expense: "Project of Expense",
      expense_credit_person: "Expense Credit Person",
    };

    return (
      labelMap[key] ||
      key
        .split("_")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ")
    );
  };

  const isExcludedCustomField = (key: string) => {
    const norm = key.replace(/[\s_-]+/g, "").toLowerCase();
    const excluded = [
      "location",
      "locationofexpense",
      "projectofexpense",
      "approver",
      "approvername",
      "secondapproverid",
      "secondapprovername",
      "expensecreditperson",
      "markedasadvance",
      "markedasadvanceat",
      "originalserialnumber",
      "originalsno",
      "originalserialno",
      "serialnumber",
      "sno",
      "isvoucher",
      "yourname",
      "voucherdate",
      "voucheramount",
    ];
    return excluded.includes(norm);
  };

  const getBackUrl = useCallback(() => {
    const query = new URLSearchParams();
    query.set("activeTab", activeTab);
    const page = searchParams.get("page");
    if (page) query.set("page", page);
    const sNo = searchParams.get("sNo");
    if (sNo) query.set("sNo", sNo);
    return `/org/${slug}/finance/records/${expenseId}?${query.toString()}`;
  }, [activeTab, expenseId, searchParams, slug]);

  useEffect(() => {
    async function fetchData() {
      try {
        if (!expenseId) return;

        // Fetch expense data
        const { data, error } = await expenses.getById(expenseId);
        if (error || !data) {
          toast.error("Failed to load expense", {
            description: error?.message || "Expense not found",
          });
          router.push(`/org/${slug}/finance?tab=records`);
          return;
        }
        setExpense(data);

        // Normalize initial values for Project of Expense and Expense Credit Person
        const initialProjectOfExpense =
          data.custom_fields?.project_of_expense ||
          data.custom_fields?.["Project of Expense"] ||
          data.custom_fields?.location_of_expense ||
          data.custom_fields?.["Location of Expense"] ||
          data.custom_fields?.location ||
          (data as any).location ||
          "";

        const initialExpenseCreditPerson =
          data.custom_fields?.expense_credit_person ||
          data.custom_fields?.["Expense Credit Person"] ||
          data.expense_credit_person ||
          "";

        setFormData({
          expense_type: data.expense_type || "",
          amount: data.amount ?? "",
          approved_amount: data.approved_amount ?? data.amount ?? "",
          date: data.date ? new Date(data.date).toISOString().split("T")[0] : "",
          event_id: data.event_id || "",
          ...data.custom_fields,
          approver: data.approver_id || data.custom_fields?.approver || "",
          approver_name:
            data.custom_fields?.approver_name ||
            data.approver?.full_name ||
            "",
          project_of_expense: initialProjectOfExpense,
          ...(initialExpenseCreditPerson ? { expense_credit_person: initialExpenseCreditPerson } : {}),
        });

        // Fetch related event title if linked
        if (data.event_id) {
          try {
            const { data: eventData } = await expenseEvents.getById(data.event_id);
            if (eventData) {
              setEventTitle(eventData.title);
            }
          } catch (e) {
            console.error("Error fetching event details:", e);
          }
        }

        // Fetch events for dropdown
        if (orgId) {
          try {
            const { data: evs } = await expenseEvents.getByOrg(orgId);
            if (evs) {
              setEventsList(evs.map((e: any) => ({ id: e.id, title: e.title })));
            }
          } catch (e) {
            console.error("Error fetching events:", e);
          }
        }

        // Check if expense has voucher
        const { data: voucherRes } = await vouchers.getByExpenseId(expenseId);
        if (voucherRes) {
          setHasVoucher(true);
          setVoucherData(voucherRes);
          setIsVoucherEditing(true);
        }

        // Fetch organization settings for dropdowns
        if (orgId) {
          const { data: settings, error: settingsError } = await orgSettings.getByOrgId(orgId);
          if (!settingsError && settings && settings.expense_columns) {
            setColumns(settings.expense_columns);

            // Extract expense type options
            const expenseTypeCol = settings.expense_columns.find(
              (col: any) => col.key === "expense_type"
            );
            if (expenseTypeCol && expenseTypeCol.options) {
              const options = expenseTypeCol.options;
              if (Array.isArray(options) && options.length > 0) {
                if (typeof options[0] === "object") {
                  setExpenseTypeOptions(
                    (options as Array<{ value: string; label: string }>).map(
                      (opt) => opt.label || opt.value
                    )
                  );
                } else {
                  setExpenseTypeOptions(options as string[]);
                }
              }
            }

            // Extract location options
            const locationCol = settings.expense_columns.find(
              (col: any) =>
                col.key === "location" ||
                col.key === "location_of_expense" ||
                col.key === "Project of Expense" ||
                col.label?.trim().toLowerCase() === "project of expense" ||
                col.label?.trim().toLowerCase() === "location of expense"
            );
            if (locationCol && locationCol.options) {
              const options = locationCol.options;
              if (Array.isArray(options) && options.length > 0) {
                if (typeof options[0] === "object") {
                  setLocationOptions(
                    (options as Array<{ value: string; label: string }>).map(
                      (opt) => opt.label || opt.value
                    )
                  );
                } else {
                  setLocationOptions(options as string[]);
                }
              }
            }

            // Extract expense credit person options
            const expenseCreditPersonCol = settings.expense_columns.find(
              (col: any) =>
                col.key === "expense_credit_person" ||
                col.label?.trim().toLowerCase() === "expense credit person"
            );
            if (expenseCreditPersonCol && expenseCreditPersonCol.options) {
              const options = expenseCreditPersonCol.options;
              if (Array.isArray(options) && options.length > 0) {
                if (typeof options[0] === "object") {
                  setExpenseCreditPersonOptions(
                    (options as Array<{ value: string; label: string }>).map(
                      (opt) => opt.label || opt.value
                    )
                  );
                } else {
                  setExpenseCreditPersonOptions(options as string[]);
                }
              }
            }
          }

          // Fetch approver options
          const { data: membersData } = await organizations.getOrganizationMembers(orgId);
          if (membersData) {
            const approvers = membersData.filter((member) =>
              ["owner", "admin", "manager"].includes(member.role)
            );
            const { data: profilesData } = await profiles.getByIds(
              approvers.map((a) => a.user_id)
            );
            const approverNamesMap = new Map(
              profilesData?.map((p) => [p.user_id, p.full_name || p.email]) || []
            );
            const mappedOptions = approvers.map((a) => ({
              value: a.user_id,
              label: approverNamesMap.get(a.user_id) || a.user_id,
            }));
            setApproverOptions(mappedOptions);
          }
        }
      } catch (error) {
        console.error("Error fetching expense for records edit:", error);
        toast.error("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [expenseId, orgId, router, slug]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setIsReceiptProcessing(true);
    try {
      const result = await mergeReceiptsToPdf(files, { label: "receipts" });
      setReceiptFile(result.file);
      setReceiptPreview(result.previewUrl);
      setReceiptPageImages(result.pageImages || []);
      if (files.length > 1) {
        toast.success(
          `Merged ${files.length} receipts into a single PDF (${result.pageCount} pages)`
        );
      } else if (!files[0].name.toLowerCase().endsWith(".pdf")) {
        toast.success("Receipt image converted to PDF");
      }
    } catch (err: any) {
      console.error("Receipt processing error:", err);
      toast.error(err?.message || "Failed to process receipt into PDF");
    } finally {
      setIsReceiptProcessing(false);
    }
  };

  const handleClearReceipt = () => {
    if (receiptPreview && receiptPreview.startsWith("blob:")) {
      try {
        URL.revokeObjectURL(receiptPreview);
      } catch {}
    }
    setReceiptFile(null);
    setReceiptPreview(null);
    setReceiptPageImages([]);
    const input = document.getElementById("receipt") as HTMLInputElement | null;
    if (input) input.value = "";
  };

  const handleInputChange = (
    key: string,
    value: string | number | boolean | string[]
  ) => {
    const normalizedKey = key.replace(/_/g, " ").toLowerCase();
    const isProjectOrLocation =
      normalizedKey === "location" ||
      normalizedKey === "location of expense" ||
      normalizedKey === "project of expense";
    const isCreditPerson =
      normalizedKey === "expense credit person" ||
      key.toLowerCase() === "expense_credit_person";

    setFormData((prev) => {
      const next = {
        ...prev,
        [key]: value,
      };

      if (key === "approver" && typeof value === "string") {
        const option = approverOptions.find((o) => o.value === value);
        if (option) next.approver_name = option.label;
      }

      if (isProjectOrLocation && typeof value === "string") {
        next.project_of_expense = value;
        if ("Project of Expense" in next) next["Project of Expense"] = value;
      }

      if (isCreditPerson && typeof value === "string") {
        next.expense_credit_person = value;
        if ("Expense Credit Person" in next) next["Expense Credit Person"] = value;
      }

      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (hasVoucher && isVoucherEditing) {
      toast.error("Please save Voucher Preview before saving changes.");
      return;
    }

    if (isReceiptProcessing) {
      toast.error("Please wait, receipt is being processed into PDF.");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error("User not authenticated. Please log in again.");
      }

      let userName = "Finance User";
      try {
        const authRaw = localStorage.getItem("auth-storage");
        const authStorage = JSON.parse(authRaw || "{}");
        if (authStorage?.state?.user?.profile?.full_name) {
          userName = authStorage.state.user.profile.full_name;
        }
      } catch (err) {}

      // Log changes to activity history
      const approverRelatedKeys = [
        "approver",
        "approver name",
        "approver_name",
        "second approver id",
        "second_approver_id",
        "second approver name",
        "second_approver_name",
      ];

      if (expense.expense_type !== formData.expense_type) {
        await expenseHistory.addEntry(
          expenseId,
          session.user.id,
          userName,
          "updated",
          `Expense Type: ${expense.expense_type}`,
          `Expense Type: ${formData.expense_type}`
        );
      }

      const rawAmount = parseFloat(String(formData.amount ?? ""));
      const roundedAmount = isNaN(rawAmount) ? 0 : Math.round(rawAmount);

      if (expense.amount !== roundedAmount) {
        await expenseHistory.addEntry(
          expenseId,
          session.user.id,
          userName,
          "updated",
          `Amount: ${expense.amount}`,
          `Amount: ${roundedAmount}`
        );
      }

      const rawApprovedAmount = parseFloat(String(formData.approved_amount ?? ""));
      const roundedApprovedAmount = isNaN(rawApprovedAmount) ? roundedAmount : Math.round(rawApprovedAmount);

      if (expense.approved_amount !== roundedApprovedAmount) {
        await expenseHistory.addEntry(
          expenseId,
          session.user.id,
          userName,
          "updated",
          `Approved Amount: ${expense.approved_amount}`,
          `Approved Amount: ${roundedApprovedAmount}`
        );
      }

      // Log receipt change
      if (receiptFile) {
        const oldReceipt =
          expense.receipt?.filename ||
          (expense.receipt?.path ? expense.receipt.path.split("/").pop() : "None");
        await expenseHistory.addEntry(
          expenseId,
          session.user.id,
          userName,
          "updated",
          `Receipt: ${oldReceipt}`,
          `Receipt: ${receiptFile.name}`
        );
      }

      // Resolve updated project_of_expense and expense_credit_person
      const updatedProjectOfExpense =
        formData.project_of_expense ||
        formData["Project of Expense"] ||
        formData.location_of_expense ||
        formData["Location of Expense"] ||
        formData.location ||
        null;

      const updatedExpenseCreditPerson =
        formData.expense_credit_person ||
        formData["Expense Credit Person"] ||
        null;

      // Prepare updates payload
      const updates: any = {
        expense_type: formData.expense_type,
        amount: roundedAmount,
        approved_amount: roundedApprovedAmount,
        date: formData.date,
        location: updatedProjectOfExpense,
        event_id: formData.event_id || expense.event_id || null,
        expense_credit_person: updatedExpenseCreditPerson,
        custom_fields: {},
      };

      // Add custom fields
      Object.entries(formData).forEach(([key, value]) => {
        if (
          key !== "expense_type" &&
          key !== "amount" &&
          key !== "approved_amount" &&
          key !== "date" &&
          key !== "event_id"
        ) {
          const normalizedKey = key.replace(/_/g, " ").toLowerCase();
          if (
            normalizedKey !== "location" &&
            normalizedKey !== "location of expense" &&
            normalizedKey !== "location_of_expense" &&
            !approverRelatedKeys.includes(normalizedKey) &&
            !approverRelatedKeys.includes(key.toLowerCase())
          ) {
            updates.custom_fields[key] = value;
          }
        }
      });

      if (expense.custom_fields?.approver_name) {
        updates.custom_fields.approver_name = expense.custom_fields.approver_name;
      }
      if (updatedProjectOfExpense !== null) {
        updates.custom_fields.project_of_expense = updatedProjectOfExpense;
      }
      if (updatedExpenseCreditPerson !== null) {
        updates.custom_fields.expense_credit_person = updatedExpenseCreditPerson;
      }

      // Preserve internal advance & metadata fields
      Object.keys(expense.custom_fields || {}).forEach((k) => {
        const norm = k.replace(/[\s_-]+/g, "").toLowerCase();
        if (
          [
            "markedasadvance",
            "markedasadvanceat",
            "originalserialnumber",
            "originalsno",
            "originalserialno",
            "serialnumber",
            "sno",
          ].includes(norm)
        ) {
          updates.custom_fields[k] = expense.custom_fields[k];
        }
      });

      // Update expense in Supabase
      const { error } = await expenses.update(
        expenseId,
        updates,
        receiptFile || undefined
      );

      if (error) {
        throw error;
      }

      toast.success("Expense updated successfully");
      router.push(getBackUrl());
    } catch (error: any) {
      console.error("Error updating expense from records:", error);
      toast.error("Failed to update expense", {
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!expense) {
    return <div className="p-6 text-red-600">Expense not found</div>;
  }

  const isDirectPayment =
    String(expense?.unique_id || "")
      .trim()
      .toLowerCase()
      .includes("direct payment") ||
    String(expense?.unique_id || "")
      .trim()
      .toLowerCase()
      .includes("direct payment unique id");

  // Project key
  const projectOfExpenseEntry = expense?.custom_fields
    ? Object.entries(expense.custom_fields).find(([key]) => {
        const normalizedKey = key.replace(/_/g, " ").toLowerCase();
        return (
          normalizedKey === "location" ||
          normalizedKey === "location of expense" ||
          normalizedKey === "location_of_expense" ||
          normalizedKey === "project of expense"
        );
      })
    : undefined;
  const projectKey = projectOfExpenseEntry
    ? projectOfExpenseEntry[0]
    : "project_of_expense";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <Button
          variant="link"
          onClick={() => router.push(getBackUrl())}
          className="p-0 h-auto text-sm cursor-pointer inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Records
        </Button>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleSubmit}
            disabled={saving || isReceiptProcessing}
            className="flex items-center gap-2 cursor-pointer"
          >
            {saving ? (
              <>
                <Spinner className="h-4 w-4" />
                Saving...
              </>
            ) : isReceiptProcessing ? (
              <>
                <Spinner className="h-4 w-4" />
                Merging Receipt...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-muted-foreground" />
            <CardTitle>Edit Expense (Records)</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Event Name</Label>
                {eventsList.length > 0 ? (
                  <Select
                    value={formData.event_id || ""}
                    onValueChange={(val: string) => handleInputChange("event_id", val)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select Event" />
                    </SelectTrigger>
                    <SelectContent>
                      {eventsList.map((ev) => (
                        <SelectItem key={ev.id} value={ev.id}>
                          {ev.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={eventTitle || "N/A"}
                    readOnly
                    className="text-foreground font-medium"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label>Payment Unique ID</Label>
                <Input
                  value={expense.unique_id || expense.id || "N/A"}
                  readOnly
                  className="text-foreground font-mono"
                />
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Input
                  value={
                    expense.status
                      ? expense.status.charAt(0).toUpperCase() +
                        expense.status.slice(1).replace("_", " ")
                      : "N/A"
                  }
                  readOnly
                  className="text-foreground font-medium"
                />
              </div>

              <div className="space-y-2">
                <Label>Approver</Label>
                <Input
                  value={expense.approver?.full_name || "—"}
                  readOnly
                  className="text-foreground font-medium"
                />
              </div>

              {projectKey && (
                <div className="space-y-2">
                  <Label htmlFor={projectKey}>Project of Expense</Label>
                  {locationOptions.length > 0 ? (
                    <Select
                      value={formData[projectKey] || formData.project_of_expense || ""}
                      onValueChange={(val: string) => handleInputChange(projectKey, val)}
                    >
                      <SelectTrigger id={projectKey} className="w-full">
                        <SelectValue placeholder="Select Project of Expense" />
                      </SelectTrigger>
                      <SelectContent>
                        {locationOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={projectKey}
                      value={formData[projectKey] || formData.project_of_expense || ""}
                      onChange={(e) => handleInputChange(projectKey, e.target.value)}
                    />
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="expense_type">Expense Type</Label>
                {expenseTypeOptions.length > 0 ? (
                  <Select
                    value={formData.expense_type || ""}
                    onValueChange={(value: string) =>
                      handleInputChange("expense_type", value)
                    }
                  >
                    <SelectTrigger id="expense_type" className="w-full">
                      <SelectValue placeholder="Select expense type" />
                    </SelectTrigger>
                    <SelectContent>
                      {expenseTypeOptions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="expense_type"
                    value={formData.expense_type || ""}
                    onChange={(e) =>
                      handleInputChange("expense_type", e.target.value)
                    }
                    required
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="amount">Invoice Amount (₹)</Label>
                <Input
                  id="amount"
                  type="number"
                  step="1"
                  value={formData.amount ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      handleInputChange("amount", "");
                    } else {
                      const parsed = parseFloat(val);
                      handleInputChange("amount", isNaN(parsed) ? "" : parsed);
                    }
                  }}
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val !== "") {
                      const parsed = parseFloat(val);
                      if (!isNaN(parsed)) {
                        const rounded = Math.round(parsed);
                        if (rounded !== parsed) {
                          handleInputChange("amount", rounded);
                          toast.success(`Amount rounded off: ₹${parsed} → ₹${rounded}`);
                        }
                      }
                    }
                  }}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="approved_amount">Approved Amount (₹)</Label>
                <Input
                  id="approved_amount"
                  type="number"
                  step="1"
                  value={formData.approved_amount ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      handleInputChange("approved_amount", "");
                    } else {
                      const parsed = parseFloat(val);
                      handleInputChange("approved_amount", isNaN(parsed) ? "" : parsed);
                    }
                  }}
                  onBlur={(e) => {
                    const val = e.target.value;
                    if (val !== "") {
                      const parsed = parseFloat(val);
                      if (!isNaN(parsed)) {
                        const rounded = Math.round(parsed);
                        if (rounded !== parsed) {
                          handleInputChange("approved_amount", rounded);
                        }
                      }
                    }
                  }}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date || ""}
                  onChange={(e) => handleInputChange("date", e.target.value)}
                  className="block w-full"
                  required
                />
              </div>

              {/* Direct Payment: Expense Credit Person */}
              {isDirectPayment && (
                <div className="space-y-2">
                  <Label htmlFor="expense_credit_person">Expense Credit Person</Label>
                  {expenseCreditPersonOptions.length > 0 ? (
                    <Select
                      value={formData.expense_credit_person || ""}
                      onValueChange={(val: string) =>
                        handleInputChange("expense_credit_person", val)
                      }
                    >
                      <SelectTrigger id="expense_credit_person" className="w-full">
                        <SelectValue placeholder="Select Expense Credit Person" />
                      </SelectTrigger>
                      <SelectContent>
                        {expenseCreditPersonOptions.map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="expense_credit_person"
                      value={formData.expense_credit_person || ""}
                      onChange={(e) =>
                        handleInputChange("expense_credit_person", e.target.value)
                      }
                    />
                  )}
                </div>
              )}
            </div>

            {/* Custom fields & Description */}
            {Object.entries(expense.custom_fields || {})
              .filter(([key]) => !isExcludedCustomField(key))
              .map(([key]) => {
                const normalizedKey = key.replace(/_/g, " ").toLowerCase();
                return (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={key}>{getDisplayFieldLabel(key)}</Label>
                    {normalizedKey === "description" ? (
                      <Textarea
                        id={key}
                        value={formData[key] || ""}
                        onChange={(e) => handleInputChange(key, e.target.value)}
                        className="min-h-[70px]"
                      />
                    ) : (
                      <Input
                        id={key}
                        value={formData[key] || ""}
                        onChange={(e) => handleInputChange(key, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}

            {/* If description wasn't in custom_fields, still provide a description input */}
            {!Object.keys(expense.custom_fields || {}).some(
              (k) => k.replace(/_/g, " ").toLowerCase() === "description"
            ) && (
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description || ""}
                  onChange={(e) => handleInputChange("description", e.target.value)}
                  placeholder="Expense description..."
                  className="min-h-[70px]"
                />
              </div>
            )}

            {/* Receipt Upload / Replace Section (Only if no voucher exists) */}
            {!hasVoucher && (
              <div className="space-y-3 pt-2 border-t">
                <div>
                  <Label htmlFor="receipt" className="text-base font-semibold">
                    Replace Receipt / Bill
                  </Label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Upload new bills/receipts. Multiple files will be merged automatically into a single PDF.
                  </p>
                </div>
                <div>
                  <Input
                    id="receipt"
                    type="file"
                    multiple
                    accept="image/*,application/pdf"
                    onChange={handleFileChange}
                    disabled={isReceiptProcessing}
                  />
                  <div className="text-sm text-gray-500 mt-1 flex items-center justify-between">
                    <span>
                      {receiptFile
                        ? receiptFile.name
                        : expense.receipt
                        ? `Current receipt: ${expense.receipt.filename || "Uploaded receipt"}`
                        : "No file chosen"}
                    </span>
                    {isReceiptProcessing ? (
                      <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" /> Merging into PDF...
                      </span>
                    ) : receiptFile ? (
                      <span className="text-xs text-emerald-600 font-medium">
                        PDF Ready
                      </span>
                    ) : null}
                  </div>
                </div>

                {receiptFile && receiptPreview && (
                  <div className="mt-2.5">
                    <div className="p-3 bg-gray-50 rounded-md border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                      <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
                        <FileText className="w-4 h-4 text-red-500 shrink-0" />
                        <p className="text-sm text-gray-700 font-medium truncate">
                          {receiptFile.name}
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
                              url: receiptPreview,
                              title: receiptFile.name || "Receipt PDF Preview",
                              pageImages: receiptPageImages,
                            })
                          }
                          className="text-xs h-7 px-2.5 text-blue-600 border-blue-200 hover:bg-blue-50 cursor-pointer"
                        >
                          Preview & Verify PDF
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleClearReceipt}
                          className="text-xs h-7 px-2 text-red-600 border border-red-300 cursor-pointer"
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Current/New Receipt Preview */}
      {(receiptPreview || expense.receipt) && !hasVoucher && (
        <ReceiptPreview
          expense={expense}
          previewUrl={receiptPreview}
          filename={receiptFile?.name}
          defaultOpen={true}
        />
      )}

      {/* Voucher Preview & Edit */}
      {hasVoucher && (
        <VoucherPreview
          expense={expense}
          expenseId={expenseId}
          defaultOpen={true}
          defaultEditMode={true}
          onEditingChange={setIsVoucherEditing}
        />
      )}

      {/* Merged Receipt PDF Preview Modal */}
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
                    ? `${previewPdfModal.pageImages.length} page${
                        previewPdfModal.pageImages.length > 1 ? "s" : ""
                      } in merged PDF`
                    : "Verify all pages of your merged receipt PDF before saving."}
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
                    <span>
                      Page {idx + 1} of {previewPdfModal.pageImages?.length}
                    </span>
                  </div>
                  <img
                    src={imgSrc}
                    alt={`Receipt page ${idx + 1}`}
                    className="max-w-full h-auto object-contain rounded"
                  />
                </div>
              ))
            ) : (
              <div className="w-full h-[60vh] bg-white rounded border overflow-hidden">
                <iframe
                  src={`${previewPdfModal.url}#toolbar=0&navpanes=0&scrollbar=1`}
                  className="w-full h-full border-0"
                  title="Receipt PDF Preview"
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
