"use client";

import { useEffect, useState } from "react";
import { useOrgStore } from "@/store/useOrgStore";
import { toast } from "sonner";
import { invites, organizations, profiles, RemovedUsers, auth } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Trash } from "lucide-react";
import supabase from "@/lib/supabase"; // Add this import
import { useRouter } from "next/navigation";

interface Member {
  id: string;
  email: string;
  role: string;
  fullName?: string;
  avatarUrl?: string;
}

interface InviteFormData {
  email: string;
  role: "member" | "manager" | "admin";
  orgId: string;
  orgName: string;
}

interface InviteResponse {
  success?: boolean;
  inviteId?: string;
  error?: string;
}

export default function TeamPage() {
  const org = useOrgStore((s) => s.organization);
  const userRole = useOrgStore((s) => s.userRole);
  const [members, setMembers] = useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "manager" | "admin">(
    "member"
  );
  const [loading, setLoading] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<string | null>(null);
  const router = useRouter();

  // Fetch organization members
  useEffect(() => {
    async function fetchMembers() {
      if (!org?.id) return;

      setIsLoadingMembers(true);
      try {
        // Get the organization users
        const { data: orgUsers, error: orgUsersError } =
          await organizations.getOrganizationMembers(org.id);

        if (orgUsersError) throw orgUsersError;

        if (orgUsers && orgUsers.length > 0) {
          // Get user IDs
          const userIds = orgUsers.map((user) => user.user_id);

          // Fetch profiles for these users
          const { data: profileData, error: profileError } =
            await profiles.getByIds(userIds);

          if (profileError) throw profileError;

          // Combine the data
          const formattedMembers: Member[] = orgUsers.map((orgUser) => {
            const profile = profileData?.find(
              (p) => p.user_id === orgUser.user_id
            );
            return {
              id: orgUser.id,
              email: profile?.email || orgUser.user_id, // Fallback to user_id if no profile
              role: orgUser.role,
              fullName: profile?.full_name,
              avatarUrl: profile?.avatar_url,
            };
          });

          setMembers(formattedMembers);
        } else {
          setMembers([]);
        }
      } catch (error: any) {
        toast.error("Failed to load team members", {
          description: error.message || "Please try refreshing the page",
        });
      } finally {
        setIsLoadingMembers(false);
      }
    }

    fetchMembers();
  }, [org?.id]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!data?.user || error) {
        toast.error("You have been removed from the dashboard");

        await supabase.auth.signOut();

        clearInterval(interval);
        setTimeout(() => {
          router.replace("/auth/signin");
        }, 3000); // after 3 seconds
      }
    }, 300000); // Every 5 minutes (300000 ms)
    return () => clearInterval(interval);
  }, []);

  const handleInviteSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!org?.id || !org?.name) {
      toast.error("Organization information is missing");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          orgId: org.id,
          orgName: org.name || "Our Organization",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to send invitation");
      }
      console.log("Invite response:", data);
      // If we have an invite URL, copy it and show it to the user
      if (data.inviteUrl) {
        await navigator.clipboard.writeText(data.inviteUrl);
        toast.success("Invitation created successfully!", {
          description: "Share this link with the invited user.",
          duration: 5000,
        });
      } else {
        toast.success("Invitation created successfully!", {
          description: `An invite has been created for ${inviteEmail} to join as a ${inviteRole}.`,
        });
      }

      // Clear form after successful submission
      setInviteEmail("");
      setInviteRole("member");
    } catch (error: any) {
      console.error("Error sending invitation:", error);
      toast.error("Failed to send invitation", {
        description: error.message || "Please try again",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!org?.id) return;

    try {
      const { data: orgUser, error: fetchError } = await organizations.getMemberById(memberId);
      if (fetchError || !orgUser) throw fetchError || new Error("User not found");

      const userId = orgUser.user_id;

      const { data: profile, error: profileError } = await profiles.getById(userId);
      if (profileError || !profile) throw profileError || new Error("Profile not found");

      const insertResult = await RemovedUsers.create({
        user_id: userId,
        email: profile.email,
        full_name: profile.full_name,
        created_at: profile.created_at,
        removable_at: new Date(),

      });
      if (insertResult.error) throw insertResult.error;

      const { error: orgUserDeleteError } = await organizations.deleteOrganizationMember(org.id, memberId);
      if (orgUserDeleteError) throw orgUserDeleteError;

      const { error: profileDeleteError } = await profiles.deleteByUserId(userId);
      if (profileDeleteError) throw profileDeleteError;

      // const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
      // if (authDeleteError) throw authDeleteError;

      // Delete the actual user account via API
      const response = await fetch('/api/delete-auth-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete user account');
      }

      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      toast.success("Member deleted successfully");
    } catch (error: any) {
      console.error("Error deleting member:", error);
      toast.error("Failed to delete member", {
        description: error.message || "Please try again",
      });
    }
  };
  const confirmDeleteMember = (id: string) => {
    setMemberToDelete(id);
    setShowDeleteConfirm(true);
  };

  const executeDeleteMember = async () => {
    if (!memberToDelete) return;
    await handleDeleteMember(memberToDelete);
    setShowDeleteConfirm(false);
    setMemberToDelete(null);
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>
            {org?.name} — {members.length} member
            {members.length !== 1 && "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingMembers ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center py-4 text-muted-foreground"
                    >
                      No team members found
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{m.fullName || "—"}</TableCell>
                      <TableCell>{m.email}</TableCell>
                      <TableCell className="capitalize">{m.role}</TableCell>
                      <TableCell>
                        {(userRole === "owner" || userRole === "admin") && m.role !== "owner" && (
                          <Trash
                            className="w-4 h-4 text-red-500 cursor-pointer hover:text-red-700"
                            onClick={() => confirmDeleteMember(m.id)}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invite Form (only owners/admins/managers) */}
      {(userRole === "owner" ||
        userRole === "admin") && (
          <Card>
            <CardHeader>
              <CardTitle>Invite New Team Member</CardTitle>
              <CardDescription>
                Send an email invite for someone to join this organization.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleInviteSubmit}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <Input
                      placeholder="their‑email@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                      type="email"
                    />
                  </div>
                  <Select
                    value={inviteRole}
                    onValueChange={(v: any) => setInviteRole(v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        {(userRole === "owner" || userRole === "admin") && (
                          <SelectItem value="admin">Admin</SelectItem>
                        )}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Button
                    type="submit"
                    disabled={loading}
                    className="cursor-pointer"
                  >
                    {loading ? "Sending…" : "Send Invite"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-ms">
          <div className="bg-white p-6 rounded shadow-md w-full max-w-sm">
            <h2 className="text-lg font-semibold mb-4">Are you sure you want to delete this user?</h2>
            <div className="flex justify-center space-x-4">
              <Button
                className="cursor-pointer"
                variant="outline"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setMemberToDelete(null);
                }}
              >
                No
              </Button>
              <Button
                className="cursor-pointer"
                variant="destructive"
                onClick={executeDeleteMember}
              >
                Yes
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
