// src/app/org/[slug]/settings/policies/page.tsx

"use client";
import { useEffect, useState } from "react";
import { useOrgStore } from "@/store/useOrgStore";
import { useOrgInitialization } from "@/hooks/useOrgInitialization";
import { policies, Policy, orgSettings, policyFiles } from "@/lib/db";
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
import { PlusCircle, Edit, Trash2, Upload } from "lucide-react";
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
  
  // Initialize organization data from cache
  useOrgInitialization();
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [deletePolicyId, setDeletePolicyId] = useState<string | null>(null);

  const [currentPolicy, setCurrentPolicy] = useState<
    Omit<Policy, "id" | "created_at" | "updated_at" | "org_id"> | Policy
  >(defaultPolicy);
  const [isEditing, setIsEditing] = useState(false);
  const [expenseTypeOptions, setExpenseTypeOptions] = useState<string[]>([]);

  const isAdminOrOwner = userRole === "admin" || userRole === "owner";

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string>("");


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
    setPdfFile(null);
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


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Validate file type
      if (!file.type.includes('pdf')) {
        toast.error('Only PDF files are allowed');
        return;
      }

      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        toast.error('File size must be under 5MB');
        return;
      }

      setPdfFile(file);
      setSelectedFileName(file.name);
      toast.success('PDF selected successfully');
    } catch (error) {
      toast.error('Failed to select file');
      if (e.target) e.target.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !isAdminOrOwner) return;

    setIsSubmitting(true);
    const toastId = toast.loading(isEditing ? "Updating policy..." : "Adding policy...");

    try {
      let pdfUrl = currentPolicy.policy_url;
      console.log("Current PDF URL:", pdfUrl);

      // Only upload if new file was selected
      // if (pdfFile) {
      //   console.log("Starting file upload...", {
      //     fileName: pdfFile.name,
      //     fileSize: pdfFile.size,
      //     fileType: pdfFile.type
      //   });

      //   const formData = new FormData();
      //   formData.append("file", pdfFile);

      //   const response = await fetch("/api/upload-policy-pdf", {
      //     method: "POST",
      //     body: formData,
      //   });

      //   console.log("File upload response:", response);
      //   console.log("Response status:", response.status);
      //   console.log("Response ok:", response.ok);

      //   // Get response text first to see what we're actually getting
      //   const responseText = await response.text();
      //   console.log("Raw response:", responseText);

      //   if (!response.ok) {
      //     console.error("Response not ok:", response.status, responseText);

      //     // Try to parse as JSON, fallback to text
      //     let errorData;
      //     try {
      //       errorData = JSON.parse(responseText);
      //     } catch {
      //       errorData = { error: responseText };
      //     }

      //     throw new Error(errorData.error || `HTTP ${response.status}: ${responseText}`);
      //   }

      //   // Parse the JSON response
      //   const result = JSON.parse(responseText);
      //   console.log("Parsed upload response:", result);

      //   // Check if upload was successful
      //   if (!result.success) {
      //     throw new Error(result.error || "Upload failed - success false");
      //   }

      //   // Extract the URL from the response
      //   pdfUrl = result.url;

      //   // Verify we got a valid URL
      //   if (!pdfUrl) {
      //     throw new Error("No URL returned from upload");
      //   }

      //   console.log("PDF URL set to:", pdfUrl);
      // }

      // ✅ Upload directly using db.ts helper (no API call)
      if (pdfFile) {
        const uploadResult = await policyFiles.upload(pdfFile, organization.id);

        if (!uploadResult.success) {
          throw new Error(uploadResult.error || "Upload failed");
        }

        pdfUrl = uploadResult.url;
      }

      // CREATE THE POLICY PAYLOAD AND SAVE TO DATABASE
      const policyPayload = {
        ...currentPolicy,
        org_id: organization.id,
        policy_url: pdfUrl,
      };

      console.log("Policy payload being saved:", policyPayload);

      if (isEditing && "id" in currentPolicy) {
        // Update existing policy
        const { data, error } = await policies.updatePolicy(currentPolicy.id, policyPayload);
        if (error) throw error;

        console.log("Updated policy data:", data);
        setPolicyList(prev => prev.map(p => p.id === currentPolicy.id ? data as Policy : p));
      } else {
        // Create new policy
        const { data, error } = await policies.createPolicy(policyPayload);
        if (error) throw error;

        console.log("Created policy data:", data);
        setPolicyList(prev => [...prev, data as Policy]);
      }

      // Close dialog and reset state
      setIsDialogOpen(false);
      setPdfFile(null);
      setCurrentPolicy(defaultPolicy);
      toast.success(isEditing ? "Policy updated!" : "Policy created!");

    } catch (error: any) {
      console.error("Submit error:", error);
      toast.error(error.message || "Failed to save policy");
    } finally {
      setIsSubmitting(false);
      toast.dismiss(toastId);
    }
  };


  const handleDelete = (policyId: string) => {
    if (!isAdminOrOwner) return;
    setDeletePolicyId(policyId); // Triggers the modal
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
                  <Label htmlFor="upper_limit">
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
                <div className="grid grid-cols-4 items-center gap-4 mt-6">
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
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="fileUpload" className="text-right">
                    Policies
                  </Label>
                  <div className="col-span-3">
                    <label
                      htmlFor="fileUpload"
                      className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 text-gray rounded border border-gray-400"
                    >
                      <Upload className="w-5 h-5" />
                      Upload Policy
                    </label>

                    <input
                      type="file"
                      id="fileUpload"
                      name="fileUpload"
                      accept="application/pdf"
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    {selectedFileName && (
                      <p className="text-sm text-gray-600 mt-1">
                        Selected file: {selectedFileName}
                      </p>
                    )}
                  </div>
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
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow>
              <TableHead>Expense Type</TableHead>
              <TableHead>Per Unit Cost</TableHead>
              <TableHead>Upper Limit</TableHead>
              <TableHead>Eligibility</TableHead>
              <TableHead>Conditions</TableHead>
              <TableHead>Policies</TableHead>
              {isAdminOrOwner && (
                <TableHead className="w-1/6 px-4 text-center">Actions</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {policyList.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={isAdminOrOwner ? 7 : 6}
                  className="h-24 text-center"
                >
                  No policies defined yet.
                </TableCell>
              </TableRow>
            ) : (
              policyList.map((policy) => (
                <TableRow key={policy.id}>
                  <TableCell className="w-1/6 px-4">
                    {policy.expense_type}
                  </TableCell>
                  <TableCell className="w-1/6 px-4">{policy.per_unit_cost || "N/A"}</TableCell>
                  <TableCell className="w-1/6 px-4">
                    {policy.upper_limit ? `₹${policy.upper_limit}` : "N/A"}
                  </TableCell>
                  <TableCell className="whitespace-pre-wrap break-words max-w-xs">{policy.eligibility || "N/A"}</TableCell>
                  <TableCell className="whitespace-pre-wrap break-words max-w-xs">
                    {policy.conditions || "N/A"}
                  </TableCell>


                  <TableCell>
                    {policy.policy_url ? (
                      <a
                        href={policy.policy_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-black-600"
                      >
                        View Policy
                      </a>
                    ) : (
                      <span className="text-gray-500 italic">No PDF</span>
                    )}
                  </TableCell>
                  {isAdminOrOwner && (
                    <TableCell className="w-1/6 px-4">
                      <div className="flex justify-center items-center space-x-2">
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
                          onClick={() => setDeletePolicyId(policy.id)} // Open modal
                          className="h-8 w-8"
                        >
                          <Trash2 className="h-4 w-4 text-red-600 hover:text-red-800" />
                        </Button>
                      </div>
                      {/* Delete Confirmation Dialog */}
                      <Dialog open={!!deletePolicyId} onOpenChange={() => setDeletePolicyId(null)}>
                        <DialogContent className="!bg-white !text-black">
                          <DialogHeader>
                            <DialogTitle>Delete Policy</DialogTitle>
                            <DialogDescription>
                              Are you sure you want to delete this policy?
                            </DialogDescription>
                          </DialogHeader>
                          <DialogFooter>
                            <Button variant="secondary" onClick={() => setDeletePolicyId(null)}>
                              Cancel
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={async () => {
                                const toastId = toast.loading("Deleting policy...");
                                try {
                                  const { error } = await policies.deletePolicy(deletePolicyId!);
                                  if (error) throw error;
                                  setPolicyList((prev) => prev.filter((p) => p.id !== deletePolicyId));
                                  toast.success("Policy deleted successfully!");
                                } catch (error: any) {
                                  toast.error("Failed to delete policy", {
                                    description: error.message || "Please try again.",
                                  });
                                } finally {
                                  toast.dismiss(toastId);
                                  setDeletePolicyId(null);
                                }
                              }}
                            >
                              Yes, Delete
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

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