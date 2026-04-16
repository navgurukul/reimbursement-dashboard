// src/app/org/[slug]/settings/page.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { notFound, useRouter } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { expenseTypeDetails, orgSettings } from "@/lib/db";
import type {
  ColumnConfig as DbColumnConfig,
  ExpenseTypeDetail,
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
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Edit, PlusCircle, Settings2, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/table-skeleton";
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

interface ExpenseTypeDetailsForm {
  group: string;
  sub_group: string;
  expense_ledger: string;
  description: string;
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
  const [isAddingExpenseType, setIsAddingExpenseType] = useState(false);
  const [isExpenseTypeDialogOpen, setIsExpenseTypeDialogOpen] = useState(false);
  const [isEditingExpenseType, setIsEditingExpenseType] = useState(false);
  const [editingExpenseTypeId, setEditingExpenseTypeId] = useState<string | null>(
    null
  );
  const [expenseTypeRows, setExpenseTypeRows] = useState<ExpenseTypeDetail[]>([]);
  const [isLoadingExpenseTypeRows, setIsLoadingExpenseTypeRows] = useState(false);
  const [expenseTypeSearchQuery, setExpenseTypeSearchQuery] = useState("");
  const [expenseTypeForm, setExpenseTypeForm] =
    useState<ExpenseTypeDetailsForm>({
      group: "",
      sub_group: "",
      expense_ledger: "",
      description: "",
    });

  const filteredExpenseTypeRows = useMemo(() => {
    const normalizedQuery = expenseTypeSearchQuery.trim().toLowerCase();

    if (!normalizedQuery) return expenseTypeRows;

    return expenseTypeRows.filter((row) => {
      const groupValue = row.group?.toLowerCase() || "";
      const subGroupValue = row.sub_group?.toLowerCase() || "";
      const expenseLedgerValue = row.expense_ledger?.toLowerCase() || "";
      const descriptionValue = row.description?.toLowerCase() || "";

      return (
        groupValue.includes(normalizedQuery) ||
        subGroupValue.includes(normalizedQuery) ||
        expenseLedgerValue.includes(normalizedQuery) ||
        descriptionValue.includes(normalizedQuery)
      );
    });
  }, [expenseTypeRows, expenseTypeSearchQuery]);

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

            // Ensure location column exists if not present and remove duplicates
            const hasLocationColumn = processedColumns.some(
              (col) => col.key === "location"
            );
            
            // Remove duplicate "Project of Expense" entries (keep only the one with key "location")
            const locationColumnIndex = processedColumns.findIndex(
              (col) => col.key === "location"
            );
            const projectExpenseIndex = processedColumns.findIndex(
              (col) => col.label === "Project of Expense" && col.key !== "location"
            );
            
            if (projectExpenseIndex !== -1 && locationColumnIndex !== -1) {
              // Remove the duplicate if both exist
              processedColumns.splice(projectExpenseIndex, 1);
            } else if (projectExpenseIndex !== -1 && locationColumnIndex === -1) {
              // If only the duplicate exists, rename it to location
              processedColumns[projectExpenseIndex].key = "location";
            } else if (!hasLocationColumn) {
              // If no location column exists, add it
              processedColumns.push({
                key: "location",
                label: "Project of Expense",
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
            // Only add location if not already present
            if (!initialColumns.some((col) => col.key === "location" || col.label === "Project of Expense")) {
              initialColumns.push({
                key: "location",
                label: "Project of Expense",
                type: "dropdown",
                visible: true,
                required: true,
                options: [],
              });
            }
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

          // Update the approver column options
          setColumns((prevColumns) => {
            return prevColumns.map((col) => {
              if (col.key === "approver") {
                return {
                  ...col,
                  options: approvers.map((approver) => ({
                    value: approver.user_id,
                    label:
                      approverNames.get(approver.user_id) || approver.user_id,
                  })),
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

  useEffect(() => {
    const fetchExpenseTypeRows = async () => {
      if (!orgId) return;

      setIsLoadingExpenseTypeRows(true);
      const { data, error } = await expenseTypeDetails.getAll();

      if (error) {
        toast.error("Failed to load expense type details", {
          description: error.message,
        });
        setExpenseTypeRows([]);
      } else {
        setExpenseTypeRows(data);
      }

      setIsLoadingExpenseTypeRows(false);
    };

    fetchExpenseTypeRows();
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
      let columnsToSave = JSON.parse(JSON.stringify(columns));

      // Remove duplicate "Project of Expense" entries
      const locationColumnIndex = columnsToSave.findIndex(
        (col: DbColumnConfig) => col.key === "location"
      );
      const duplicateProjectExpenseIndices = columnsToSave
        .map((col: DbColumnConfig, idx: number) => 
          col.label === "Project of Expense" && col.key !== "location" ? idx : -1
        )
        .filter((idx: number) => idx !== -1);
      
      // Remove duplicates in reverse order to avoid index shifting
      for (let i = duplicateProjectExpenseIndices.length - 1; i >= 0; i--) {
        columnsToSave.splice(duplicateProjectExpenseIndices[i], 1);
      }

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

  const handleExpenseTypeFormChange = (
    key: keyof ExpenseTypeDetailsForm,
    value: string
  ) => {
    setExpenseTypeForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleAddExpenseTypeDetails = async () => {
    if (!orgId) return;

    if (!expenseTypeForm.group.trim()) {
      toast.error("Group is required");
      return;
    }

    if (!expenseTypeForm.sub_group.trim()) {
      toast.error("Sub-Group is required");
      return;
    }

    if (!expenseTypeForm.expense_ledger.trim()) {
      toast.error("Expense Ledger is required");
      return;
    }

    setIsAddingExpenseType(true);

    try {
      const { data, error } = isEditingExpenseType
        ? await expenseTypeDetails.update(editingExpenseTypeId!, {
            group: expenseTypeForm.group,
            sub_group: expenseTypeForm.sub_group,
            expense_ledger: expenseTypeForm.expense_ledger,
            description: expenseTypeForm.description,
          })
        : await expenseTypeDetails.create({
            group: expenseTypeForm.group,
            sub_group: expenseTypeForm.sub_group,
            expense_ledger: expenseTypeForm.expense_ledger,
            description: expenseTypeForm.description,
          });

      if (error) throw error;

      toast.success(
        isEditingExpenseType
          ? "Expense type details updated"
          : "Expense type details added"
      );

      if (data) {
        if (isEditingExpenseType) {
          setExpenseTypeRows((prev) =>
            prev.map((row) => (row.id === data.id ? data : row))
          );
        } else {
          setExpenseTypeRows((prev) =>
            [...prev, data].sort((first, second) => {
              if (first.group !== second.group) {
                return first.group.localeCompare(second.group);
              }

              if (first.sub_group !== second.sub_group) {
                return first.sub_group.localeCompare(second.sub_group);
              }

              return first.expense_ledger.localeCompare(second.expense_ledger);
            })
          );
        }
      }

      setExpenseTypeForm({
        group: "",
        sub_group: "",
        expense_ledger: "",
        description: "",
      });
      setIsEditingExpenseType(false);
      setEditingExpenseTypeId(null);
      setIsExpenseTypeDialogOpen(false);
    } catch (error: any) {
      toast.error(
        isEditingExpenseType
          ? "Failed to update expense type details"
          : "Failed to add expense type details",
        {
          description: error.message,
        }
      );
    } finally {
      setIsAddingExpenseType(false);
    }
  };

  const openAddExpenseTypeDialog = () => {
    setIsEditingExpenseType(false);
    setEditingExpenseTypeId(null);
    setExpenseTypeForm({
      group: "",
      sub_group: "",
      expense_ledger: "",
      description: "",
    });
    setIsExpenseTypeDialogOpen(true);
  };

  const openEditExpenseTypeDialog = (row: ExpenseTypeDetail) => {
    setIsEditingExpenseType(true);
    setEditingExpenseTypeId(row.id);
    setExpenseTypeForm({
      group: row.group,
      sub_group: row.sub_group,
      expense_ledger: row.expense_ledger,
      description: row.description || "",
    });
    setIsExpenseTypeDialogOpen(true);
  };

  const handleDeleteExpenseTypeDetail = async (row: ExpenseTypeDetail) => {
    const { error } = await expenseTypeDetails.delete(row.id);

    if (error) {
      toast.error("Failed to delete expense type details", {
        description: error.message,
      });
      return;
    }

    setExpenseTypeRows((prev) => prev.filter((item) => item.id !== row.id));
    toast.success("Expense type details deleted");
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

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Expense Type Details</CardTitle>
              <CardDescription>
                Add and edit Group, Sub-Group, Expense Ledger, and Description
                entries.
              </CardDescription>
            </div>
            <Button onClick={openAddExpenseTypeDialog} variant="outline">
              <PlusCircle className="w-4 h-4 mr-2" />
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Input
              value={expenseTypeSearchQuery}
              onChange={(e) => setExpenseTypeSearchQuery(e.target.value)}
              placeholder="Search by Group, Sub-Group, Expense Ledger / Expense Type, Description"
            />
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[980px] table-fixed">
              <TableHeader className="bg-gray-300">
                <TableRow>
                  <TableHead className="w-[18%] whitespace-normal break-words">
                    Group
                  </TableHead>
                  <TableHead className="w-[18%] whitespace-normal break-words">
                    Sub-Group
                  </TableHead>
                  <TableHead className="w-[24%] whitespace-normal break-words">
                    Expense Ledger / Expense Type
                  </TableHead>
                  <TableHead className="w-[30%] whitespace-normal break-words">
                    Expense Type Description
                  </TableHead>
                  <TableHead className="w-[10%] text-right whitespace-normal break-words">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingExpenseTypeRows ? (
                  <TableSkeleton colSpan={5} rows={5} />
                ) : filteredExpenseTypeRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>
                      {expenseTypeRows.length === 0
                        ? "No expense type details found."
                        : "No matching expense type details found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredExpenseTypeRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-normal break-words align-top">
                        {row.group}
                      </TableCell>
                      <TableCell className="whitespace-normal break-words align-top">
                        {row.sub_group}
                      </TableCell>
                      <TableCell className="whitespace-normal break-words align-top">
                        {row.expense_ledger}
                      </TableCell>
                      <TableCell className="whitespace-normal break-words align-top">
                        {row.description || "-"}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditExpenseTypeDialog(row)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteExpenseTypeDetail(row)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <Dialog
            open={isExpenseTypeDialogOpen}
            onOpenChange={setIsExpenseTypeDialogOpen}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {isEditingExpenseType
                    ? "Edit Expense Type Details"
                    : "Add Expense Type Details"}
                </DialogTitle>
              </DialogHeader>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="expense-type-group">Group</Label>
                  <Input
                    id="expense-type-group"
                    value={expenseTypeForm.group}
                    onChange={(e) =>
                      handleExpenseTypeFormChange("group", e.target.value)
                    }
                    placeholder="e.g. Operational Expenses"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="expense-type-sub-group">Sub-Group</Label>
                  <Input
                    id="expense-type-sub-group"
                    value={expenseTypeForm.sub_group}
                    onChange={(e) =>
                      handleExpenseTypeFormChange("sub_group", e.target.value)
                    }
                    placeholder="e.g. OE Utilities"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="expense-type-ledger">Expense Ledger / Expense Type</Label>
                  <Input
                    id="expense-type-ledger"
                    value={expenseTypeForm.expense_ledger}
                    onChange={(e) =>
                      handleExpenseTypeFormChange(
                        "expense_ledger",
                        e.target.value
                      )
                    }
                    placeholder="e.g. OU Electricity Charges"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="expense-type-description">Description</Label>
                  <Textarea
                    id="expense-type-description"
                    value={expenseTypeForm.description}
                    onChange={(e) =>
                      handleExpenseTypeFormChange("description", e.target.value)
                    }
                    placeholder="Optional description"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleAddExpenseTypeDetails}
                  disabled={isAddingExpenseType}
                >
                  {isAddingExpenseType
                    ? isEditingExpenseType
                      ? "Updating..."
                      : "Adding..."
                    : isEditingExpenseType
                    ? "Update Expense Type Details"
                    : "Add Expense Type Details"}
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
