// src/app/org/[slug]/settings/page.tsx
"use client";

import { useState, useEffect } from "react";
import { notFound, useRouter } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { orgSettings } from "@/lib/db";
import type { ColumnConfig as DbColumnConfig } from "@/lib/db";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PlusCircle, Settings2, Trash2 } from "lucide-react";
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
            setColumns(settingsData.expense_columns);
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
    console.log("Colums inside handleSaveColumns", columns);
    try {
      const { error } = await orgSettings.updateExpenseColumns(orgId, columns);

      if (error) throw error;

      toast.dismiss(toastId);
      toast.success("Columns configuration saved!");
    } catch (e: any) {
      toast.dismiss(toastId);
      toast.error("Failed to save columns", { description: e.message });
    }
  };

  const handleAddColumn = () => {
    setEditingColumn({
      key: "",
      label: "",
      type: "text",
      visible: true,
      options: [],
    });
    setShowColumnDialog(true);
  };

  const handleEditColumn = (column: DbColumnConfig) => {
    setEditingColumn(column);

    // Only set newOptions for non-approver dropdown/radio/checkbox types
    if (
      ["dropdown", "radio", "checkbox"].includes(column.type) &&
      column.key !== "approver"
    ) {
      setNewOptions(column.options?.join("\n") || "");
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

  const handleSaveColumn = async () => {
    if (!editingColumn) return;

    try {
      // Create a copy of the editing column
      const updatedColumn = { ...editingColumn };

      // Handle options for dropdown, radio, and checkbox types
      if (
        ["dropdown", "radio", "checkbox"].includes(updatedColumn.type) &&
        updatedColumn.key !== "approver"
      ) {
        updatedColumn.options = newOptions
          .split("\n")
          .filter(Boolean)
          .map((o) => o.trim());
      }

      // If this is the approver column, fetch and populate the options
      if (updatedColumn.key === "approver") {
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
          updatedColumn.options = approvers.map((approver) => ({
            value: approver.user_id,
            label: approverNames.get(approver.user_id) || approver.user_id,
          }));
        }
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

  return (
    <Tabs defaultValue="branding" className="space-y-6">
      <TabsList>
        <TabsTrigger value="branding">Branding & Theming</TabsTrigger>
        <TabsTrigger value="columns">Expense Columns</TabsTrigger>
      </TabsList>

      {/* ----- Branding & Theming ----- */}
      <TabsContent value="branding">
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
      </TabsContent>

      {/* ----- Expense Columns ----- */}
      <TabsContent value="columns">
        <Card>
          <CardHeader>
            <CardTitle>Expense Columns</CardTitle>
            <CardDescription>
              Configure columns and field types for the expense form
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={handleAddColumn} variant="outline">
                <PlusCircle className="w-4 h-4 mr-2" />
                Add Column
              </Button>
            </div>

            <div className="space-y-4">
              {columns.map((col) => (
                <div
                  key={col.key}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center space-x-4">
                    {!defaultColumns.some((c) => c.key === col.key) && (
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
                      />
                    )}
                    <div>
                      <p className="font-medium">{col.label}</p>
                      <p className="text-sm text-muted-foreground">
                        Type: {col.type}
                        {col.options ? ` (${col.options.length} options)` : ""}
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

            <Button onClick={handleSaveColumns}>Save Columns</Button>

            <Dialog open={showColumnDialog} onOpenChange={setShowColumnDialog}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {editingColumn?.key ? "Edit Column" : "Add Column"}
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
                                key: e.target.value
                                  .toLowerCase()
                                  .replace(/\s+/g, "_"),
                              }
                            : null
                        )
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Field Type</Label>
                    <Select
                      value={editingColumn?.type}
                      onValueChange={(value: DbColumnConfig["type"]) =>
                        setEditingColumn((prev) =>
                          prev ? { ...prev, type: value } : null
                        )
                      }
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
                        <SelectItem value="file">File Upload</SelectItem>
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
      </TabsContent>
    </Tabs>
  );
}
