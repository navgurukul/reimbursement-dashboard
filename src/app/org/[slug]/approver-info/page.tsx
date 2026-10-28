"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { orgSettings, organizations, profiles } from "@/lib/db";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { CalendarOff, Clock, Calendar } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { ExpenseTypeApproverMappingEntry, LocationApproverMappingEntry } from "@/lib/db";
import { parseLeaveDuration, cleanExpiredLeaveProfiles } from "@/lib/leave-status";

export default function ApproverInfoPage() {
  const { organization, userRole } = useOrgStore();
  const orgId = organization?.id;

  const [expenseTypeMapping, setExpenseTypeMapping] = useState<ExpenseTypeApproverMappingEntry[]>([]);
  const [locationMapping, setLocationMapping] = useState<LocationApproverMappingEntry[]>([]);
  const [approverNames, setApproverNames] = useState<
    Map<string, { name: string; displayName?: string | null; leaveDuration?: string | null; appliedAt?: string | null; untilAt?: string | null }>
  >(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Refresh approver data silently in the background (no loading spinner, no flicker)
  const refreshData = async () => {
    if (!orgId) return;
    try {
      // 1. Fetch organization settings
      const { data: settingsData, error: settingsError } = await orgSettings.getByOrgId(orgId);

      if (settingsError) {
        toast.error("Failed to load settings", { description: settingsError.message });
        return;
      }

      if (settingsData) {
        if (settingsData.expense_type_approver_mapping) {
          setExpenseTypeMapping(settingsData.expense_type_approver_mapping.filter(m => m.enabled !== false));
        }
        if (settingsData.location_approver_mapping) {
          setLocationMapping(settingsData.location_approver_mapping.filter(m => m.enabled !== false));
        }
      }

      // Fetch approver profiles
      const { data: membersData } = await organizations.getOrganizationMembers(orgId);

      if (membersData) {
        const approvers = membersData.filter((member) =>
          ["owner", "admin", "manager"].includes(member.role)
        );

        const { data: profilesData } = await profiles.getByIds(
          approvers.map((approver) => approver.user_id)
        );

        // Clean expired leave profiles in DB
        const expiredIds = await cleanExpiredLeaveProfiles(profilesData || []);

        const namesMap = new Map<string, { name: string; displayName: string | null; leaveDuration: string | null; appliedAt: string | null; untilAt: string | null }>();
        profilesData?.forEach((profile) => {
          const isExpired = expiredIds.includes(profile.id) || expiredIds.includes(profile.user_id);
          const parsed = parseLeaveDuration((profile as any).leave_duration, profile.updated_at);
          const isStatusActive = !isExpired && parsed.isActive && !parsed.isExpired;

          const effectiveDisplayName = isStatusActive ? ((profile as any).display_name || null) : null;
          const effectiveLeaveDuration = isStatusActive ? (parsed.label || null) : null;

          let formattedApplied: string | null = null;
          let formattedUntil: string | null = null;
          const appliedTime = parsed.start || profile.updated_at;
          if (isStatusActive && appliedTime) {
            try {
              formattedApplied = format(new Date(appliedTime), "dd MMM yyyy, hh:mm a");
            } catch { }
          }
          if (isStatusActive && parsed.end) {
            try {
              formattedUntil = format(new Date(parsed.end), "dd MMM yyyy, hh:mm a");
            } catch { }
          }

          const data = {
            name: profile.full_name || profile.email,
            displayName: effectiveDisplayName,
            leaveDuration: effectiveLeaveDuration,
            appliedAt: formattedApplied,
            untilAt: formattedUntil,
          };
          namesMap.set(profile.user_id, data);
          if (profile.id) {
            namesMap.set(profile.id, data);
          }
          if (profile.full_name) {
            namesMap.set(profile.full_name, data);
          }
          if (profile.email) {
            namesMap.set(profile.email, data);
          }
        });

        setApproverNames(namesMap);
      }
    } catch (error: any) {
      toast.error("Error refreshing approver data", { description: error?.message });
    }
  };

  useEffect(() => {
    let isMounted = true;

    async function initialLoad() {
      if (!orgId) return;
      setIsLoading(true);
      try {
        await refreshData();
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initialLoad();

    // Silently refresh every 5 seconds so expired leave auto-removes in real-time just like settings page
    const interval = setInterval(() => {
      refreshData();
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [orgId]);

  const getApproverLabel = (idOrName?: string | string[]): React.ReactNode => {
    if (!idOrName) return "N/A";

    if (Array.isArray(idOrName)) {
      return (
        <div className="flex flex-col gap-1">
          {idOrName.map((id, index) => (
            <div key={index}>{getApproverLabel(id)}</div>
          ))}
        </div>
      );
    }

    const data = approverNames.get(idOrName);
    if (data) {
      return (
        <div className="flex items-center gap-2">
          <span>{data.name}</span>
          {data.displayName === 'OOO' ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="outline"
                    className="px-2 py-2 h-5 text-[10px] bg-orange-100 text-orange-800 border-orange-200 cursor-help flex items-center gap-1"
                  >
                    <CalendarOff className="w-3 h-3 text-red-600" />
                    {data.displayName}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    This approver on leave (out of office)
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : data.displayName ? (
            <Badge
              variant="outline"
              className="px-1 py-0 h-5 text-[10px]"
            >
              {data.displayName}
            </Badge>
          ) : null}
        </div>
      );
    }
    return idOrName;
  };

  const getListChips = (val?: string | string[]): React.ReactNode => {
    if (!val) return <span className="text-muted-foreground">N/A</span>;
    const items = Array.isArray(val) ? val : [val];
    return (
      <div className="flex flex-wrap gap-1.5 py-1">
        {items.map((item, i) => (
          <Badge key={i} variant="secondary" className="font-normal bg-gray-200 border border-transparent hover:border-gray-400 rounded-md text-sm whitespace-nowrap">
            {item}
          </Badge>
        ))}
      </div>
    );
  };

  const getRowLeaveDurations = (
    primaryIdOrName?: string | string[],
    secondaryIdOrName?: string | string[]
  ): React.ReactNode => {
    const allIds = [
      ...(Array.isArray(primaryIdOrName) ? primaryIdOrName : primaryIdOrName ? [primaryIdOrName] : []),
      ...(Array.isArray(secondaryIdOrName) ? secondaryIdOrName : secondaryIdOrName ? [secondaryIdOrName] : []),
    ];

    const oooEntries: Array<{ name: string; duration: string; appliedAt?: string | null; untilAt?: string | null }> = [];
    const seen = new Set<string>();

    for (const id of allIds) {
      const data = approverNames.get(id);
      if (data && data.displayName === "OOO" && !seen.has(data.name)) {
        seen.add(data.name);
        oooEntries.push({
          name: data.name,
          duration: data.leaveDuration || "Not specified",
          appliedAt: data.appliedAt,
          untilAt: data.untilAt,
        });
      }
    }

    if (oooEntries.length === 0) {
      return <span className="text-muted-foreground text-xs">-</span>;
    }

    return (
      <div className="flex flex-col gap-2 py-0.5">
        {oooEntries.map((entry, i) => (
          <div
            key={i}
            className="flex flex-col gap-1.5"
          >
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/80 w-fit">
              <Clock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>
                {oooEntries.length > 1 && (
                  <span className="font-bold text-slate-800 mr-1">{entry.name}:</span>
                )}
                {entry.duration}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 text-[11px] text-slate-600 pl-0.5">
              {entry.appliedAt && (
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="text-slate-500 font-medium">Applied:</span>
                  <span className="font-semibold text-slate-700">{entry.appliedAt}</span>
                </div>
              )}
              {entry.untilAt && (
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="text-slate-500 font-medium">Until:</span>
                  <span className="font-semibold text-slate-800">{entry.untilAt}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (!orgId) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Approver Information</h1>

      <Card>
        <CardHeader>
          <CardTitle>Expense Type → Approver Mapping (Without Campus Wise)</CardTitle>
          <CardDescription>
            Approvers mapped to specific expense types across the organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-300">
                  <TableHead>Expense Type</TableHead>
                  <TableHead>Primary Approver(s)</TableHead>
                  <TableHead>Secondary Approver(s)</TableHead>
                  <TableHead>Leave Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseTypeMapping.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No expense type mappings found.
                    </TableCell>
                  </TableRow>
                ) : (
                  expenseTypeMapping.map((mapping, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium min-w-[200px] max-w-[400px]">
                        {getListChips(mapping.expense_type)}
                      </TableCell>
                      <TableCell>
                        {mapping.approver_name
                          ? getApproverLabel(mapping.approver_name)
                          : getApproverLabel(mapping.approver_id)}
                      </TableCell>
                      <TableCell>
                        {mapping.second_approver_name
                          ? getApproverLabel(mapping.second_approver_name)
                          : getApproverLabel(mapping.second_approver_id)}
                      </TableCell>
                      <TableCell>
                        {getRowLeaveDurations(
                          mapping.approver_name || mapping.approver_id,
                          mapping.second_approver_name || mapping.second_approver_id
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

      <Card>
        <CardHeader>
          <CardTitle>Project of Expenses → Approver Mapping (Campus Wise)</CardTitle>
          <CardDescription>
            Approvers mapped based on the location/project of the expense.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-300">
                  <TableHead>Location / Project</TableHead>
                  <TableHead>Expense Type</TableHead>
                  <TableHead>Primary Approver(s)</TableHead>
                  <TableHead>Secondary Approver(s)</TableHead>
                  <TableHead>Leave Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locationMapping.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      No location mappings found.
                    </TableCell>
                  </TableRow>
                ) : (
                  locationMapping.map((mapping, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium min-w-[150px] max-w-[300px]">
                        {getListChips(mapping.location)}
                      </TableCell>
                      <TableCell className="min-w-[200px] max-w-[400px]">
                        {getListChips(mapping.expense_type)}
                      </TableCell>
                      <TableCell>
                        {mapping.approver_name
                          ? getApproverLabel(mapping.approver_name)
                          : getApproverLabel(mapping.approver_id)}
                      </TableCell>
                      <TableCell>
                        {mapping.second_approver_name
                          ? getApproverLabel(mapping.second_approver_name)
                          : getApproverLabel(mapping.second_approver_id)}
                      </TableCell>
                      <TableCell>
                        {getRowLeaveDurations(
                          mapping.approver_name || mapping.approver_id,
                          mapping.second_approver_name || mapping.second_approver_id
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
    </div>
  );
}
