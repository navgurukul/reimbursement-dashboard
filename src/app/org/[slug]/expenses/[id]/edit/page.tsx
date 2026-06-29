"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { orgSettings, expenses, expenseHistory, vouchers, organizations, profiles } from "@/lib/db";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Save, Upload, X } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import supabase from "@/lib/supabase";
import ReceiptPreview from "@/components/ReceiptPreview";
import VoucherPreview from "@/components/VoucherPreview";

function SearchableDropdown({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
}: {
  options: string[];
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  searchPlaceholder: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const filtered = options.filter((opt) =>
    opt.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="space-y-2">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="h-9 w-full justify-between font-normal text-left px-3">
            <span className="truncate">
              {value || placeholder}
            </span>
            <span className="text-muted-foreground opacity-50">▾</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="p-2"
          align="start"
          style={{ width: "var(--radix-dropdown-menu-trigger-width)" }}
        >
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder={searchPlaceholder}
            className="h-9 mb-2"
          />
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">
                No options found
              </p>
            ) : (
              filtered.map((opt) => (
                <DropdownMenuItem
                  key={opt}
                  onSelect={(e) => {
                    e.preventDefault();
                    onChange(opt);
                    setOpen(false);
                    setQuery("");
                  }}
                  className="cursor-pointer"
                >
                  <span>{opt}</span>
                </DropdownMenuItem>
              ))
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function EditExpensePage() {
  const router = useRouter();
  const params = useParams();
  const { organization, userRole } = useOrgStore();
  const orgId = organization?.id!;
  const expenseId = params.id as string;
  const slug = params.slug as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expense, setExpense] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [columns, setColumns] = useState<any[]>([]);
  const [expenseTypeOptions, setExpenseTypeOptions] = useState<string[]>([]);
  const [locationOptions, setLocationOptions] = useState<string[]>([]);
  const [expenseCreditPersonOptions, setExpenseCreditPersonOptions] = useState<string[]>([]);
  const [hasVoucher, setHasVoucher] = useState(false);
  const [locationApproverMapping, setLocationApproverMapping] = useState<any[]>([]);
  const [expenseTypeApproverMapping, setExpenseTypeApproverMapping] = useState<any[]>([]);
  const [approverOptions, setApproverOptions] = useState<Array<{ value: string; label: string }>>([]);

  const getDisplayFieldLabel = (key: string) => {
    const labelMap: Record<string, string> = {
      description: "Description",
      approver_name: "Approver Name",
      location_of_expense: "Project of Expense",
      expense_credit_person: "Expense Credit Person",
    };

    return labelMap[key] || key;
  };

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch expense data
        const { data, error } = await expenses.getById(expenseId);
        if (error) {
          toast.error("Failed to load expense", {
            description: error.message,
          });
          router.push(`/org/${slug}/expenses`);
          return;
        }
        setExpense(data);
        setFormData({
          expense_type: data.expense_type,
          amount: data.amount,
          date: new Date(data.date).toISOString().split("T")[0],
          ...data.custom_fields,
          approver: data.approver_id || data.custom_fields?.approver || "",
          approver_name:
            data.custom_fields?.approver_name ||
            data.approver?.full_name ||
            "",
        });

        // Check if expense has voucher
        const { data: voucherData } = await vouchers.getByExpenseId(expenseId);
        setHasVoucher(!!voucherData);

        // Fetch organization settings for dropdowns
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

          if (settings.expense_type_approver_mapping && Array.isArray(settings.expense_type_approver_mapping)) {
            setExpenseTypeApproverMapping(settings.expense_type_approver_mapping);
          }
          if (settings.location_approver_mapping && Array.isArray(settings.location_approver_mapping)) {
            setLocationApproverMapping(settings.location_approver_mapping);
          }

          // Fetch organization members to populate approver names
          const { data: membersData } = await organizations.getOrganizationMembers(orgId);
          if (membersData) {
            const approvers = membersData.filter((member) =>
              ["owner", "admin", "manager"].includes(member.role)
            );
            const { data: profilesData } = await profiles.getByIds(
              approvers.map((a) => a.user_id)
            );
            const approverNamesMap = new Map(
              profilesData?.map((p) => [
                p.user_id,
                p.full_name || p.email,
              ]) || []
            );
            const mappedOptions = approvers.map((a) => ({
              value: a.user_id,
              label: approverNamesMap.get(a.user_id) || a.user_id,
            }));
            setApproverOptions(mappedOptions);
          }

          // Extract location options
          const locationCol = settings.expense_columns.find(
            (col: any) =>
              col.key === "location" ||
              col.key === "location_of_expense" ||
              col.key === "project_of_expense" ||
              col.label?.trim().toLowerCase() === "project of expense"
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
      } catch (error) {
        console.error("Error fetching expense:", error);
        toast.error("An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [expenseId, router, slug, orgId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setReceiptFile(file);

    // Create preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setReceiptPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const getApproverOptionLabel = useCallback(
    (value?: string) => {
      if (!value) return "";
      const option = approverOptions.find((opt) => opt.value === value);
      if (option) return option.label;
      const approverCol = columns.find((c) => c.key === "approver");
      const opts = (approverCol?.options || []) as Array<
        string | { value: string; label: string }
      >;
      const opt = opts.find((o) =>
        (typeof o === "string" ? o : o.value) === value
      );
      if (!opt) return "";
      return typeof opt === "string" ? opt : opt.label || opt.value;
    },
    [approverOptions, columns]
  );

  const getApproverDropdownOptions = useCallback(() => {
    const locationFieldKeyMatch = Object.keys(expense?.custom_fields || {}).find((key) => {
      const normalizedKey = key.replace(/_/g, " ").toLowerCase();
      return (
        normalizedKey === "location" ||
        normalizedKey === "location of expense" ||
        normalizedKey === "location_of_expense" ||
        normalizedKey === "project of expense" ||
        normalizedKey === "project_of_expense"
      );
    });

    const selectedLocation = locationFieldKeyMatch
      ? typeof formData[locationFieldKeyMatch] === "string"
        ? formData[locationFieldKeyMatch]
        : ""
      : "";
    const selectedExpenseType =
      typeof formData.expense_type === "string" ? formData.expense_type : "";

    const approverCol = columns.find((c) => c.key === "approver");
    const allOptions = (approverCol?.options || approverOptions) as Array<
      string | { value: string; label: string }
    >;

    const normalizeIds = (value?: string | string[]) => {
      if (!value) return [] as string[];
      return Array.isArray(value)
        ? value.filter((v) => v && v.trim())
        : value.trim()
          ? [value]
          : [];
    };

    const normalizeNames = (value?: string | string[]) => {
      if (!value) return [] as string[];
      if (Array.isArray(value)) return value.filter((v) => v && v.trim());
      return value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    };

    const resolveIdsFromNames = (value?: string | string[]) => {
      const names = normalizeNames(value);
      if (!names.length) return [] as string[];

      const mapByLabel = new Map<string, string>();
      allOptions.forEach((option) => {
        const optValue = typeof option === "string" ? option : option.value;
        const optLabel = typeof option === "string" ? option : option.label;
        mapByLabel.set(optLabel.toLowerCase(), optValue);
      });
      approverOptions.forEach((option) => {
        mapByLabel.set(option.label.toLowerCase(), option.value);
      });

      return names
        .map((name) => mapByLabel.get(name.toLowerCase()))
        .filter((v): v is string => Boolean(v));
    };

    const expenseTypeEntry =
      selectedExpenseType && expenseTypeApproverMapping?.length
        ? expenseTypeApproverMapping.find(
          (m) => {
            if (Array.isArray(m.expense_type)) {
              return m.expense_type.includes(selectedExpenseType);
            }
            return m.expense_type === selectedExpenseType;
          }
        )
        : undefined;

    let locationEntry: any = undefined;
    if (selectedLocation && locationApproverMapping?.length) {
      const candidates = locationApproverMapping.filter((m) =>
        Array.isArray(m.location)
          ? m.location.includes(selectedLocation)
          : m.location === selectedLocation
      );

      if (candidates.length) {
        if (selectedExpenseType) {
          locationEntry =
            candidates.find(
              (m) =>
                (typeof m.expense_type === "string" &&
                m.expense_type === selectedExpenseType) ||
                (Array.isArray(m.expense_type) &&
                m.expense_type.includes(selectedExpenseType))
            ) || locationEntry;
        }

        if (!locationEntry) {
          locationEntry =
            candidates.find(
              (m) =>
                m.expense_type === undefined ||
                (typeof m.expense_type === "string" &&
                  m.expense_type.trim() === "") ||
                (Array.isArray(m.expense_type) &&
                  m.expense_type.length === 0)
            ) || candidates[0];
        }
      }
    }

    const effectiveExpenseTypeEntry =
      expenseTypeEntry && expenseTypeEntry.enabled !== false
        ? expenseTypeEntry
        : undefined;
    const effectiveLocationEntry =
      locationEntry && locationEntry.enabled !== false
        ? locationEntry
        : undefined;

    const activeEntry = effectiveLocationEntry || effectiveExpenseTypeEntry;

    const mappedIds = activeEntry
      ? Array.from(
        new Set([
          ...(normalizeIds(activeEntry.approver_id).length
            ? normalizeIds(activeEntry.approver_id)
            : resolveIdsFromNames(activeEntry.approver_name)),
          ...(normalizeIds(activeEntry.second_approver_id).length
            ? normalizeIds(activeEntry.second_approver_id)
            : resolveIdsFromNames(activeEntry.second_approver_name)),
        ])
      )
      : [];

    const optionLookup = new Map<string, { value: string; label: string }>();
    allOptions.forEach((option) => {
      const value = typeof option === "string" ? option : option.value;
      const label = typeof option === "string" ? option : option.label;
      optionLookup.set(value, { value, label });
    });
    approverOptions.forEach((option) => {
      optionLookup.set(option.value, option);
    });

    const options = mappedIds.map((id) => {
      const mapped = optionLookup.get(id);
      if (mapped) return mapped;
      return { value: id, label: getApproverOptionLabel(id) || id };
    });

    const addFallbackOption = (id?: string, name?: string) => {
      if (!id || options.some((opt) => opt.value === id)) return;
      options.push({
        value: id,
        label: name || getApproverOptionLabel(id) || id,
      });
    };

    addFallbackOption(
      typeof formData.approver === "string" ? formData.approver : "",
      typeof formData.approver_name === "string" ? formData.approver_name : ""
    );
    addFallbackOption(
      typeof formData.second_approver_id === "string"
        ? formData.second_approver_id
        : "",
      typeof formData.second_approver_name === "string"
        ? formData.second_approver_name
        : ""
    );

    return options;
  }, [
    expense,
    formData,
    columns,
    approverOptions,
    locationApproverMapping,
    expenseTypeApproverMapping,
    getApproverOptionLabel,
  ]);

  const handleInputChange = (
    key: string,
    value: string | number | boolean | string[]
  ) => {
    setFormData((prev) => {
      const next = {
        ...prev,
        [key]: value,
      };

      if (key === "approver" && typeof value === "string") {
        next.approver_name = getApproverOptionLabel(value);
      }

      // Clear approvers so the auto-fill effect can take over
      const locationFieldKeyMatch = Object.keys(expense?.custom_fields || {}).find((k) => {
        const normalizedKey = k.replace(/_/g, " ").toLowerCase();
        return (
          normalizedKey === "location" ||
          normalizedKey === "location of expense" ||
          normalizedKey === "location_of_expense" ||
          normalizedKey === "project of expense" ||
          normalizedKey === "project_of_expense"
        );
      });

      if (key === "expense_type" || (locationFieldKeyMatch && key === locationFieldKeyMatch)) {
        next.approver = "";
        next.approver_name = "";
        next.second_approver_id = "";
        next.second_approver_name = "";
      }

      return next;
    });
  };

  useEffect(() => {
    if (!expense) return;
    const locationFieldKeyMatch = Object.keys(expense.custom_fields || {}).find((key) => {
      const normalizedKey = key.replace(/_/g, " ").toLowerCase();
      return (
        normalizedKey === "location" ||
        normalizedKey === "location of expense" ||
        normalizedKey === "location_of_expense" ||
        normalizedKey === "project of expense" ||
        normalizedKey === "project_of_expense"
      );
    });

    const selectedLocation = locationFieldKeyMatch ? (typeof formData[locationFieldKeyMatch] === "string" ? formData[locationFieldKeyMatch] : "") : "";
    const selectedExpenseType = typeof formData.expense_type === "string" ? formData.expense_type : "";

    if (!selectedLocation && !selectedExpenseType) return;

    // 1) Try expense-type specific mapping first (global, not tied to location)
    const expenseTypeEntry =
      selectedExpenseType && expenseTypeApproverMapping?.length
        ? expenseTypeApproverMapping.find(
          (m) => {
            if (Array.isArray(m.expense_type)) {
              return m.expense_type.includes(selectedExpenseType);
            }
            return m.expense_type === selectedExpenseType;
          }
        )
        : undefined;

    // 2) Then look for location-based mappings.
    let locationEntry: any = undefined;
    if (selectedLocation && locationApproverMapping?.length) {
      const candidates = locationApproverMapping.filter(
        (m) => m.location === selectedLocation
      );

      if (candidates.length) {
        if (selectedExpenseType) {
          locationEntry =
            candidates.find(
              (m) =>
                (typeof m.expense_type === "string" &&
                m.expense_type === selectedExpenseType) ||
                (Array.isArray(m.expense_type) &&
                m.expense_type.includes(selectedExpenseType))
            ) || locationEntry;
        }

        if (!locationEntry) {
          locationEntry =
            candidates.find(
              (m) =>
                m.expense_type === undefined ||
                (typeof m.expense_type === "string" &&
                  m.expense_type.trim() === "") ||
                (Array.isArray(m.expense_type) &&
                  m.expense_type.length === 0)
            ) || candidates[0];
        }
      }
    }

    const effectiveExpenseTypeEntry =
      expenseTypeEntry && expenseTypeEntry.enabled !== false
        ? expenseTypeEntry
        : undefined;
    const effectiveLocationEntry =
      locationEntry && locationEntry.enabled !== false
        ? locationEntry
        : undefined;

    // Make Location mapping take precedence over Expense Type mapping
    const activeEntry = effectiveLocationEntry || effectiveExpenseTypeEntry;

    const getFirst = (val: string | string[] | undefined) => {
      if (!val) return "";
      if (Array.isArray(val)) return val[0] || "";
      const parts = val.split(",").map(v => v.trim()).filter(Boolean);
      return parts[0] || "";
    };

    const getApproverName = (id: string) => {
      if (!id) return "";
      const option = approverOptions.find(opt => opt.value === id);
      return option ? option.label : id;
    };

    const nextApproverId = getFirst(activeEntry?.approver_id);
    const nextSecondId = getFirst(activeEntry?.second_approver_id);
    const nextApproverName = getApproverName(nextApproverId);
    const nextSecondName = getApproverName(nextSecondId);

    setFormData((prev) => {
      if (prev.approver) {
        if (
          prev.second_approver_name === nextSecondName &&
          prev.second_approver_id === nextSecondId
        ) {
          return prev;
        }
        return {
          ...prev,
          second_approver_id: nextSecondId,
          second_approver_name: nextSecondName,
        };
      }

      if (
        prev.approver_name === nextApproverName &&
        prev.second_approver_name === nextSecondName &&
        prev.approver === nextApproverId &&
        prev.second_approver_id === nextSecondId
      ) {
        return prev;
      }
      return {
        ...prev,
        approver: nextApproverId,
        approver_name: nextApproverName,
        second_approver_id: nextSecondId,
        second_approver_name: nextSecondName,
      };
    });

  }, [
    formData.expense_type,
    expense,
    locationApproverMapping,
    expenseTypeApproverMapping,
    approverOptions,
    // Using stringified formData custom fields would be safer, but relying on expense_type and location value is enough:
    Object.keys(expense?.custom_fields || {}).map(k => formData[k]).join('|'),
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      // Get current user from Supabase
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        throw new Error("User not authenticated. Please log in again.");
      }

      // Get username for history entries using improved extraction
      try {
        const authRaw = localStorage.getItem('auth-storage');
        const authStorage = JSON.parse(authRaw || '{}');

        // Try multiple paths and nested data
        let userName = "Unknown User";

        if (authStorage?.state?.user?.profile?.full_name) {
          userName = authStorage.state.user.profile.full_name;
        } else if (typeof authRaw === 'string' && authRaw.includes('full_name')) {
          // Fallback - try to extract from the raw string if JSON parsing doesn't get the nested structure
          const match = authRaw.match(/"full_name":\s*"([^"]+)"/);
          if (match && match[1]) {
            userName = match[1];
          }
        }

        // Check what fields have changed
        if (expense.expense_type !== formData.expense_type) {
          // Log expense type change
          await expenseHistory.addEntry(
            expenseId,
            session.user.id,
            userName,
            'updated',
            expense.expense_type,
            formData.expense_type
          );
        }

        if (expense.amount !== parseFloat(formData.amount)) {
          // Log amount change
          await expenseHistory.addEntry(
            expenseId,
            session.user.id,
            userName,
            'updated',
            expense.amount.toString(),
            formData.amount.toString()
          );
        }

        // Add custom fields
        Object.entries(formData).forEach(([key, value]) => {
          if (key !== "expense_type" && key !== "amount" && key !== "date") {
            // Log changes to custom fields if they're different
            if (expense.custom_fields[key] !== value) {
              expenseHistory.addEntry(
                expenseId,
                session.user.id,
                userName,
                'updated',
                expense.custom_fields[key]?.toString() || '',
                value?.toString() || ''
              ).catch(err => console.error("Error logging field update:", err));
            }
          }
        });
      } catch (error) {
        console.error('Error extracting username from localStorage:', error);
        // If username extraction fails, still update the expense without history entries
      }

      // Prepare expense data
      const updates: any = {
        expense_type: formData.expense_type,
        amount: parseFloat(formData.amount),
        date: formData.date,
        custom_fields: {},
      };

      // Add custom fields
      Object.entries(formData).forEach(([key, value]) => {
        if (key !== "expense_type" && key !== "amount" && key !== "date") {
          if (key === "approver") {
            updates.approver_id = value;
          } else {
            updates.custom_fields[key] = value;
          }
        }
      });

      // Update expense with receipt if provided
      const { error } = await expenses.update(
        expenseId,
        updates,
        receiptFile || undefined
      );

      if (error) {
        throw error;
      }

      toast.success("Expense updated successfully");
      router.push(`/org/${slug}/expenses/${expenseId}`);
    } catch (error: any) {
      console.error("Error updating expense:", error);
      toast.error("Failed to update expense", {
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  }
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!expense) {
    return null;
  }

  const locationFieldKey = Object.keys(expense.custom_fields || {}).find((key) => {
    const normalizedKey = key.replace(/_/g, " ").toLowerCase();
    return (
      normalizedKey === "location" ||
      normalizedKey === "location of expense" ||
      normalizedKey === "location_of_expense" ||
      normalizedKey === "project of expense" ||
      normalizedKey === "project_of_expense"
    );
  });

  const hasDirectPaymentUniqueId = String(expense?.unique_id || "")
    .trim()
    .toLowerCase()
    .includes("direct payment unique id") ||
    String(expense?.unique_id || "")
      .trim()
      .toLowerCase()
      .includes("direct payment");

  const approverDropdownOptions = getApproverDropdownOptions();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button
          variant="link"
          onClick={() => router.push(`/org/${slug}/expenses/${expenseId}`)}
        >
          <ArrowLeft />
          Back to Expense
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? (
            <>
              <Spinner className="mr-2 h-4 w-4" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Changes
            </>
          )}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Edit Expense</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {locationFieldKey && (
                <div className="space-y-2 col-span-2">
                  <Label htmlFor={locationFieldKey}>Project of Expense</Label>
                  {locationOptions.length > 0 ? (
                    <SearchableDropdown
                      options={locationOptions}
                      value={formData[locationFieldKey] || ""}
                      onChange={(value) => handleInputChange(locationFieldKey, value)}
                      placeholder="Select location"
                      searchPlaceholder="Search project..."
                    />
                  ) : (
                    <Input
                      id={locationFieldKey}
                      value={formData[locationFieldKey] || ""}
                      onChange={(e) =>
                        handleInputChange(locationFieldKey, e.target.value)
                      }
                    />
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="expense_type">Expense Type</Label>
                {expenseTypeOptions.length > 0 ? (
                  <SearchableDropdown
                    options={expenseTypeOptions}
                    value={formData.expense_type || ""}
                    onChange={(value) => handleInputChange("expense_type", value)}
                    placeholder="Select expense type"
                    searchPlaceholder="Search expense type..."
                  />
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
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  value={formData.amount || ""}
                  onChange={(e) =>
                    handleInputChange("amount", parseFloat(e.target.value))
                  }
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date || ""}
                  className="relative w-full overflow-hidden pr-10 [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-3 [&::-webkit-calendar-picker-indicator]:left-auto [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                  onChange={(e) => handleInputChange("date", e.target.value)}
                  required
                />
              </div>

              {approverDropdownOptions.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="approver">Approver</Label>
                  <Select
                    value={formData.approver || ""}
                    onValueChange={(value: string) =>
                      handleInputChange("approver", value)
                    }
                  >
                    <SelectTrigger id="approver" className="w-full">
                      <SelectValue placeholder="Select approver" />
                    </SelectTrigger>
                    <SelectContent>
                      {approverDropdownOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {/* Custom fields */}
            {Object.entries(expense.custom_fields).map(([key, value]) => {
              if (
                key === "approver_name" ||
                key === "second_approver_id" ||
                key === "second_approver_name" ||
                key === locationFieldKey
              ) {
                return null;
              }

              // Check if this field is location_of_expense and has options
              const normalizedKey = key.replace(/_/g, " ").toLowerCase();
              const isDescriptionField = normalizedKey === "description";
              const fieldLabel = isDescriptionField ? "Description" : key;
              const isLocationField =
                normalizedKey === "location" ||
                normalizedKey === "location of expense" ||
                normalizedKey === "location_of_expense" ||
                normalizedKey === "project of expense" ||
                normalizedKey === "project_of_expense";
              const isExpenseCreditPersonField =
                normalizedKey === "expense credit person" ||
                key.toLowerCase() === "expense_credit_person";

              if (isExpenseCreditPersonField && !hasDirectPaymentUniqueId) {
                return null;
              }

              const hasLocationOptions = isLocationField && locationOptions.length > 0;
              const hasExpenseCreditPersonOptions =
                isExpenseCreditPersonField && expenseCreditPersonOptions.length > 0;
              const dropdownOptions = hasLocationOptions
                ? locationOptions
                : expenseCreditPersonOptions;

              return (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{getDisplayFieldLabel(key)}</Label>
                  {hasLocationOptions || hasExpenseCreditPersonOptions ? (
                    <Select
                      value={formData[key] || ""}
                      onValueChange={(value: string) =>
                        handleInputChange(key, value)
                      }
                    >
                      <SelectTrigger id={key} className="w-full">
                        <SelectValue placeholder={`Select ${getDisplayFieldLabel(key)}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {dropdownOptions.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : isDescriptionField ? (
                    <Textarea
                      id={key}
                      value={formData[key] || ""}
                      onChange={(e) => handleInputChange(key, e.target.value)}
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

            {/* Receipt upload section - only show if no voucher exists */}
            {!hasVoucher && (
              <div className="space-y-2">
                <Label htmlFor="receipt">Receipt</Label>
                <div className="flex items-center space-x-2">
                  <Input
                    id="receipt"
                    type="file"
                    onChange={handleFileChange}
                    accept="image/*,.pdf"
                  />
                  {receiptFile && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setReceiptFile(null);
                        setReceiptPreview(null);
                      }}
                    >
                      <X className="mr-2 h-4 w-4" />
                      Clear
                    </Button>
                  )}
                </div>
                {receiptPreview && (
                  <div className="mt-2">
                    {receiptPreview.startsWith("data:image") ? (
                      <img
                        src={receiptPreview}
                        alt="Receipt preview"
                        className="max-h-40 rounded-md"
                      />
                    ) : (
                      <div className="p-2 border rounded-md">
                        <p className="text-sm">PDF receipt selected</p>
                      </div>
                    )}
                  </div>
                )}
                {expense.receipt && !receiptPreview && (
                  <div className="mt-2">
                    <p className="text-sm text-muted-foreground">
                      Current receipt: {expense.receipt.filename}
                    </p>
                  </div>
                )}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Current Receipt Preview - only show if expense has receipt */}
      {expense.receipt && !receiptFile && !hasVoucher && (
        <ReceiptPreview expense={expense} defaultOpen={true} />
      )}

      {/* Voucher Preview - only show if expense has voucher */}
      {hasVoucher && (
        <VoucherPreview expense={expense} expenseId={expenseId} defaultOpen={true} />
      )}
    </div>
  );
}
