// src/app/org/[slug]/settings/page.tsx
"use client";

import { useState, useEffect } from "react";
import { notFound, useRouter } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { orgSettings } from "@/lib/db";
import type {
  ColumnConfig as DbColumnConfig,
  ExpenseTypeApproverMappingEntry,
  LocationApproverMappingEntry,
} from "@/lib/db";
import supabase from "@/lib/supabase";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PlusCircle, Settings2, Trash2, Plus, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { organizations } from "@/lib/db";
import { profiles } from "@/lib/db";

interface ColumnConfig {
  key: string;
  label: string;
  type:
    | "text"
    | "number"
    | "date"
    | "dropdown"
    | "radio"
    | "checkbox"
    | "textarea"
    | "file";
  visible: boolean;
  options?: string[] | { value: string; label: string }[]; // For dropdown, radio, checkbox
  required?: boolean;
}

type ApproverOption = { value: string; label: string };

function MultiSelect({
  options,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
}: {
  options: ApproverOption[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  searchPlaceholder: string;
}) {
  const [query, setQuery] = useState("");
  const selected = new Set(value);
  const filtered = options.filter((opt) =>
    opt.label.toLowerCase().includes(query.trim().toLowerCase())
  );

  const toggleValue = (id: string) => {
    const next = selected.has(id)
      ? value.filter((v) => v !== id)
      : [...value, id];
    onChange(next);
  };

  const getLabel = (id: string) =>
    options.find((opt) => opt.value === id)?.label || id;

  return (
    <div className="space-y-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {value.map((id) => (
            <Badge key={id} variant="secondary" className="gap-1">
              <span>{getLabel(id)}</span>
              <button
                type="button"
                className="ml-1 inline-flex items-center justify-center rounded-full hover:text-destructive"
                aria-label={`Remove ${getLabel(id)}`}
                onClick={() => toggleValue(id)}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{placeholder}</p>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="h-9 w-full justify-between">
            <span className="truncate text-sm">
              {value.length > 0
                ? `${value.length} selected`
                : "Select users"}
            </span>
            <span className="text-muted-foreground">▾</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[280px] p-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-9"
          />
          <DropdownMenuSeparator className="my-2" />
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">
                No matching users
              </p>
            ) : (
              filtered.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onSelect={(e: Event) => e.preventDefault()}
                  className="cursor-pointer"
                  onClick={() => toggleValue(opt.value)}
                >
                  <Checkbox checked={selected.has(opt.value)} />
                  <span>{opt.label}</span>
                </DropdownMenuItem>
              ))
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export default function SettingsPage() {
  const { userRole } = useOrgStore();
  if (userRole !== "owner" && userRole !== "admin") {
    notFound();
  }

  const { organization } = useOrgStore();
  const orgId = organization?.id!;

  // Branding & Theming state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [primaryColor, setPrimaryColor] = useState("#2563eb");
  const [accentColor, setAccentColor] = useState("#f43f5e");

  // Column Configuration state
  const defaultColumns: DbColumnConfig[] = [
    { key: "date", label: "Date", type: "date", visible: true, required: true },
    {
      key: "category",
      label: "Category",
      type: "dropdown",
      visible: true,
      options: [],
      required: true,
    },
    {
      key: "amount",
      label: "Amount",
      type: "number",
      visible: true,
      required: true,
    },
    {
      key: "description",
      label: "Description",
      type: "textarea",
      visible: true,
      required: true,
    },
    {
      key: "receipt",
      label: "Receipt",
      type: "file",
      visible: true,
      required: true,
    },
    {
      key: "approver",
      label: "Approver",
      type: "dropdown",
      visible: true,
      options: [],
      required: true,
    },
  ];

  const [columns, setColumns] = useState<DbColumnConfig[]>(defaultColumns);
  const [editingColumn, setEditingColumn] = useState<DbColumnConfig | null>(
    null
  );
  const [showColumnDialog, setShowColumnDialog] = useState(false);
  const [newOptions, setNewOptions] = useState<string>("");
  const [approverOptions, setApproverOptions] = useState<ApproverOption[]>([]);

  // Expense type → approver mapping (approver + second approver per expense type)
  const [expenseTypeApproverMapping, setExpenseTypeApproverMapping] = useState<
    ExpenseTypeApproverMappingEntry[]
  >([]);
  const [savingExpenseTypeMapping, setSavingExpenseTypeMapping] =
    useState(false);

  // Location of expense → approver mapping (approver + second approver per location)
  const [locationApproverMapping, setLocationApproverMapping] = useState<
    LocationApproverMappingEntry[]
  >([]);
  const [savingLocationMapping, setSavingLocationMapping] = useState(false);

  // Preview uploaded logo
  useEffect(() => {
    if (!logoFile) return;
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  // Fetch existing settings from Supabase on mount
  useEffect(() => {
    async function fetchSettings() {
      if (!orgId) return;

      try {
        // Fetch organization settings
        const { data: settingsData, error: settingsError } =
          await orgSettings.getByOrgId(orgId);

        if (settingsError) {
          toast.error("Failed to load settings", {
            description: settingsError.message,
          });
          return;
        }

        if (settingsData) {
          // Set expense type → approver mapping
          if (
            settingsData.expense_type_approver_mapping &&
            Array.isArray(settingsData.expense_type_approver_mapping)
          ) {
            setExpenseTypeApproverMapping(
              settingsData.expense_type_approver_mapping
            );
          }

          // Set location → approver mapping
          if (
            settingsData.location_approver_mapping &&
            Array.isArray(settingsData.location_approver_mapping)
          ) {
            setLocationApproverMapping(
              settingsData.location_approver_mapping
            );
          }

          // Set branding settings
          if (settingsData.branding) {
            setPrimaryColor(settingsData.branding.primaryColor || "#2563eb");
            setAccentColor(settingsData.branding.accentColor || "#f43f5e");
            if (settingsData.branding.logoUrl) {
              setLogoPreview(settingsData.branding.logoUrl);
            }
          }

          // Set column settings
          if (
            settingsData.expense_columns &&
            settingsData.expense_columns.length > 0
          ) {
            // Process columns to ensure they have proper structure
            let processedColumns = settingsData.expense_columns.map((col) => {
              // Make sure options exist for appropriate column types
              if (
                ["dropdown", "radio", "checkbox"].includes(col.type) &&
                !col.options
              ) {
                return { ...col, options: [] };
              }
              return col;
            });

            // Ensure location column exists if not present
            const hasLocationColumn = processedColumns.some(
              (col) => col.key === "location"
            );
            if (!hasLocationColumn) {
              processedColumns.push({
                key: "location",
                label: "Location of Expense",
                type: "dropdown",
                visible: true,
                required: true,
                options: [],
              });
            }

            setColumns(processedColumns);
          } else {
            // If no columns exist, initialize with default columns plus location
            const initialColumns = [...defaultColumns];
            initialColumns.push({
              key: "location",
              label: "Location of Expense",
              type: "dropdown",
              visible: true,
              required: true,
              options: [],
            });
            setColumns(initialColumns);
          }
        }

        // Fetch organization members with appropriate roles for approvers
        const { data: membersData, error: membersError } =
          await organizations.getOrganizationMembers(orgId);

        if (membersError) {
          toast.error("Failed to load organization members", {
            description: membersError.message,
          });
          return;
        }

        if (membersData) {
          // Filter members with roles of owner, admin, or manager
          const approvers = membersData.filter((member) =>
            ["owner", "admin", "manager"].includes(member.role)
          );

          // Fetch profiles for all approvers
          const { data: profilesData, error: profilesError } =
            await profiles.getByIds(
              approvers.map((approver) => approver.user_id)
            );

          if (profilesError) {
            toast.error("Failed to load approver profiles", {
              description: profilesError.message,
            });
            return;
          }

          // Create a map of user_id to full_name
          const approverNames = new Map(
            profilesData?.map((profile) => [
              profile.user_id,
              profile.full_name || profile.email,
            ]) || []
          );

          const nextApproverOptions = approvers.map((approver) => ({
            value: approver.user_id,
            label: approverNames.get(approver.user_id) || approver.user_id,
          }));

          setApproverOptions(nextApproverOptions);

          // Update the approver column options
          setColumns((prevColumns) => {
            return prevColumns.map((col) => {
              if (col.key === "approver") {
                return {
                  ...col,
                  options: nextApproverOptions,
                };
              }
              return col;
            });
          });
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
        toast.error("An unexpected error occurred");
      }
    }

    fetchSettings();
  }, [orgId]);

  const handleSaveBranding = async () => {
    const toastId = toast.loading("Saving branding…");
    try {
      // 1) Upload logoFile to Storage if present
      let logoUrl = logoPreview;
      if (logoFile) {
        const { data: uploadData, error: uploadErr } = await supabase.storage
          .from("org-logos")
          .upload(`${orgId}/logo`, logoFile, { upsert: true });

        if (uploadErr) throw uploadErr;

        const {
          data: { publicUrl },
        } = supabase.storage.from("org-logos").getPublicUrl(uploadData.path);

        logoUrl = publicUrl;
      }

      // 2) Update branding settings
      const { error: updateErr } = await orgSettings.updateBranding(orgId, {
        logoUrl: logoUrl || undefined,
        primaryColor,
        accentColor,
      });

      if (updateErr) throw updateErr;

      toast.dismiss(toastId);
      toast.success("Branding saved!");
    } catch (e: any) {
      toast.dismiss(toastId);
      toast.error("Failed to save branding", { description: e.message });
    }
  };

  const handleSaveColumns = async () => {
    const toastId = toast.loading("Saving columns…");
    try {
      // Make a deep copy of columns to avoid reference issues
      const columnsToSave = JSON.parse(JSON.stringify(columns));

      // Process columns before saving
      const processedColumns = await Promise.all(
        columnsToSave.map(async (col: DbColumnConfig) => {
          // Ensure all columns have the required properties
          if (
            !col.options &&
            ["dropdown", "radio", "checkbox"].includes(col.type)
          ) {
            col.options = [];
          }

          // Make sure options are properly formatted for approver
          if (col.key === "approver" && col.type === "dropdown") {
            const { data: membersData } =
              await organizations.getOrganizationMembers(orgId);

            if (membersData) {
              const approvers = membersData.filter((member) =>
                ["owner", "admin", "manager"].includes(member.role)
              );

              const { data: profilesData } = await profiles.getByIds(
                approvers.map((approver) => approver.user_id)
              );

              const approverNames = new Map(
                profilesData?.map((profile) => [
                  profile.user_id,
                  profile.full_name || profile.email,
                ]) || []
              );

              col.options = approvers.map((approver) => ({
                value: approver.user_id,
                label: approverNames.get(approver.user_id) || approver.user_id,
              }));
            }
          }

          return col;
        })
      );

      const { error } = await orgSettings.updateExpenseColumns(
        orgId,
        processedColumns
      );

      if (error) throw error;

      toast.dismiss(toastId);
      toast.success("Columns configuration saved!");
    } catch (e: any) {
      toast.dismiss(toastId);
      toast.error("Failed to save columns", { description: e.message });
      console.error("Error saving columns:", e);
    }
  };

  const handleSaveLocationApproverMapping = async () => {
    setSavingLocationMapping(true);
    try {
      const toSave = locationApproverMapping.filter(
        (m) =>
          m.location &&
          m.location.trim() !== "" &&
          m.location !== "__new__"
      );
      const { error } = await orgSettings.updateLocationApproverMapping(
        orgId,
        toSave
      );
      if (error) throw error;
      toast.success("Location → approver mapping saved!");
    } catch (e: any) {
      toast.error("Failed to save mapping", { description: e.message });
    } finally {
      setSavingLocationMapping(false);
    }
  };

  const handleSaveExpenseTypeApproverMapping = async () => {
    setSavingExpenseTypeMapping(true);
    try {
      const toSave = expenseTypeApproverMapping.filter(
        (m) =>
          m.expense_type &&
          m.expense_type.trim() !== "" &&
          m.expense_type !== "__new__"
      );
      const { error } = await orgSettings.updateExpenseTypeApproverMapping(
        orgId,
        toSave
      );
      if (error) throw error;
      toast.success("Expense type → approver mapping saved!");
    } catch (e: any) {
      toast.error("Failed to save mapping", { description: e.message });
    } finally {
      setSavingExpenseTypeMapping(false);
    }
  };

  const handleAddExpenseTypeApproverMappingRow = () => {
    setExpenseTypeApproverMapping((prev) => [
      ...prev,
      {
        expense_type: "__new__",
        approver_id: [],
        second_approver_id: [],
        enabled: true,
      },
    ]);
  };

  const handleRemoveExpenseTypeApproverMappingRow = (expenseType: string) => {
    setExpenseTypeApproverMapping((prev) =>
      prev.filter((m) => m.expense_type !== expenseType)
    );
  };

  const handleUpdateExpenseTypeApproverMappingExpenseType = (
    oldExpenseType: string,
    newExpenseType: string
  ) => {
    const trimmed = newExpenseType.trim();
    setExpenseTypeApproverMapping((prev) => {
      const idx = prev.findIndex((m) => m.expense_type === oldExpenseType);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], expense_type: trimmed || "__new__" };
      return next;
    });
  };

  const handleAddLocationApproverMappingRow = () => {
    setLocationApproverMapping((prev) => [
      ...prev,
      {
        location: "__new__",
        approver_id: [],
        second_approver_id: [],
        enabled: true,
      },
    ]);
  };

  const handleRemoveLocationApproverMappingRow = (location: string) => {
    setLocationApproverMapping((prev) =>
      prev.filter((m) => m.location !== location)
    );
  };

  const handleUpdateLocationApproverMappingLocation = (
    oldLocation: string,
    newLocation: string
  ) => {
    const trimmed = newLocation.trim();
    setLocationApproverMapping((prev) => {
      const idx = prev.findIndex((m) => m.location === oldLocation);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], location: trimmed || "__new__" };
      return next;
    });
  };

  const handleAddColumn = () => {
    // Generate a unique key for the new column
    const timestamp = new Date().getTime();
    const newKey = `custom_field_${timestamp}`;

    setEditingColumn({
      key: newKey,
      label: "",
      type: "text",
      visible: true,
      options: [],
      required: false,
    });

    setNewOptions("");
    setShowColumnDialog(true);
  };

  const handleEditColumn = (column: DbColumnConfig) => {
    // Make a deep copy to avoid reference issues
    const columnCopy = JSON.parse(JSON.stringify(column));
    setEditingColumn(columnCopy);

    // Only set newOptions for non-approver dropdown/radio/checkbox types
    if (
      ["dropdown", "radio", "checkbox"].includes(column.type) &&
      column.key !== "approver"
    ) {
      // Handle both string[] and object[] options
      if (Array.isArray(column.options)) {
        if (
          column.options.length > 0 &&
          typeof column.options[0] === "object"
        ) {
          // Handle object options
          setNewOptions(
            column.options.map((opt: any) => opt.label || opt.value).join("\n")
          );
        } else {
          // Handle string options
          setNewOptions(column.options.join("\n"));
        }
      } else {
        setNewOptions("");
      }
    } else {
      setNewOptions("");
    }

    setShowColumnDialog(true);
  };

  const handleDeleteColumn = (key: string) => {
    if (defaultColumns.some((c) => c.key === key)) {
      toast.error("Cannot delete default columns");
      return;
    }
    setColumns((prev) => prev.filter((c) => c.key !== key));
  };

  const handleSaveColumn = () => {
    if (!editingColumn) return;
    let cleanedLabel = editingColumn.label.trim().replace(/\s+/g, " ");
    const invalidChars = /[^a-zA-Z ]/; // only allow letters and spaces

    if (!cleanedLabel) {
      toast.error("Column label cannot be empty!");
      return;
    }

    if (invalidChars.test(cleanedLabel)) {
      toast.error("only allow letters and spaces!");
      return;
    }

    try {
      // Create a copy of the editing column
      const updatedColumn = { ...editingColumn, label: cleanedLabel };

      // Handle options for dropdown, radio, and checkbox types
      if (
        ["dropdown", "radio", "checkbox"].includes(updatedColumn.type) &&
        updatedColumn.key !== "approver"
      ) {
        // Convert newOptions string to array
        updatedColumn.options = newOptions
          .split("\n")
          .filter(Boolean)
          .map((o) => o.trim());
      }

      // Update the columns state
      setColumns((prevColumns) => {
        const existingColumnIndex = prevColumns.findIndex(
          (col) => col.key === updatedColumn.key
        );

        if (existingColumnIndex >= 0) {
          // Update existing column
          const updatedColumns = [...prevColumns];
          updatedColumns[existingColumnIndex] = updatedColumn;
          return updatedColumns;
        } else {
          // Add new column
          return [...prevColumns, updatedColumn];
        }
      });

      setShowColumnDialog(false);
      setEditingColumn(null);
      setNewOptions("");
    } catch (error) {
      console.error("Error saving column:", error);
      toast.error("An unexpected error occurred");
    }
  };

  const getApproverLabel = (id: string) =>
    approverOptions.find((opt) => opt.value === id)?.label || id;

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

  const resolveIdsFromNames = (names?: string | string[]) => {
    const nameList = normalizeNames(names);
    if (!nameList.length) return [] as string[];
    const mapByLabel = new Map(
      approverOptions.map((opt) => [opt.label.toLowerCase(), opt.value])
    );
    return nameList
      .map((name) => mapByLabel.get(name.toLowerCase()))
      .filter((v): v is string => Boolean(v));
  };

  return (
    <div className="space-y-6">
      <h1 className="page-title">Organisation Settings</h1>

      {/* <Tabs defaultValue="columns" className="space-y-6">
        <TabsList>
          <TabsTrigger value="branding">Branding & Theming</TabsTrigger>
          <TabsTrigger value="columns">Expense Columns</TabsTrigger>
        </TabsList> */}

      {/* ----- Branding & Theming ----- */}
      {/* <TabsContent value="branding">
        <Card>
          <CardHeader>
            <CardTitle>Branding &amp; Theming</CardTitle>
            <CardDescription>
              Customize your organization's logo and colors
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Logo</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    e.target.files && setLogoFile(e.target.files[0])
                  }
                />
                {logoPreview && (
                  <img
                    src={logoPreview}
                    alt="Logo Preview"
                    className="h-16 w-auto object-contain border"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label>Primary Color</Label>
                <Input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Accent Color</Label>
                <Input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={handleSaveBranding}>Save Branding</Button>
          </CardContent>
        </Card>
      </TabsContent> */}

      {/* ----- Expense Columns ----- */}
      {/* <TabsContent value="columns"> */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle>Expense Columns </CardTitle>
              <CardDescription>
                Configure columns and field types for the expense form
              </CardDescription>
            </div>
            <Button onClick={handleAddColumn} variant="outline">
              <PlusCircle className="w-4 h-4 mr-2" />
              Add Column
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            {columns.map((col) => (
              <div
                key={col.key}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center space-x-4">
                  <Checkbox
                    checked={col.visible}
                    onCheckedChange={(v) =>
                      setColumns((prev) =>
                        prev.map((c) =>
                          c.key === col.key
                            ? { ...c, visible: v as boolean }
                            : c
                        )
                      )
                    }
                    disabled={defaultColumns.some((c) => c.key === col.key)}
                  />
                  <div>
                    <p className="font-medium">{col.label}</p>
                    <p className="text-sm text-muted-foreground">
                      Type: {col.type}
                      {col.options && Array.isArray(col.options)
                        ? ` (${col.options.length} options)`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEditColumn(col)}
                  >
                    <Settings2 className="w-4 h-4" />
                  </Button>
                  {!defaultColumns.some((c) => c.key === col.key) && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteColumn(col.key)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveColumns}>Save Columns</Button>
          </div>

          {/* Expense Type → Approver Mapping */}
          {(() => {
            const expenseTypeCol = (columns as any[]).find(
              (c: any) =>
                c.key === "expense_type" ||
                String(c.label || "").trim().toLowerCase() === "expense type"
            );
            const expenseTypeOptions: string[] = expenseTypeCol?.options
              ? Array.isArray(expenseTypeCol.options)
                ? (expenseTypeCol.options as any[]).map((o: any) =>
                    typeof o === "object" ? o.value ?? o.label : String(o)
                  )
                : []
              : [];

            const customExpenseTypes = expenseTypeApproverMapping
              .map((m) => m.expense_type)
              .filter((t) => t && t !== "__new__");
            const newRow = expenseTypeApproverMapping.some(
              (m) => m.expense_type === "__new__"
            );
            const displayRows = [
              ...customExpenseTypes,
              ...(newRow ? ["__new__"] : []),
            ];

            const updateMappingEntry = (
              expenseType: string,
              updates: Partial<ExpenseTypeApproverMappingEntry>
            ) => {
              setExpenseTypeApproverMapping((prev) => {
                const idx = prev.findIndex((m) => m.expense_type === expenseType);
                const base =
                  idx >= 0
                    ? { ...prev[idx], ...updates }
                    : { expense_type: expenseType, ...updates };
                const newEntry: ExpenseTypeApproverMappingEntry = {
                  expense_type: base.expense_type,
                  approver_name: base.approver_name,
                  second_approver_name: base.second_approver_name,
                  approver_id: base.approver_id ?? [],
                  second_approver_id: base.second_approver_id ?? [],
                  enabled: base.enabled ?? true,
                };
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = newEntry;
                  return next;
                }
                return [...prev, newEntry];
              });
            };

            const renderRow = (expenseType: string) => {
              const entry = expenseTypeApproverMapping.find(
                (m) => m.expense_type === expenseType
              );
              const resolvedApproverIds = normalizeIds(entry?.approver_id);
              const resolvedApproverNames = normalizeNames(entry?.approver_name);
              const selectedApproverIds =
                resolvedApproverIds.length > 0
                  ? resolvedApproverIds
                  : resolveIdsFromNames(resolvedApproverNames);

              const resolvedSecondApproverIds = normalizeIds(
                entry?.second_approver_id
              );
              const resolvedSecondApproverNames = normalizeNames(
                entry?.second_approver_name
              );
              const selectedSecondApproverIds =
                resolvedSecondApproverIds.length > 0
                  ? resolvedSecondApproverIds
                  : resolveIdsFromNames(resolvedSecondApproverNames);

              const displayLabel = expenseType === "__new__" ? "" : expenseType;
              return (
                <div
                  key={expenseType}
                  className="flex flex-wrap items-center gap-4 p-3 border rounded-lg"
                >
                  <div className="space-y-1 min-w-[180px] max-w-[220px]">
                    <Label className="text-xs">Expense Type</Label>
                    <Input
                      value={displayLabel}
                      onChange={(e) =>
                        handleUpdateExpenseTypeApproverMappingExpenseType(
                          expenseType,
                          e.target.value
                        )
                      }
                      placeholder="Type expense type"
                      className="font-medium"
                      list="expense-type-options"
                    />
                  </div>
                  <div className="flex-1 flex flex-wrap gap-4">
                    <div className="space-y-1 min-w-[240px]">
                      <Label className="text-xs">Approver</Label>
                      <MultiSelect
                        options={approverOptions}
                        value={selectedApproverIds}
                        onChange={(nextIds) =>
                          updateMappingEntry(expenseType, {
                            approver_id: nextIds,
                            approver_name: nextIds.length
                              ? nextIds.map(getApproverLabel).join(", ")
                              : undefined,
                          })
                        }
                        placeholder="Select one or more approvers"
                        searchPlaceholder="Search approver"
                      />
                    </div>
                    <div className="space-y-1 min-w-[240px]">
                      <Label className="text-xs">Second Approver</Label>
                      <MultiSelect
                        options={approverOptions}
                        value={selectedSecondApproverIds}
                        onChange={(nextIds) =>
                          updateMappingEntry(expenseType, {
                            second_approver_id: nextIds,
                            second_approver_name: nextIds.length
                              ? nextIds.map(getApproverLabel).join(", ")
                              : undefined,
                          })
                        }
                        placeholder="Select one or more approvers"
                        searchPlaceholder="Search second approver"
                      />
                    </div>
                    <div className="space-y-1 min-w-[120px]">
                      <Label className="text-xs">Use on form</Label>
                      <Select
                        value={
                          entry?.enabled === false ? "false" : "true"
                        }
                        onValueChange={(v) =>
                          updateMappingEntry(expenseType, {
                            enabled: v === "true",
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="True / False" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">True</SelectItem>
                          <SelectItem value="false">False</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      handleRemoveExpenseTypeApproverMappingRow(expenseType)
                    }
                    title="Remove mapping"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            };

            return (
              <Card className="mt-6">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>Expense Type → Approver Mapping</CardTitle>
                      <CardDescription>
                        Set approver and second approver for each expense type.
                        These will auto-fill on the new expense form when a user
                        selects an expense type.
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddExpenseTypeApproverMappingRow}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Mapping
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {expenseTypeOptions.length > 0 && (
                    <datalist id="expense-type-options">
                      {expenseTypeOptions.map((opt) => (
                        <option key={opt} value={opt} />
                      ))}
                    </datalist>
                  )}
                  <div className="space-y-3">
                    {displayRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        No mappings added yet. Click &quot;Add Mapping&quot; to create a new expense type → approver mapping.
                      </p>
                    ) : (
                      displayRows.map((expenseType) => renderRow(expenseType))
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={handleSaveExpenseTypeApproverMapping}
                      disabled={savingExpenseTypeMapping}
                    >
                      {savingExpenseTypeMapping ? "Saving…" : "Save Mapping"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Location → Approver Mapping */}
          {(() => {
            const locationCol = columns.find((c) => c.key === "location");
            const locationOptions: string[] = locationCol?.options
              ? Array.isArray(locationCol.options)
                ? (locationCol.options as any[]).map((o: any) =>
                    typeof o === "object" ? o.value ?? o.label : String(o)
                  )
                : []
              : [];

            const customLocations = locationApproverMapping
              .map((m) => m.location)
              .filter((l) => l && l !== "__new__");
            const newRow = locationApproverMapping.some((m) => m.location === "__new__");
            const displayRows = [...customLocations, ...(newRow ? ["__new__"] : [])];

            const updateMappingEntry = (
              location: string,
              updates: Partial<LocationApproverMappingEntry>
            ) => {
              setLocationApproverMapping((prev) => {
                const idx = prev.findIndex((m) => m.location === location);
                const base =
                  idx >= 0
                    ? { ...prev[idx], ...updates }
                    : { location, ...updates };
                const newEntry: LocationApproverMappingEntry = {
                  location: base.location,
                  approver_name: base.approver_name,
                  second_approver_name: base.second_approver_name,
                  approver_id: base.approver_id ?? [],
                  second_approver_id: base.second_approver_id ?? [],
                  enabled: base.enabled ?? true,
                };
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = newEntry;
                  return next;
                }
                return [...prev, newEntry];
              });
            };

            const renderRow = (location: string) => {
              const entry = locationApproverMapping.find((m) => m.location === location);
              const resolvedApproverIds = normalizeIds(entry?.approver_id);
              const resolvedApproverNames = normalizeNames(entry?.approver_name);
              const selectedApproverIds =
                resolvedApproverIds.length > 0
                  ? resolvedApproverIds
                  : resolveIdsFromNames(resolvedApproverNames);

              const resolvedSecondApproverIds = normalizeIds(
                entry?.second_approver_id
              );
              const resolvedSecondApproverNames = normalizeNames(
                entry?.second_approver_name
              );
              const selectedSecondApproverIds =
                resolvedSecondApproverIds.length > 0
                  ? resolvedSecondApproverIds
                  : resolveIdsFromNames(resolvedSecondApproverNames);

              const displayLabel = location === "__new__" ? "" : location;
              return (
                <div
                  key={location}
                  className="flex flex-wrap items-center gap-4 p-3 border rounded-lg"
                >
                  <div className="space-y-1 min-w-[180px] max-w-[220px]">
                    <Label className="text-xs">Location</Label>
                    <Input
                      value={displayLabel}
                      onChange={(e) =>
                        handleUpdateLocationApproverMappingLocation(
                          location,
                          e.target.value
                        )
                      }
                      placeholder="Type location name"
                      className="font-medium"
                      list="location-options"
                    />
                  </div>
                  <div className="flex-1 flex flex-wrap gap-4">
                    <div className="space-y-1 min-w-[240px]">
                      <Label className="text-xs">Approver</Label>
                      <MultiSelect
                        options={approverOptions}
                        value={selectedApproverIds}
                        onChange={(nextIds) =>
                          updateMappingEntry(location, {
                            approver_id: nextIds,
                            approver_name: nextIds.length
                              ? nextIds.map(getApproverLabel).join(", ")
                              : undefined,
                          })
                        }
                        placeholder="Select one or more approvers"
                        searchPlaceholder="Search approver"
                      />
                    </div>
                    <div className="space-y-1 min-w-[240px]">
                      <Label className="text-xs">Second Approver</Label>
                      <MultiSelect
                        options={approverOptions}
                        value={selectedSecondApproverIds}
                        onChange={(nextIds) =>
                          updateMappingEntry(location, {
                            second_approver_id: nextIds,
                            second_approver_name: nextIds.length
                              ? nextIds.map(getApproverLabel).join(", ")
                              : undefined,
                          })
                        }
                        placeholder="Select one or more approvers"
                        searchPlaceholder="Search second approver"
                      />
                    </div>
                    <div className="space-y-1 min-w-[120px]">
                      <Label className="text-xs">Use on form</Label>
                      <Select
                        value={
                          entry?.enabled === false ? "false" : "true"
                        }
                        onValueChange={(v) =>
                          updateMappingEntry(location, {
                            enabled: v === "true",
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="True / False" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">True</SelectItem>
                          <SelectItem value="false">False</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemoveLocationApproverMappingRow(location)}
                    title="Remove mapping"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              );
            };

            return (
              <Card className="mt-6">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle>Location → Approver Mapping</CardTitle>
                      <CardDescription>
                        Set approver and second approver for each location of
                        expense. These will auto-fill on the new expense form
                        when a user selects a location.
                      </CardDescription>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddLocationApproverMappingRow}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Mapping
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {locationOptions.length > 0 && (
                    <datalist id="location-options">
                      {locationOptions.map((opt) => (
                        <option key={opt} value={opt} />
                      ))}
                    </datalist>
                  )}
                  <div className="space-y-3">
                    {displayRows.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">
                        No mappings added yet. Click &quot;Add Mapping&quot; to create a new location → approver mapping.
                      </p>
                    ) : (
                      displayRows.map((loc) => renderRow(loc))
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={handleSaveLocationApproverMapping}
                      disabled={savingLocationMapping}
                    >
                      {savingLocationMapping ? "Saving…" : "Save Mapping"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          <Dialog open={showColumnDialog} onOpenChange={setShowColumnDialog}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingColumn?.key?.startsWith("custom_field_")
                    ? "Add Column"
                    : "Edit Column"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Column Label</Label>
                  <Input
                    value={editingColumn?.label || ""}
                    onChange={(e) =>
                      setEditingColumn((prev) =>
                        prev
                          ? {
                              ...prev,
                              label: e.target.value,
                              key: prev.key.startsWith("custom_field_")
                                ? prev.key
                                : e.target.value
                                    .toLowerCase()
                                    .replace(/\s+/g, "_"),
                            }
                          : null
                      )
                    }
                    disabled={
                      !editingColumn?.key?.startsWith("custom_field_") &&
                      defaultColumns.some((c) => c.key === editingColumn?.key)
                    }
                  />
                </div>

                <div className="space-y-2">
                  <Label>Field Type</Label>
                  <Select
                    value={editingColumn?.type}
                    onValueChange={(value: ColumnConfig["type"]) =>
                      setEditingColumn((prev) =>
                        prev ? { ...prev, type: value } : null
                      )
                    }
                    disabled={defaultColumns.some(
                      (c) => c.key === editingColumn?.key
                    )}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text">Text</SelectItem>
                      <SelectItem value="number">Number</SelectItem>
                      <SelectItem value="date">Date</SelectItem>
                      <SelectItem value="textarea">Text Area</SelectItem>
                      <SelectItem value="dropdown">Dropdown</SelectItem>
                      <SelectItem value="radio">Radio</SelectItem>
                      <SelectItem value="checkbox">Checkbox</SelectItem>
                      {/* <SelectItem value="file">File Upload</SelectItem> */}
                    </SelectContent>
                  </Select>
                </div>

                {["dropdown", "radio", "checkbox"].includes(
                  editingColumn?.type || ""
                ) &&
                  editingColumn?.key !== "approver" && (
                    <div className="space-y-2">
                      <Label>Options (one per line)</Label>
                      <Textarea
                        value={newOptions}
                        onChange={(e) => setNewOptions(e.target.value)}
                        placeholder="Enter options..."
                        rows={5}
                      />
                    </div>
                  )}

                {editingColumn?.key === "approver" && (
                  <div className="text-sm text-muted-foreground p-2 bg-muted rounded-md">
                    Options for this field are automatically populated with
                    organization members who can approve expenses (owners,
                    admins, and managers).
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <Checkbox
                    checked={editingColumn?.required}
                    onCheckedChange={(v) =>
                      setEditingColumn((prev) =>
                        prev ? { ...prev, required: v as boolean } : null
                      )
                    }
                  />
                  <Label>Required field</Label>
                </div>

                <Button onClick={handleSaveColumn} className="w-full">
                  Save Column
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
      {/* </TabsContent> */}
      {/* </Tabs> */}
    </div>
  );
}
