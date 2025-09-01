"use client";

import { useEffect, useState } from "react";
import { useOrgStore } from "@/store/useOrgStore";
import { toast } from "sonner";
import { organizations, profiles, RemovedUsers, authUsers } from "@/lib/db";
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
import { useAuthStore } from "@/store/useAuthStore";
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
import { Trash, Copy, Link2, Users, User, Shield, Settings } from "lucide-react";
import supabase from "@/lib/supabase"; // Add this import
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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
  const [multiUserRole, setMultiUserRole] = useState<
    "member" | "manager" | "admin"
  >("member");
  const [showInviteCard, setShowInviteCard] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'email' | 'link'>('email');
  const [loading, setLoading] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<string | null>(null);
  const router = useRouter();
  const { logout } = useAuthStore();
  const [isDeleting, setIsDeleting] = useState(false);

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

  // Handle invite form submission with AWS SES email
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

      // If we have an invite URL, copy it and show it to the user
      if (data.inviteUrl) {
        await navigator.clipboard.writeText(data.inviteUrl);
        toast.success("Invitation Sent successfully!", {
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


  // Add this wrapper function inside your TeamPage component
  const handleInviteSubmitWrapper = (event: React.MouseEvent<HTMLButtonElement> | React.FormEvent<HTMLFormElement>) => {
    // If it's a form event, prevent default behavior
    if (event.type === 'submit') {
      event.preventDefault();
    }
    // Call the original handler
    handleInviteSubmit(event as React.FormEvent<HTMLFormElement>);
  };

  // Handle multi-user link generation
  const handleGenerateLink = async () => {
    if (!org?.id || !org?.name) {
      toast.error("Organization information is missing");
      return;
    }

    setLinkLoading(true);

    try {
      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        toast.error("User not authenticated");
        return;
      }

      const response = await fetch("/api/invite/generate-link", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: multiUserRole,
          orgId: org.id,
          orgName: org.name || "Our Organization",
          userId: user.id, // Send user ID from frontend
          maxUses: null, // You can add UI controls for this later
          expiresInDays: 7, // You can add UI controls for this later
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate link");
      }

      if (data.inviteUrl) {
        setGeneratedLink(data.inviteUrl);
        toast.success("Link generated successfully!", {
          description: "You can now share this link with multiple users.",
        });
      }
    } catch (error: any) {
      console.error("Error generating link:", error);
      toast.error("Failed to generate link", {
        description: error.message || "Please try again",
      });
    } finally {
      setLinkLoading(false);
    }
  };

  // Copy generated link to clipboard
  const copyLinkToClipboard = async () => {
    if (generatedLink) {
      await navigator.clipboard.writeText(generatedLink);
      toast.success("Link copied to clipboard!");
    }
  };

  const handleDeleteMember = async (memberId: string) => {
    if (!org?.id) return;

    try {
      //  Get the organization user
      const { data: orgUser, error: fetchError } = await organizations.getMemberById(memberId);
      if (fetchError || !orgUser) throw fetchError || new Error("User not found");

      const userId = orgUser.user_id;

      //  Get user profile
      const { data: profile, error: profileError } = await profiles.getById(userId);
      if (profileError || !profile) throw profileError || new Error("Profile not found");

      //  Backup into RemovedUsers
      const insertResult = await RemovedUsers.create({
        user_id: userId,
        email: profile.email,
        full_name: profile.full_name,
        created_at: profile.created_at,
        removable_at: new Date(),
      });
      if (insertResult.error) throw insertResult.error;

      // Delete the auth user account via API
      // const response = await fetch("/api/delete-auth-user", {
      //   method: "POST",
      //   headers: {
      //     "Content-Type": "application/json",
      //   },
      //   body: JSON.stringify({ userId, email: profile.email }),
      // });

      // if (!response.ok) {
      //   let errorMsg = "Failed to delete user account";
      //   try {
      //     const errorData = await response.json();
      //     errorMsg = errorData.error || errorMsg;
      //   } catch {
      //     // ignore if response isn't JSON
      //   }
      //   throw new Error(errorMsg);
      // }

      // inside handleDeleteMember
      const deleteResult = await authUsers.deleteUserCompletely(userId, profile.email);

      if (!deleteResult.success) {
        throw new Error(deleteResult.errors?.[0] || "Failed to delete user account");
      }

      //  Update frontend state
      setMembers((prev) => prev.filter((m) => m.id !== memberId));

      //  Success toast
      toast.success("Member deleted successfully");
    } catch (error: any) {
      console.error("Error deleting member:", error);
      toast.error("Failed to delete member", {
        description: error.message || "Please try again",
      });
    }
  };

  const confirmDeleteMember = (id: string) => {
    console.log("Id of the member to delete:", id);
    setMemberToDelete(id);
    setShowDeleteConfirm(true);
  };

  const executeDeleteMember = async () => {
    console.log("Executing delete for member:", memberToDelete);
    if (!memberToDelete) return;
    setIsDeleting(true); // Start loader
    await handleDeleteMember(memberToDelete);
    setIsDeleting(false); // Stop loader
    setShowDeleteConfirm(false);
    setMemberToDelete(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Team Members</h1>
          <p className="text-sm text-muted-foreground">
            {org?.name} — {members.length} member{members.length !== 1 && "s"}
          </p>
        </div>
        {(userRole === "owner" || userRole === "admin") && (
          <Button
            onClick={() => setShowInviteCard(true)}
            className="bg-primary text-white"
          >
            Invite Members
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Users className="w-5 h-5 text-gray-700" /> {/* Lucide Users icon */}
            Active Members
          </CardTitle>
          <CardDescription>Manage your team members and their roles.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {isLoadingMembers ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : (
            members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between border rounded-lg px-4 py-3 shadow-sm bg-white"
              >
                <div>
                  <div className="font-medium">{m.fullName || "—"}</div>
                  <div className="text-sm text-muted-foreground">{m.email}</div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${m.role === "owner"
                      ? "bg-yellow-100 text-yellow-800"
                      : m.role === "admin"
                        ? "bg-red-100 text-red-800"
                        : m.role === "manager"
                          ? "bg-indigo-100 text-indigo-800"
                          : "bg-green-100 text-green-800"
                      }`}
                  >
                    {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                  </span>
                  <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 font-medium">
                    Active
                  </span>

                  {(userRole === "owner" || userRole === "admin") && m.role !== "owner" && (
                    <Trash
                      className="w-4 h-4 text-red-500 cursor-pointer hover:text-red-700"
                      onClick={() => confirmDeleteMember(m.id)}
                    />
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Invite Modal */}

      <Dialog open={showInviteCard} onOpenChange={setShowInviteCard}>
        <DialogContent className="max-w-[500px] bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Invite New Team Members</DialogTitle>
            <DialogDescription className="text-gray-600 text-sm">
              Add new members to your team by sending email invitations or generating a shareable link.
            </DialogDescription>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              className={`px-4 py-2 text-sm font-medium ${activeTab === 'email' ? 'text-black border-b-2 border-black' : 'text-gray-500'}`}
              onClick={() => setActiveTab('email')}
            >
              Email Invites
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium ${activeTab === 'link' ? 'text-black border-b-2 border-black' : 'text-gray-500'}`}
              onClick={() => setActiveTab('link')}
            >
              Shareable Link
            </button>
          </div>

          {/* Email Invite Tab */}
          {activeTab === 'email' && (
            <div className="space-y-4 pt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Addresses</label>
                <textarea
                  className="w-full p-2 border border-gray-300 rounded text-sm h-15"
                  placeholder="john@example.com&#10;sarah@example.com&#10;mike@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Enter one email address per line. You can invite multiple people at once.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Role</label>
                <Select value={inviteRole} onValueChange={(v: any) => setInviteRole(v)}>
                  <SelectTrigger className="w-full border-gray-300">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectGroup>
                      <SelectItem value="member">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          <span>Member</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="manager">
                        <div className="flex items-center gap-2">
                          <Settings className="w-4 h-4" />
                          <span>Manager</span>
                        </div>
                      </SelectItem>
                      {(userRole === "owner" || userRole === "admin") && (
                        <SelectItem value="admin">
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            <span>Admin</span>
                          </div>
                        </SelectItem>
                      )}
                    </SelectGroup>
                  </SelectContent>
                </Select>

              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-black"
                  onClick={() => setShowInviteCard(false)}
                >
                  Cancel
                </Button>

                {/*Then modify your button to use the wrapper */}
                <Button
                  className="bg-black text-white hover:bg-gray-800"
                  onClick={handleInviteSubmitWrapper}
                  disabled={loading}
                >
                  {loading ? <Spinner className="mr-2 h-4 w-4" /> : null}
                  {loading ? "Sending..." : "Send invitations"}
                </Button>
              </div>
            </div>
          )}

          {/* Shareable Link Tab */}
          {activeTab === 'link' && (
            <div className="space-y-4 pt-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-black flex-1"
                  onClick={handleGenerateLink}
                  disabled={linkLoading}
                >
                  {linkLoading ? <Spinner className="mr-2 h-4 w-4" /> : <Link2 className="w-4 h-4 mr-2" />}
                  {linkLoading ? "Generating..." : "Generate Link"}
                </Button>
                <Select
                  value={multiUserRole}
                  onValueChange={(v: any) => setMultiUserRole(v)}
                >
                  <SelectTrigger className="w-[150px] border-gray-300">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectGroup>
                      <SelectItem value="member">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          <span>Member</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="manager">
                        <div className="flex items-center gap-2">
                          <Settings className="w-4 h-4" />
                          <span>Manager</span>
                        </div>
                      </SelectItem>
                      {(userRole === "owner" || userRole === "admin") && (
                        <SelectItem value="admin">
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            <span>Admin</span>
                          </div>
                        </SelectItem>
                      )}
                    </SelectGroup>
                  </SelectContent>
                </Select>

              </div>
              {generatedLink && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Generated Link</label>
                  <div className="flex gap-2">
                    <Input
                      value={generatedLink}
                      readOnly
                      className="font-mono text-sm border-gray-300"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      className="border-gray-300 hover:bg-gray-50"
                      onClick={copyLinkToClipboard}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Anyone with this link can join as {multiUserRole}.
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Are you sure you want to delete this user?</DialogTitle>
              <DialogDescription>
                This action cannot be undone. The user will be permanently removed from your organization.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-4">
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setMemberToDelete(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={executeDeleteMember}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Deleting...
                  </>
                ) : (
                  "Delete User"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

