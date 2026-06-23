// src/app/org/[slug]/settings/page.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { notFound, useRouter } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import {
  expenseTypeDetails,
  orgSettings,
  projectOfExpenseDetails,
} from "@/lib/db";
import type {
  ColumnConfig as DbColumnConfig,
  ExpenseTypeDetail,
  ProjectOfExpenseDetail,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PlusCircle, Settings2, Trash2, Plus, X, Edit } from "lucide-react";
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
import { Pagination, usePagination } from "@/components/pagination";
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
          <Button variant="outline" className="h-9 w-full justify-between font-normal text-left">
            <span className="truncate">
              {value || placeholder}
            </span>
            <span className="text-muted-foreground">▾</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-[280px] p-2" align="start">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder={searchPlaceholder}
            className="h-9"
          />
          <DropdownMenuSeparator className="my-2" />
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
            onKeyDown={(e) => e.stopPropagation()}
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
    </div>
  );
}

interface ExpenseTypeDetailsForm {
  group: string;
  sub_group: string;
  expense_ledger: string;
  description: string;
}

interface ProjectOfExpenseDetailsForm {
  project_of_expense: string;
  project_description: string;
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
  const [expenseTypeDeleteTarget, setExpenseTypeDeleteTarget] =
    useState<ExpenseTypeDetail | null>(null);
  const [isDeletingExpenseType, setIsDeletingExpenseType] = useState(false);
  const [expenseTypeForm, setExpenseTypeForm] =
    useState<ExpenseTypeDetailsForm>({
      group: "",
      sub_group: "",
      expense_ledger: "",
      description: "",
    });
  const [projectOfExpenseRows, setProjectOfExpenseRows] = useState<
    ProjectOfExpenseDetail[]
  >([]);
  const [isLoadingProjectOfExpenseRows, setIsLoadingProjectOfExpenseRows] =
    useState(false);
  const [projectOfExpenseSearchQuery, setProjectOfExpenseSearchQuery] =
    useState("");
  const [projectOfExpenseDeleteTarget, setProjectOfExpenseDeleteTarget] =
    useState<ProjectOfExpenseDetail | null>(null);
  const [isDeletingProjectOfExpense, setIsDeletingProjectOfExpense] =
    useState(false);
  const [isProjectOfExpenseDialogOpen, setIsProjectOfExpenseDialogOpen] =
    useState(false);
  const [isEditingProjectOfExpense, setIsEditingProjectOfExpense] =
    useState(false);
  const [editingProjectOfExpenseId, setEditingProjectOfExpenseId] =
    useState<string | null>(null);
  const [isAddingProjectOfExpense, setIsAddingProjectOfExpense] =
    useState(false);
  const [projectOfExpenseForm, setProjectOfExpenseForm] =
    useState<ProjectOfExpenseDetailsForm>({
      project_of_expense: "",
      project_description: "",
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

  const filteredProjectOfExpenseRows = useMemo(() => {
    const normalizedQuery = projectOfExpenseSearchQuery.trim().toLowerCase();

    if (!normalizedQuery) return projectOfExpenseRows;

    return projectOfExpenseRows.filter((row) => {
      const projectValue = row.project_of_expense?.toLowerCase() || "";
      const descriptionValue = row.project_description?.toLowerCase() || "";

      return (
        projectValue.includes(normalizedQuery) ||
        descriptionValue.includes(normalizedQuery)
      );
    });
  }, [projectOfExpenseRows, projectOfExpenseSearchQuery]);

  const {
    currentPage: expenseTypeCurrentPage,
    setCurrentPage: setExpenseTypeCurrentPage,
    totalPages: expenseTypeTotalPages,
    paginatedData: paginatedExpenseTypeRows,
    totalItems: totalExpenseTypeItems,
  } = usePagination(filteredExpenseTypeRows);

  const {
    currentPage: projectOfExpenseCurrentPage,
    setCurrentPage: setProjectOfExpenseCurrentPage,
    totalPages: projectOfExpenseTotalPages,
    paginatedData: paginatedProjectOfExpenseRows,
    totalItems: totalProjectOfExpenseItems,
  } = usePagination(filteredProjectOfExpenseRows);

  useEffect(() => {
    setExpenseTypeCurrentPage(1);
  }, [expenseTypeSearchQuery, setExpenseTypeCurrentPage]);

  useEffect(() => {
    setProjectOfExpenseCurrentPage(1);
  }, [projectOfExpenseSearchQuery, setProjectOfExpenseCurrentPage]);

  useEffect(() => {
    if (expenseTypeCurrentPage > expenseTypeTotalPages) {
      setExpenseTypeCurrentPage(expenseTypeTotalPages);
    }
  }, [expenseTypeCurrentPage, expenseTypeTotalPages, setExpenseTypeCurrentPage]);

  useEffect(() => {
    if (projectOfExpenseCurrentPage > projectOfExpenseTotalPages) {
      setProjectOfExpenseCurrentPage(projectOfExpenseTotalPages);
    }
  }, [
    projectOfExpenseCurrentPage,
    projectOfExpenseTotalPages,
    setProjectOfExpenseCurrentPage,
  ]);
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

  useEffect(() => {
    const fetchProjectOfExpenseRows = async () => {
      if (!orgId) return;

      setIsLoadingProjectOfExpenseRows(true);
      const { data, error } = await projectOfExpenseDetails.getAll();

      if (error) {
        toast.error("Failed to load project of expense details", {
          description: error.message,
        });
        setProjectOfExpenseRows([]);
      } else {
        setProjectOfExpenseRows(data);
      }

      setIsLoadingProjectOfExpenseRows(false);
    };

    fetchProjectOfExpenseRows();
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

  const handleDeleteExpenseTypeDetail = async () => {
    if (!expenseTypeDeleteTarget) return;

    setIsDeletingExpenseType(true);
    try {
      const { error } = await expenseTypeDetails.delete(expenseTypeDeleteTarget.id);

      if (error) {
        toast.error("Failed to delete expense type details", {
          description: error.message,
        });
        return;
      }

      setExpenseTypeRows((prev) =>
        prev.filter((item) => item.id !== expenseTypeDeleteTarget.id)
      );
      setExpenseTypeDeleteTarget(null);
      toast.success("Expense type details deleted");
    } finally {
      setIsDeletingExpenseType(false);
    }
  };

  const handleProjectOfExpenseFormChange = (
    key: keyof ProjectOfExpenseDetailsForm,
    value: string
  ) => {
    setProjectOfExpenseForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleAddProjectOfExpenseDetails = async () => {
    if (!orgId) return;

    if (!projectOfExpenseForm.project_of_expense.trim()) {
      toast.error("Project of Expense is required");
      return;
    }

    setIsAddingProjectOfExpense(true);

    try {
      const { data, error } = isEditingProjectOfExpense
        ? await projectOfExpenseDetails.update(editingProjectOfExpenseId!, {
            project_of_expense: projectOfExpenseForm.project_of_expense,
            project_description: projectOfExpenseForm.project_description,
          })
        : await projectOfExpenseDetails.create({
            project_of_expense: projectOfExpenseForm.project_of_expense,
            project_description: projectOfExpenseForm.project_description,
          });

      if (error) throw error;

      toast.success(
        isEditingProjectOfExpense
          ? "Project of expense details updated"
          : "Project of expense details added"
      );

      if (data) {
        if (isEditingProjectOfExpense) {
          setProjectOfExpenseRows((prev) =>
            prev.map((row) => (row.id === data.id ? data : row))
          );
        } else {
          setProjectOfExpenseRows((prev) =>
            [...prev, data].sort((first, second) =>
              first.project_of_expense.localeCompare(second.project_of_expense)
            )
          );
        }
      }

      setProjectOfExpenseForm({
        project_of_expense: "",
        project_description: "",
      });
      setIsEditingProjectOfExpense(false);
      setEditingProjectOfExpenseId(null);
      setIsProjectOfExpenseDialogOpen(false);
    } catch (error: any) {
      toast.error(
        isEditingProjectOfExpense
          ? "Failed to update project of expense details"
          : "Failed to add project of expense details",
        {
          description: error.message,
        }
      );
    } finally {
      setIsAddingProjectOfExpense(false);
    }
  };

  const openAddProjectOfExpenseDialog = () => {
    setIsEditingProjectOfExpense(false);
    setEditingProjectOfExpenseId(null);
    setProjectOfExpenseForm({
      project_of_expense: "",
      project_description: "",
    });
    setIsProjectOfExpenseDialogOpen(true);
  };

  const openEditProjectOfExpenseDialog = (row: ProjectOfExpenseDetail) => {
    setIsEditingProjectOfExpense(true);
    setEditingProjectOfExpenseId(row.id);
    setProjectOfExpenseForm({
      project_of_expense: row.project_of_expense,
      project_description: row.project_description || "",
    });
    setIsProjectOfExpenseDialogOpen(true);
  };

  const handleDeleteProjectOfExpenseDetail = async () => {
    if (!projectOfExpenseDeleteTarget) return;

    setIsDeletingProjectOfExpense(true);
    try {
      const { error } = await projectOfExpenseDetails.delete(
        projectOfExpenseDeleteTarget.id
      );

      if (error) {
        toast.error("Failed to delete project of expense details", {
          description: error.message,
        });
        return;
      }

      setProjectOfExpenseRows((prev) =>
        prev.filter((item) => item.id !== projectOfExpenseDeleteTarget.id)
      );
      setProjectOfExpenseDeleteTarget(null);
      toast.success("Project of expense details deleted");
    } finally {
      setIsDeletingProjectOfExpense(false);
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
                  className="flex flex-wrap items-start gap-4 p-3 border rounded-lg"
                >
                  <div className="space-y-1 min-w-[180px] max-w-[220px]">
                    <Label className="text-xs">Expense Type</Label>
                    <SearchableDropdown
                      options={expenseTypeOptions}
                      value={displayLabel}
                      onChange={(val) =>
                        handleUpdateExpenseTypeApproverMappingExpenseType(
                          expenseType,
                          val
                        )
                      }
                      placeholder="Select expense type"
                      searchPlaceholder="Search expense type..."
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
                    <div className="space-y-1 min-w-[140px]">
                      <Label className="block text-center text-xs">Enable on expense form</Label>
                      <div className="flex h-9 items-center justify-center">
                        <Checkbox
                          checked={entry?.enabled !== false}
                          onCheckedChange={(checked) =>
                            updateMappingEntry(expenseType, {
                              enabled: checked === true,
                            })
                          }
                        />
                      </div>
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

            const expenseTypeCol = (columns as any[]).find(
              (c: any) =>
                c.key === "expense_type" ||
                String(c.label || "")
                  .trim()
                  .toLowerCase() === "expense type"
            );
            const expenseTypeOptions: string[] = expenseTypeCol?.options
              ? Array.isArray(expenseTypeCol.options)
                ? (expenseTypeCol.options as any[]).map((o: any) =>
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
              const expenseTypeValue =
                typeof entry?.expense_type === "string" ? entry.expense_type : "";
              return (
                <div
                  key={location}
                  className="flex flex-wrap items-start gap-4 p-3 border rounded-lg"
                >
                  <div className="space-y-3 min-w-[200px] max-w-[260px]">
                    <div className="space-y-1">
                      <Label className="text-xs">Location</Label>
                      <SearchableDropdown
                        options={locationOptions}
                        value={displayLabel}
                        onChange={(val) =>
                          handleUpdateLocationApproverMappingLocation(
                            location,
                            val
                          )
                        }
                        placeholder="Select location"
                        searchPlaceholder="Search location..."
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">
                        Expense Type (optional)
                      </Label>
                      <SearchableDropdown
                        options={expenseTypeOptions}
                        value={expenseTypeValue}
                        onChange={(val) =>
                          updateMappingEntry(location, {
                            expense_type: val.trim() || undefined,
                          })
                        }
                        placeholder="Select expense type"
                        searchPlaceholder="Search expense type..."
                      />
                    </div>
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
                    <div className="space-y-1 min-w-[140px]">
                      <Label className="block text-center text-xs">Enable on expense form</Label>
                      <div className="flex h-9 items-center justify-center">
                        <Checkbox
                          checked={entry?.enabled !== false}
                          onCheckedChange={(checked) =>
                            updateMappingEntry(location, {
                              enabled: checked === true,
                            })
                          }
                        />
                      </div>
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
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
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
                        className="max-h-48 overflow-y-auto"
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
              <CardTitle className="mb-2">Expense Type Details</CardTitle>
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
                  paginatedExpenseTypeRows.map((row) => (
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
                            onClick={() => setExpenseTypeDeleteTarget(row)}
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

          {!isLoadingExpenseTypeRows && filteredExpenseTypeRows.length > 0 && (
            <Pagination
              currentPage={expenseTypeCurrentPage}
              totalPages={expenseTypeTotalPages}
              totalItems={totalExpenseTypeItems}
              onPageChange={setExpenseTypeCurrentPage}
              itemLabel="Expense Type Details"
            />
          )}

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

              <div className="grid gap-4 md:grid-cols-2 max-h-[70vh] overflow-y-auto pr-2">
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

          <AlertDialog
            open={Boolean(expenseTypeDeleteTarget)}
            onOpenChange={(open) => {
              if (!open && !isDeletingExpenseType) {
                setExpenseTypeDeleteTarget(null);
              }
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete expense type details?</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete
                  {expenseTypeDeleteTarget?.expense_ledger
                    ? ` \"${expenseTypeDeleteTarget.expense_ledger}\"`
                    : " this record"}
                  ?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeletingExpenseType} className="cursor-pointer">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteExpenseTypeDetail}
                  disabled={isDeletingExpenseType}
                  className="cursor-pointer"
                >
                  {isDeletingExpenseType ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="mb-1">Project of Expense Details</CardTitle>
              <CardDescription>
                Add and edit Project of Expense and Description entries.
              </CardDescription>
            </div>
            <Button onClick={openAddProjectOfExpenseDialog} variant="outline">
              <PlusCircle className="w-4 h-4 mr-2" />
              Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Input
              value={projectOfExpenseSearchQuery}
              onChange={(e) => setProjectOfExpenseSearchQuery(e.target.value)}
              placeholder="Search by Project of Expense or Description"
            />
          </div>

          <div className="overflow-x-auto">
            <Table className="min-w-[900px] table-fixed">
              <TableHeader className="bg-gray-300">
                <TableRow>
                  <TableHead className="w-[35%] whitespace-normal break-words">
                    Project of Expense
                  </TableHead>
                  <TableHead className="w-[55%] whitespace-normal break-words">
                    Project of Expense Description
                  </TableHead>
                  <TableHead className="w-[10%] text-right whitespace-normal break-words">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingProjectOfExpenseRows ? (
                  <TableSkeleton colSpan={3} rows={5} />
                ) : filteredProjectOfExpenseRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3}>
                      {projectOfExpenseRows.length === 0
                        ? "No project of expense details found."
                        : "No matching project of expense details found."}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedProjectOfExpenseRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="whitespace-normal break-words align-top">
                        {row.project_of_expense}
                      </TableCell>
                      <TableCell className="whitespace-normal break-words align-top">
                        {row.project_description || "-"}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditProjectOfExpenseDialog(row)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setProjectOfExpenseDeleteTarget(row)}
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

          {!isLoadingProjectOfExpenseRows &&
            filteredProjectOfExpenseRows.length > 0 && (
              <Pagination
                currentPage={projectOfExpenseCurrentPage}
                totalPages={projectOfExpenseTotalPages}
                totalItems={totalProjectOfExpenseItems}
                onPageChange={setProjectOfExpenseCurrentPage}
                itemLabel="Project of Expense Details"
              />
            )}

          <Dialog
            open={isProjectOfExpenseDialogOpen}
            onOpenChange={setIsProjectOfExpenseDialogOpen}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {isEditingProjectOfExpense
                    ? "Edit Project of Expense Details"
                    : "Add Project of Expense Details"}
                </DialogTitle>
              </DialogHeader>

              <div className="grid gap-4 max-h-[70vh] overflow-y-auto pr-2">
                <div className="space-y-2">
                  <Label htmlFor="project-of-expense-name">Project of Expense</Label>
                  <Input
                    id="project-of-expense-name"
                    value={projectOfExpenseForm.project_of_expense}
                    onChange={(e) =>
                      handleProjectOfExpenseFormChange(
                        "project_of_expense",
                        e.target.value
                      )
                    }
                    placeholder="e.g. Corporate Office"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="project-of-expense-description">
                    Project of Expense Description
                  </Label>
                  <Textarea
                    id="project-of-expense-description"
                    value={projectOfExpenseForm.project_description}
                    onChange={(e) =>
                      handleProjectOfExpenseFormChange("project_description", e.target.value)
                    }
                    placeholder="Optional description"
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleAddProjectOfExpenseDetails}
                  disabled={isAddingProjectOfExpense}
                >
                  {isAddingProjectOfExpense
                    ? isEditingProjectOfExpense
                      ? "Updating..."
                      : "Adding..."
                    : isEditingProjectOfExpense
                    ? "Update Project of Expense Details"
                    : "Add Project of Expense Details"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <AlertDialog
            open={Boolean(projectOfExpenseDeleteTarget)}
            onOpenChange={(open) => {
              if (!open && !isDeletingProjectOfExpense) {
                setProjectOfExpenseDeleteTarget(null);
              }
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete project of expense details?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete
                  {projectOfExpenseDeleteTarget?.project_of_expense
                    ? ` "${projectOfExpenseDeleteTarget.project_of_expense}"`
                    : " this record"}
                  ?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel
                  disabled={isDeletingProjectOfExpense}
                  className="cursor-pointer"
                >
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteProjectOfExpenseDetail}
                  disabled={isDeletingProjectOfExpense}
                  className="cursor-pointer"
                >
                  {isDeletingProjectOfExpense ? "Deleting..." : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
      {/* </TabsContent> */}
      {/* </Tabs> */}
    </div>
  );
}
