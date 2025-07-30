"use client";

import { useEffect, useState } from "react";
import supabase from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogTitle,
  DialogDescription,
    DialogHeader,
    DialogFooter,
    DialogClose,
    DialogClose as DialogCloseButton,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type BankDetail = {
  id: number;
  account_holder: string;
  account_number: string;
  ifsc_code: string;
  bank_name: string;
  email: string;
  unique_id: string;
};

const PAGE_SIZE = 10;

export default function BankDetailsPage() {
  const [data, setData] = useState<BankDetail[]>([]);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [editing, setEditing] = useState<BankDetail | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const [form, setForm] = useState<Omit<BankDetail, "id">>({
    account_holder: "",
    account_number: "",
    ifsc_code: "",
    bank_name: "",
    email: "",
    unique_id: "",
  });

  useEffect(() => {
    fetchBankDetails();
  }, [search, currentPage]);

    async function fetchBankDetails() {
        let query = supabase
            .from("bank_details")
            .select("*", { count: "exact" })
            .order("id", { ascending: false });

        if (search) {
            query = query.or(`account_holder.ilike.%${search}%,email.ilike.%${search}%`);
        }

        query = query.range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);
    const { data, error } = await query;

    if (error) {
      toast.error("Failed to fetch data");
      return;
    }

    setData(data || []);
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editing) {
      // Ask for confirmation before update
      setShowConfirmDialog(true);
    } else {
      await saveForm(); // Insert directly
    }
  };

  const saveForm = async () => {
    let res;
    if (editing) {
      res = await supabase
        .from("bank_details")
        .update(form)
        .eq("id", editing.id);
    } else {
      res = await supabase.from("bank_details").insert(form);
    }

    if (res.error) {
      toast.error("Failed to save data");
      return;
    }

    toast.success("Saved successfully");
    setEditing(null);
    setForm({
      account_holder: "",
      account_number: "",
      ifsc_code: "",
      bank_name: "",
      email: "",
      unique_id: "",
    });
    fetchBankDetails();
    setDialogOpen(false);
    setShowConfirmDialog(false);
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Bank Details</h2>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          Add New
        </Button>
      </div>

      {/* Add / Edit Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-white shadow-lg max-w-md w-full">
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogTitle className="text-xl font-semibold">
              {editing ? "Edit Bank Detail" : "Add New Bank Detail"}
            </DialogTitle>
            {[
              { name: "account_holder", label: "Account Holder" },
              { name: "account_number", label: "Account Number" },
              { name: "ifsc_code", label: "IFSC Code" },
              { name: "bank_name", label: "Bank Name" },
              { name: "email", label: "Email" },
              { name: "unique_id", label: "Unique ID" },
            ].map(({ name, label }) => (
              <div key={name}>
                <label className="block text-sm font-medium mb-1">
                  {label}
                </label>
                <Input
                  name={name}
                  value={(form as any)[name]}
                  onChange={handleInputChange}
                  required
                />
              </div>
            ))}
            <Button type="submit">{editing ? "Update" : "Save"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Custom Confirmation Dialog for Update */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-xs mx-auto p-4 rounded shadow bg-white">
          <DialogTitle className="text-lg font-semibold">
            Confirm Update
          </DialogTitle>
          <p className="text-sm text-gray-600 mt-2">
            Are you sure you want to update this bank detail?
          </p>
          <div className="flex justify-end gap-2 mt-6">
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={saveForm}>Yes, Update</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Search */}
      <Input
        type="text"
        placeholder="Search by account name or email..."
        value={search}
        onChange={(e) => {
          setCurrentPage(1);
          setSearch(e.target.value);
        }}
      />

      {/* Table */}
      <div className="overflow-auto">
        <table className="min-w-full border border-gray-300 text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-3 py-2">Account Name</th>
              <th className="border px-3 py-2">Account Number</th>
              <th className="border px-3 py-2">IFSC Code</th>
              <th className="border px-3 py-2">Bank Name</th>
              <th className="border px-3 py-2">Email</th>
              <th className="border px-3 py-2">Unique ID</th>
              <th className="border px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-4">
                  No results found
                </td>
              </tr>
            )}
            {data.map((row) => (
              <tr key={row.id}>
                <td className="border px-3 py-2">{row.account_holder}</td>
                <td className="border px-3 py-2">{row.account_number}</td>
                <td className="border px-3 py-2">{row.ifsc_code}</td>
                <td className="border px-3 py-2">{row.bank_name}</td>
                <td className="border px-3 py-2">{row.email}</td>
                <td className="border px-3 py-2">{row.unique_id}</td>
                <td className="border px-3 py-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(row);
                      setForm({ ...row });
                      setDialogOpen(true);
                    }}
                  >
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4">
        <Button
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
        >
          Previous
        </Button>
        <span>Page {currentPage}</span>
            <Button 
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={data.length < PAGE_SIZE}
                >
                    Next
            </Button>
            </div>
        </div>
    );
}