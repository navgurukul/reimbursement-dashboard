"use client";

import { useEffect, useState } from "react";
import { accessPermissions, AccessPermission } from "@/lib/db";
import { useOrgStore } from "@/store/useOrgStore";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Shield, Trash2, UserPlus } from "lucide-react";

export default function AccessPage() {
  const { organization, userRole } = useOrgStore();
  const [emails, setEmails] = useState<AccessPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isAdmin = userRole === "owner" || userRole === "admin";

  useEffect(() => {
    fetchAccessList();
  }, [organization?.id]);

  const fetchAccessList = async () => {
    if (!organization?.id) return;
    setLoading(true);
    try {
      const { data, error } = await accessPermissions.getByFeature(
        organization.id as string,
        "export"
      );
      if (error) throw error;
      setEmails(data || []);
    } catch (err: any) {
      toast.error("Failed to load access list");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organization?.id || !newEmail.trim()) return;
    
    // basic email validation
    if (!/^\S+@\S+\.\S+$/.test(newEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setAdding(true);
    try {
      const { error, data } = await accessPermissions.grantAccess(
        organization.id as string,
        newEmail,
        "export"
      );

      if (error) {
        if (error.code === "23505") { // unique violation
          toast.error("This email already has access");
        } else {
          throw error;
        }
      } else if (data) {
        toast.success("Access granted successfully");
        setNewEmail("");
        setEmails((prev) => [data, ...prev]);
      }
    } catch (err: any) {
      toast.error("Failed to grant access", { description: err.message });
    } finally {
      setAdding(false);
    }
  };

  const handleRevokeAccess = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await accessPermissions.revokeAccess(id);
      if (error) throw error;
      
      toast.success("Access revoked");
      setEmails((prev) => prev.filter((e) => e.id !== id));
    } catch (err: any) {
      toast.error("Failed to revoke access", { description: err.message });
    } finally {
      setDeletingId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
        <Shield className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Access Denied</h2>
        <p className="text-muted-foreground">
          You need administrator privileges to view this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Access Control</h1>
        <p className="text-muted-foreground">
          Manage which users have access to specific features in this organization.
        </p>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="p-6 border-b bg-muted/20">
          <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
            <Shield className="w-5 h-5" /> Export Access
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Users listed below will see the "Export" button on expenses, finance records, and payment pages.
          </p>
          
          <form onSubmit={handleAddEmail} className="flex gap-2">
            <Input
              type="email"
              placeholder="Enter user email..."
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="max-w-sm"
              required
            />
            <Button type="submit" disabled={adding || !newEmail.trim()}>
              <UserPlus className="w-4 h-4 mr-2" />
              {adding ? "Adding..." : "Grant Access"}
            </Button>
          </form>
        </div>

        <div className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Added On</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : emails.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                    No users have been granted export access yet.
                  </TableCell>
                </TableRow>
              ) : (
                emails.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.email}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleRevokeAccess(item.id)}
                        disabled={deletingId === item.id}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
