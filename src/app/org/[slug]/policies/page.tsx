// src/app/org/[slug]/settings/policies/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useOrgStore } from "@/store/useOrgStore";
import { policies, Policy, orgSettings } from "@/lib/db";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { PlusCircle, Edit, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { defaultExpenseColumns } from "@/lib/defaults";

const defaultPolicy: Omit<
  Policy,
  "id" | "created_at" | "updated_at" | "org_id"
> = {
  expense_type: "",
  per_unit_cost: null,
  upper_limit: null,
  eligibility: null,
  conditions: null,
};

export default function PoliciesPage() {
  const { organization, userRole } = useOrgStore();
  const [policyList, setPolicyList] = useState<Policy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentPolicy, setCurrentPolicy] = useState<
    Omit<Policy, "id" | "created_at" | "updated_at" | "org_id"> | Policy
  >(defaultPolicy);
  const [isEditing, setIsEditing] = useState(false);
  const [expenseTypeOptions, setExpenseTypeOptions] = useState<string[]>([]);

  const isAdminOrOwner = userRole === "admin" || userRole === "owner";

  useEffect(() => {
    const fetchData = async () => {
      if (!organization?.id) return;
      setIsLoading(true);
      try {
        // Fetch policies
        const { data: policiesData, error: policiesError } = await policies.getPoliciesByOrgId(
          organization.id
        );
        if (policiesError) throw policiesError;
        setPolicyList(policiesData || []);

        // Fetch organization settings to get expense types
        const { data: settings, error: settingsError } = await orgSettings.getByOrgId(
          organization.id
        );
        if (settingsError) throw settingsError;

        // Get expense column definitions from settings or use defaults
        const columnsToUse = settings?.expense_columns && settings.expense_columns.length > 0
          ? settings.expense_columns
          : defaultExpenseColumns;

        // Find the expense_type column
        const expenseTypeColumn = columnsToUse.find((col: any) => col.key === "expense_type");
        
        if (expenseTypeColumn && expenseTypeColumn.options) {
          // Extract expense type options
          const options = expenseTypeColumn.options;
          // Check if options is an array of objects or strings
          if (Array.isArray(options) && options.length > 0 && typeof options[0] === 'object') {
            // Convert array of objects to array of strings
            setExpenseTypeOptions((options as Array<{ value: string; label: string }>).map(opt => opt.label || opt.value));
          } else {
            // It's already a string array
            setExpenseTypeOptions(options as string[]);
          }
        } else {
          // Fallback to default options if not found
          setExpenseTypeOptions(["Travel", "Meals", "Office Supplies", "Equipment", "Software", "Other"]);
        }
      } catch (error: any) {
        toast.error("Failed to load data", {
          description: error.message || "Please try again.",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [organization?.id]);

  const handleOpenDialog = (policyToEdit?: Policy) => {
    if (policyToEdit) {
      setCurrentPolicy(policyToEdit);
      setIsEditing(true);
    } else {
      setCurrentPolicy(defaultPolicy);
      setIsEditing(false);
    }
    setIsDialogOpen(true);
  };

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setCurrentPolicy((prev) => ({
      ...prev,
      [name]: value === "" ? null : value,
    }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setCurrentPolicy((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleNumberInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setCurrentPolicy((prev) => ({
      ...prev,
      [name]: value === "" ? null : Number(value),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !isAdminOrOwner) return;

    setIsSubmitting(true);
    const toastId = toast.loading(
      isEditing ? "Updating policy..." : "Adding policy..."
    );

    try {
      if (isEditing && "id" in currentPolicy) {
        // Update existing policy
        const { id, org_id, created_at, updated_at, ...updateData } =
          currentPolicy;
        const { data, error } = await policies.updatePolicy(id, updateData);
        if (error) throw error;
        setPolicyList((prev) =>
          prev.map((p) => (p.id === id ? (data as Policy) : p))
        );
        toast.success("Policy updated successfully!");
      } else {
        // Create new policy
        const policyPayload = {
          ...currentPolicy,
          org_id: organization.id,
        } as Omit<Policy, "id" | "created_at" | "updated_at">;

        console.log("Creating policy with payload:", policyPayload);
        const { data, error } = await policies.createPolicy(policyPayload);
        if (error) throw error;
        setPolicyList((prev) => [...prev, data as Policy]);
        toast.success("Policy added successfully!");
      }
      setIsDialogOpen(false);
    } catch (error: any) {
      console.error("Error during policy operation:", error);
      toast.error(
        isEditing ? "Failed to update policy" : "Failed to add policy",
        {
          description: error.message || "Please try again.",
        }
      );
    } finally {
      setIsSubmitting(false);
      toast.dismiss(toastId);
    }
  };

  const handleDelete = async (policyId: string) => {
    if (
      !isAdminOrOwner ||
      !window.confirm("Are you sure you want to delete this policy?")
    )
      return;

    const toastId = toast.loading("Deleting policy...");
    try {
      const { error } = await policies.deletePolicy(policyId);
      if (error) throw error;
      setPolicyList((prev) => prev.filter((p) => p.id !== policyId));
      toast.success("Policy deleted successfully!");
    } catch (error: any) {
      toast.error("Failed to delete policy", {
        description: error.message || "Please try again.",
      });
    } finally {
      toast.dismiss(toastId);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-32">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Expense Policies</h2>
        {isAdminOrOwner && (
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Policy
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[525px]">
              <DialogHeader>
                <DialogTitle>{isEditing ? "Edit" : "Add"} Policy</DialogTitle>
                <DialogDescription>
                  {isEditing
                    ? "Update the details for this expense policy."
                    : "Define a new expense policy for your organization."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="expense_type" className="text-right">
                    Expense Type
                  </Label>
                  <div className="col-span-3">
                    <Select
                      value={currentPolicy.expense_type || ""}
                      onValueChange={(value) => handleSelectChange("expense_type", value)}
                    >
                      <SelectTrigger id="expense_type" className="w-full">
                        <SelectValue placeholder="Select expense type" />
                      </SelectTrigger>
                      <SelectContent>
                        {expenseTypeOptions.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="per_unit_cost" className="text-right">
                    Per Unit Cost
                  </Label>
                  <Input
                    id="per_unit_cost"
                    name="per_unit_cost"
                    value={currentPolicy.per_unit_cost || ""}
                    onChange={handleInputChange}
                    className="col-span-3"
                    placeholder="e.g., 3/km, 200/meal"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="upper_limit" className="text-right">
                    Upper Limit (₹)
                  </Label>
                  <Input
                    id="upper_limit"
                    name="upper_limit"
                    type="number"
                    value={currentPolicy.upper_limit || ""}
                    onChange={handleNumberInputChange}
                    className="col-span-3"
                    placeholder="e.g., 5000"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="eligibility" className="text-right">
                    Eligibility
                  </Label>
                  <Input
                    id="eligibility"
                    name="eligibility"
                    value={currentPolicy.eligibility || ""}
                    onChange={handleInputChange}
                    className="col-span-3"
                    placeholder="e.g., All Team Members"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="conditions" className="text-right">
                    Conditions
                  </Label>
                  <Textarea
                    id="conditions"
                    name="conditions"
                    value={currentPolicy.conditions || ""}
                    onChange={handleInputChange}
                    className="col-span-3"
                    placeholder="Enter any specific conditions..."
                  />
                </div>
                <DialogFooter>
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="cursor-pointer"
                  >
                    {isSubmitting ? (
                      <Spinner size="sm" />
                    ) : isEditing ? (
                      "Save Changes"
                    ) : (
                      "Add Policy"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Expense Type</TableHead>
              <TableHead>Per Unit Cost</TableHead>
              <TableHead className="text-right">Upper Limit</TableHead>
              <TableHead>Eligibility</TableHead>
              <TableHead>Conditions</TableHead>
              {isAdminOrOwner && (
                <TableHead className="text-right">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {policyList.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={isAdminOrOwner ? 6 : 5}
                  className="h-24 text-center"
                >
                  No policies defined yet.
                </TableCell>
              </TableRow>
            ) : (
              policyList.map((policy) => (
                <TableRow key={policy.id}>
                  <TableCell className="font-medium">
                    {policy.expense_type}
                  </TableCell>
                  <TableCell>{policy.per_unit_cost || "N/A"}</TableCell>
                  <TableCell className="text-right">
                    {policy.upper_limit ? `₹${policy.upper_limit}` : "N/A"}
                  </TableCell>
                  <TableCell>{policy.eligibility || "N/A"}</TableCell>
                  <TableCell className="max-w-xs truncate">
                    {policy.conditions || "N/A"}
                  </TableCell>
                  {isAdminOrOwner && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenDialog(policy)}
                        className="mr-2"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(policy.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}