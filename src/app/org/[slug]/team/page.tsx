"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import supabase from "@/lib/supabase";
import { useOrgStore } from "@/store/useOrgStore";
import { toast } from "sonner";
import { invites, organizations, profiles } from "@/lib/db";
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

interface Member {
  id: string;
  email: string;
  role: string;
  fullName?: string;
  avatarUrl?: string;
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

  // Fetch organization members
  useEffect(() => {
    async function fetchMembers() {
      if (!org?.id) return;

      setIsLoadingMembers(true);
      try {
        // Get the organization users
        const { data: orgUsers, error: orgUsersError } =
          await organizations.getOrganizationMembers(org.id);
        console.log("orgUsers", orgUsers);
        if (orgUsersError) throw orgUsersError;

        if (orgUsers && orgUsers.length > 0) {
          // Get user IDs
          const userIds = orgUsers.map((user) => user.user_id);

          // Fetch profiles for these users
          const { data: profileData, error: profileError } =
            await profiles.getByIds(userIds);
          
          console.log("profileData", profileData);

          if (profileError) throw profileError;

          // Combine the data
          const formattedMembers: Member[] = orgUsers.map((orgUser) => {
            const profile = profileData?.find(
              (p: { user_id: string; }) => p.user_id === orgUser.user_id
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

  // Update your handleInviteSubmit function in your TeamPage component
interface InviteFormData {
  email: string;
  role: "member" | "manager" | "admin";
  orgId: string;
  orgName: string;
}

interface InviteResponse {
  inviteId: string;
  [key: string]: any;
}

const handleInviteSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  if (!org?.id) return;
  setLoading(true);

  let inviteRow: { id: string } | null = null;

  try {
    // Call your server API route
    const response = await fetch("/api/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: inviteEmail,
        role: inviteRole,
        orgId: org.id,
        orgName: org.name || "Our Organization",
      } as InviteFormData),
    });

    const data = await response.json() as InviteResponse;

    if (!response.ok) {
      throw new Error(data.error || "Failed to send invitation");
    }

    inviteRow = { id: data.inviteId };
    toast.success("Invitation sent!");
    setInviteEmail("");
    setInviteRole("member");
  } catch (error: unknown) {
    console.error("Invite error:", error);
    // Your existing error handling code
  } finally {
    setLoading(false);
  }
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
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invite Form (only owners/admins) */}
      {(userRole === "owner" || userRole === "admin") && (
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
                  />
                </div>
                <Select
                  value={inviteRole}
                  onValueChange={(v: "member" | "admin") => setInviteRole(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
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
    </div>
  );
}
