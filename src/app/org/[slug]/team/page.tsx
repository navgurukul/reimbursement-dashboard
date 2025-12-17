"use client";

import { useEffect, useState, useMemo } from "react";
import { useOrgStore } from "@/store/useOrgStore";
import { toast } from "sonner";
import { organizations, profiles, RemovedUsers, authUsers } from "@/lib/db";
import { deleteUserAction } from "@/app/actions/deleteUser";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Trash,
  Copy,
  Link2,
  Users,
  User,
  Shield,
  Settings,
  Filter,
} from "lucide-react";
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
  userId: string;
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
  const [activeTab, setActiveTab] = useState<"email" | "link">("email");
  const [loading, setLoading] = useState(false);
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [memberToDelete, setMemberToDelete] = useState<string | null>(null);
  const router = useRouter();
  const { logout } = useAuthStore();
  const [isDeleting, setIsDeleting] = useState(false);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputId = "invite-emails-file-input";
  const [mappingOpen, setMappingOpen] = useState(false);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [selectedEmailColumn, setSelectedEmailColumn] = useState<number | null>(
    null
  );
  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PER_PAGE = 10;

  // Search state (client-side filtering)
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");
  // Role filter state
  const [roleFilter, setRoleFilter] = useState<
    "all" | "owner" | "member" | "manager" | "admin"
  >("all");

  // Debounce the search input to avoid rapid filtering while typing
  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch]);

  // Reset page when role filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [roleFilter]);

  const filteredMembers = useMemo(() => {
    let result = members;

    // Apply role filter first
    if (roleFilter !== "all") {
      result = result.filter((m) => m.role === roleFilter);
    }

    // Apply search filter
    if (!debouncedSearch) return result;
    const q = debouncedSearch.toLowerCase();
    return result.filter((m) => {
      const name = (m.fullName || "").toLowerCase();
      const email = (m.email || "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [members, debouncedSearch, roleFilter]);

  const detectDelimiter = (line: string) => {
    const candidates = [",", "\t", ";"];
    let best = ",";
    let bestCount = -1;
    for (const d of candidates) {
      const c = (line.match(new RegExp(d === "\\t" ? "\\t" : d, "g")) || [])
        .length;
      if (c > bestCount) {
        best = d;
        bestCount = c;
      }
    }
    return best;
  };

  const parseCsv = (text: string): { headers: string[]; rows: string[][] } => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };
    const delimiter = detectDelimiter(lines[0]);
    const splitLine = (l: string) =>
      l.split(delimiter).map((s) => s.trim().replace(/^"|"$/g, ""));
    const first = splitLine(lines[0]);
    const second = lines[1] ? splitLine(lines[1]) : [];
    const emailLike = /@/;
    const looksLikeHeader =
      first.some((h) => !emailLike.test(h)) &&
      (second.length === first.length
        ? second.some((v) => emailLike.test(v))
        : true);
    const headers = looksLikeHeader
      ? first
      : first.map((_, i) => `Column ${i + 1}`);
    const startIdx = looksLikeHeader ? 1 : 0;
    const rows = lines.slice(startIdx).map(splitLine);
    return { headers, rows };
  };

  // Fetch organization members
  useEffect(() => {
    // Fetch current user id for self-change restriction
    (async () => {
      const { data } = await supabase.auth.getUser();
      setCurrentUserId(data?.user?.id ?? null);
    })();

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
              userId: orgUser.user_id,
            };
          });

          setMembers(formattedMembers);
          // Reset to first page after loading members
          setCurrentPage(1);
        } else {
          setMembers([]);
          setCurrentPage(1);
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

    // Parse multiple emails from textarea: split by newline/commas/semicolons/tabs
    const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
    const parsedEmails = Array.from(
      new Set(
        inviteEmail
          .split(/[\n,;\t]+/)
          .map((s) => (s.match(emailRegex)?.[0] || "").toLowerCase().trim())
          .filter(Boolean)
      )
    );

    if (parsedEmails.length === 0) {
      toast.error("Please enter at least one valid email");
      return;
    }

    setLoading(true);

    try {
      const results = await Promise.all(
        parsedEmails.map(async (email) => {
          try {
            const response = await fetch("/api/invite", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                email,
                role: inviteRole,
                orgId: org.id,
                orgName: org.name || "Our Organization",
              }),
            });
            const data = await response.json();
            if (!response.ok) {
              return { email, ok: false, error: data.error || "Unknown error" };
            }
            return { email, ok: true };
          } catch (err: any) {
            return { email, ok: false, error: err?.message || "Network error" };
          }
        })
      );

      const succeeded = results.filter((r) => r.ok).map((r) => r.email);
      const failed = results.filter((r) => !r.ok) as {
        email: string;
        ok: false;
        error?: string;
      }[];

      if (succeeded.length > 0) {
        toast.success(`Invites sent: ${succeeded.length}`);
      }
      if (failed.length > 0) {
        toast.error(`Failed: ${failed.length}`, {
          description:
            failed
              .slice(0, 3)
              .map((f) => `${f.email}: ${f.error || "Error"}`)
              .join("\n") +
            (failed.length > 3 ? `\n+${failed.length - 3} more...` : ""),
        });
        // Keep failed emails in textarea for correction/resend
        setInviteEmail(failed.map((f) => f.email).join("\n"));
      } else {
        // Clear form on full success
        setInviteEmail("");
      }

      setInviteRole("member");
    } catch (error: any) {
      console.error("Error sending invitations:", error);
      toast.error("Failed to send invitations", {
        description: error.message || "Please try again",
      });
    } finally {
      setLoading(false);
    }
  };

  // Add this wrapper function inside your TeamPage component
  const handleInviteSubmitWrapper = (
    event:
      | React.MouseEvent<HTMLButtonElement>
      | React.FormEvent<HTMLFormElement>
  ) => {
    // If it's a form event, prevent default behavior
    if (event.type === "submit") {
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
      // Get the organization user
      const { data: orgUser, error: fetchError } =
        await organizations.getMemberById(memberId);
      if (fetchError || !orgUser) {
        toast.error("User not found");
        return;
      }

      const userId = orgUser.user_id;

      // Get user profile
      const { data: profile, error: profileError } = await profiles.getById(
        userId
      );
      if (profileError || !profile) {
        toast.error("Profile not found");
        return;
      }

      // Backup into RemovedUsers
      const insertResult = await RemovedUsers.create({
        user_id: userId,
        email: profile.email,
        full_name: profile.full_name,
        created_at: profile.created_at,
        removable_at: new Date(),
      });
      if (insertResult.error) {
        toast.error("Failed to backup user", {
          description: insertResult.error.message,
        });
        return;
      }

      // Call the secure server-side API route instead of accessing env vars directly
      const response = await fetch("/api/delete-auth-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          email: profile.email,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        toast.error("Failed to delete member", {
          description: result.error || "Please try again",
        });
        return;
      }

      // Update frontend state
      setMembers((prev) => prev.filter((m) => m.id !== memberId));

      // Success toast
      toast.success("Member deleted successfully");
    } catch (error: any) {
      console.error("Error deleting member:", error);
      toast.error("Unexpected error", {
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
    setIsDeleting(true); // Start loader
    await handleDeleteMember(memberToDelete);
    setIsDeleting(false); // Stop loader
    setShowDeleteConfirm(false);
    setMemberToDelete(null);
  };

  const handleChangeMemberRole = async (
    memberId: string,
    newRole: "member" | "manager" | "admin"
  ) => {
    if (!org?.id || !currentUserId) return;

    // Find member and prevent owner changes on UI side as well
    const target = members.find((m) => m.id === memberId);
    if (!target) return;
    // Block changing own role from UI as an extra safeguard
    if (target.userId === currentUserId) {
      toast.error("You cannot change your own role");
      return;
    }

    const prevRole = target.role;
    setUpdatingRoleId(memberId);

    // Optimistic update
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
    );

    try {
      const result = await organizations.updateMemberRole(
        org.id,
        memberId,
        newRole,
        currentUserId
      );

      if (!result.success) {
        throw new Error(result.error || "Failed to update role");
      }
      toast.success("Role updated");
    } catch (err: any) {
      // Revert on failure
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? { ...m, role: prevRole } : m))
      );
      toast.error("Could not update role", {
        description: err?.message || "Please try again",
      });
    } finally {
      setUpdatingRoleId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Team Members</h1>
          <p className="text-sm text-muted-foreground">
            {org?.name} —{" "}
            {roleFilter !== "all" || debouncedSearch
              ? `${filteredMembers.length} of ${members.length} member${
                  members.length !== 1 ? "s" : ""
                }`
              : `${members.length} member${members.length !== 1 && "s"}`}
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
            <Users className="w-5 h-5 text-gray-700" />{" "}
            {/* Lucide Users icon */}
            Manage your team members and their roles
          </CardTitle>
          {/* <CardDescription>Manage your team members and their roles.</CardDescription> */}
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search by name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="max-w-lg w-full"
              />
            </div>

            <div className="w-full sm:w-[180px] rounded-md mt-2 sm:mt-0">
              <Select
                value={roleFilter}
                onValueChange={(v: any) => setRoleFilter(v)}
              >
                <SelectTrigger className="w-full cursor-pointer">
                  <SelectValue placeholder="Filter role" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectGroup>
                    <SelectItem value="all" className="cursor-pointer">
                      <div className="flex items-center gap-2 px-2 py-1">
                        <Filter className="h-4 w-4" />
                        <span>Filter By Role</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="owner" className="cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span>Owner</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="member" className="cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span>Member</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="manager" className="cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span>Manager</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="admin" className="cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span>Admin</span>
                      </div>
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          {isLoadingMembers ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="border rounded-lg px-4 py-3 shadow-sm bg-white"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-5 w-full max-w-[200px]" />
                      <Skeleton className="h-4 w-full max-w-[250px]" />
                    </div>
                    <div className="flex gap-2">
                      <Skeleton className="h-8 w-28" />
                      <Skeleton className="h-8 w-8" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // compute slice for current page
            (() => {
              const total = filteredMembers.length;
              const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
              const start = (currentPage - 1) * PER_PAGE;
              const end = start + PER_PAGE;
              const pageMembers = filteredMembers.slice(start, end);

              return (
                <>
                  {pageMembers.map((m) => (
                    <div
                      key={m.id}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between border rounded-lg px-4 py-3 shadow-sm bg-white"
                    >
                      <div>
                        <div className="font-medium">{m.fullName || "—"}</div>
                        <div className="text-sm text-muted-foreground">
                          {m.email}
                        </div>
                      </div>

                      <div className="mt-2 sm:mt-0 flex flex-wrap items-center gap-2">
                        {userRole !== "admin" && userRole !== "owner" && (
                          <span
                            className={`text-xs px-4 py-2 rounded-full font-medium shadow-sm bg-white border ${
                              m.role === "owner"
                                ? "text-black border-gray-200 cursor-pointer"
                                : m.role === "admin"
                                ? "text-black border-gray-200 cursor-pointer"
                                : m.role === "manager"
                                ? "text-black border-gray-200 cursor-pointer"
                                : "text-black border-gray-200 cursor-pointer"
                            }`}
                          >
                            {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                          </span>
                        )}
                        {(userRole === "owner" || userRole === "admin") &&
                          (m.role === "owner" ? (
                            <span
                              className={`text-xs px-4 py-2 rounded-full font-medium shadow-sm bg-white border ${
                                m.role === "owner"
                                  ? "text-black border-gray-200 cursor-pointer"
                                  : m.role === "admin"
                                  ? "text-black border-gray-200 cursor-pointer"
                                  : m.role === "manager"
                                  ? "text-black border-gray-200 cursor-pointer"
                                  : "text-black border-gray-200 cursor-pointer"
                              }`}
                            >
                              {m.role.charAt(0).toUpperCase() + m.role.slice(1)}
                            </span>
                          ) : (
                            <Select
                              value={m.role as any}
                              onValueChange={(v: any) =>
                                handleChangeMemberRole(m.id, v)
                              }
                              disabled={updatingRoleId === m.id}
                            >
                              <SelectTrigger
                                className={`text-sm h-8 rounded-full px-3 py-1 flex items-center justify-between gap-2 min-w-[140px] shadow-sm bg-white border ${
                                  m.role === "owner"
                                    ? "text-black border-gray-200 cursor-pointer"
                                    : m.role === "admin"
                                    ? "text-black border-gray-200 cursor-pointer"
                                    : m.role === "manager"
                                    ? "text-black border-gray-200 cursor-pointer"
                                    : "text-black border-gray-200 cursor-pointer"
                                }`}
                              >
                                <div className="flex-1 text-center">
                                  <SelectValue placeholder="Change role" />
                                </div>
                              </SelectTrigger>
                              <SelectContent className="bg-white">
                                <SelectGroup>
                                  <SelectItem
                                    value="member"
                                    className="cursor-pointer"
                                  >
                                    <span>Member</span>
                                  </SelectItem>
                                  <SelectItem
                                    value="manager"
                                    className="cursor-pointer"
                                  >
                                    <span>Manager</span>
                                  </SelectItem>
                                  <SelectItem
                                    value="admin"
                                    className="cursor-pointer"
                                  >
                                    <span>Admin</span>
                                  </SelectItem>
                                </SelectGroup>
                              </SelectContent>
                            </Select>
                          ))}

                        {(userRole === "owner" || userRole === "admin") &&
                          m.role !== "owner" && (
                            <Trash
                              className="w-5 h-5 text-red-500 cursor-pointer hover:text-red-700"
                              onClick={() => confirmDeleteMember(m.id)}
                            />
                          )}
                      </div>
                    </div>
                  ))}

                  {/* Pagination controls */}
                  <div className="flex items-center justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                      className="cursor-pointer caret-transparent"
                    >
                      Previous
                    </Button>

                    <div className="text-sm text-muted-foreground">
                      {currentPage} of {totalPages}
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={currentPage >= totalPages}
                      className="cursor-pointer caret-transparent"
                    >
                      Next
                    </Button>
                  </div>
                </>
              );
            })()
          )}
        </CardContent>
      </Card>

      {/* Invite Modal */}

      <Dialog open={showInviteCard} onOpenChange={setShowInviteCard}>
        <DialogContent className="max-w-[500px] bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Invite New Team Members
            </DialogTitle>
            <DialogDescription className="text-gray-600 text-sm">
              Add new members to your team by sending email invitations or
              generating a shareable link.
            </DialogDescription>
          </DialogHeader>

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === "email"
                  ? "text-black border-b-2 border-black"
                  : "text-gray-500"
              }`}
              onClick={() => setActiveTab("email")}
            >
              Email Invites
            </button>
            <button
              className={`px-4 py-2 text-sm font-medium ${
                activeTab === "link"
                  ? "text-black border-b-2 border-black"
                  : "text-gray-500"
              }`}
              onClick={() => setActiveTab("link")}
            >
              Shareable Link
            </button>
          </div>

          {/* Email Invite Tab */}
          {activeTab === "email" && (
            <div className="space-y-4 pt-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Addresses
                </label>
                <textarea
                  className="w-full p-2 border border-gray-300 rounded text-sm h-15"
                  placeholder={"john@example.com\nsarah@example.com"}
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
                <p className="text-xs text-gray-500 mt-1">
                  You can invite multiple people at once, Enter one email
                  address per line or import via csv.
                </p>
                <div className="mt-2">
                  <input
                    id={fileInputId}
                    type="file"
                    accept=".csv,.txt"
                    className="hidden"
                    onChange={async (e) => {
                      const inputEl =
                        e.currentTarget as HTMLInputElement | null;
                      const file = e.target.files && e.target.files[0];
                      if (!file) return;
                      setIsImporting(true);
                      try {
                        const text = await file.text();
                        const { headers, rows } = parseCsv(text);
                        const multiColumn =
                          headers.length > 1 || (rows[0]?.length || 0) > 1;
                        if (multiColumn) {
                          setCsvHeaders(headers);
                          setCsvRows(rows);
                          setSelectedEmailColumn(null);
                          setMappingOpen(true);
                        } else {
                          const tokens = text
                            .split(/[\,\n;\t\r]+/)
                            .map((s) => s.trim())
                            .filter(Boolean);
                          const emailRegex =
                            /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
                          const emails = Array.from(
                            new Set(
                              tokens
                                .map((t) =>
                                  (t.match(emailRegex)?.[0] || "").toLowerCase()
                                )
                                .filter(Boolean)
                            )
                          );
                          if (emails.length === 0) {
                            toast.error("No valid emails found in file");
                          } else {
                            const current = inviteEmail
                              .split(/\n+/)
                              .map((s) => s.trim())
                              .filter(Boolean);
                            const merged = Array.from(
                              new Set([...current, ...emails])
                            );
                            setInviteEmail(merged.join("\n"));
                            toast.success(
                              `Imported ${emails.length} email${
                                emails.length > 1 ? "s" : ""
                              }`
                            );
                          }
                        }
                      } catch (err: any) {
                        console.error(err);
                        toast.error("Failed to read file", {
                          description: err?.message,
                        });
                      } finally {
                        setIsImporting(false);
                        if (inputEl) inputEl.value = "";
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="border-gray-300 text-gray-700 hover:bg-gray-50"
                    onClick={() =>
                      document.getElementById(fileInputId)?.click()
                    }
                    disabled={isImporting}
                  >
                    {isImporting ? (
                      <>
                        <Spinner className="mr-2 h-4 w-4" />
                        Importing...
                      </>
                    ) : (
                      "Import CSV"
                    )}
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Role
                </label>
                <Select
                  value={inviteRole}
                  onValueChange={(v: any) => setInviteRole(v)}
                >
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
          {activeTab === "link" && (
            <div className="space-y-4 pt-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-black flex-1"
                  onClick={handleGenerateLink}
                  disabled={linkLoading}
                >
                  {linkLoading ? (
                    <Spinner className="mr-2 h-4 w-4" />
                  ) : (
                    <Link2 className="w-4 h-4 mr-2" />
                  )}
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
                  <label className="text-sm font-medium text-gray-700">
                    Generated Link
                  </label>
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
      {/* CSV Mapping Dialog */}
      {mappingOpen && (
        <Dialog open={mappingOpen} onOpenChange={setMappingOpen}>
          <DialogContent className="max-w-[480px] bg-white text-gray-900">
            <DialogHeader>
              <DialogTitle className="text-lg font-semibold">
                Map CSV columns
              </DialogTitle>
              <DialogDescription className="text-gray-600 text-sm">
                Select which column contains the email addresses.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email column
                </label>
                <Select
                  value={
                    selectedEmailColumn !== null
                      ? String(selectedEmailColumn)
                      : undefined
                  }
                  onValueChange={(v: any) =>
                    setSelectedEmailColumn(parseInt(v, 10))
                  }
                >
                  <SelectTrigger className="w-full border-gray-300">
                    <SelectValue placeholder="Choose a column" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectGroup>
                      {csvHeaders.map((h, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {h || `Column ${i + 1}`}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-xs text-gray-500">
                Preview first 3 rows:
                <div className="mt-2 border rounded overflow-auto max-h-40 max-w-full">
                  {selectedEmailColumn === null ? (
                    <div className="px-2 py-3 text-[11px] text-gray-500">
                      Select a column to preview
                    </div>
                  ) : (
                    (() => {
                      const previewRows = csvRows.slice(0, 3);
                      const colIndex = selectedEmailColumn as number;
                      const header =
                        csvHeaders[colIndex] || `Column ${colIndex + 1}`;
                      return (
                        <table className="min-w-full table-fixed">
                          <thead>
                            <tr>
                              <th className="px-2 py-1 text-[11px] font-medium bg-gray-50 border-b text-left whitespace-nowrap">
                                {header}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {previewRows.map((row, ri) => (
                              <tr key={ri}>
                                <td className="px-2 py-1 text-[11px] border-b align-top break-words whitespace-normal">
                                  {row[colIndex] ?? ""}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()
                  )}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                className="border-gray-300"
                onClick={() => setMappingOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="bg-black text-white hover:bg-gray-800"
                disabled={selectedEmailColumn === null}
                onClick={() => {
                  if (selectedEmailColumn === null) return;
                  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
                  const extracted = csvRows
                    .map((row) => (row[selectedEmailColumn!] || "").toString())
                    .map((v) => (v.match(emailRegex)?.[0] || "").toLowerCase())
                    .filter(Boolean);
                  const unique = Array.from(new Set(extracted));
                  if (unique.length === 0) {
                    toast.error(
                      "Selected column does not contain valid emails"
                    );
                    return;
                  }
                  const current = inviteEmail
                    .split(/\n+/)
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const merged = Array.from(new Set([...current, ...unique]));
                  setInviteEmail(merged.join("\n"));
                  setMappingOpen(false);
                  toast.success(
                    `Imported ${unique.length} email${
                      unique.length > 1 ? "s" : ""
                    }`
                  );
                }}
              >
                Import
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Are you sure you want to delete this user?
              </DialogTitle>
              <DialogDescription>
                This action cannot be undone. The user and their data will be
                permanently removed from your organization.
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
