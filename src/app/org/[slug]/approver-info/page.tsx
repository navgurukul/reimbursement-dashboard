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
import { CalendarOff } from "lucide-react";
import { toast } from "sonner";
import { ExpenseTypeApproverMappingEntry, LocationApproverMappingEntry } from "@/lib/db";

export default function ApproverInfoPage() {
  const { organization, userRole } = useOrgStore();
  const orgId = organization?.id;

  const [expenseTypeMapping, setExpenseTypeMapping] = useState<ExpenseTypeApproverMappingEntry[]>([]);
  const [locationMapping, setLocationMapping] = useState<LocationApproverMappingEntry[]>([]);
  const [approverNames, setApproverNames] = useState<Map<string, { name: string, displayName?: string | null }>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      if (!orgId) return;

      setIsLoading(true);
      try {
        // Fetch organization settings
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

          const namesMap = new Map<string, { name: string, displayName: string | null }>();
          profilesData?.forEach((profile) => {
            const data = { 
              name: profile.full_name || profile.email,
              displayName: (profile as any).display_name || null 
            };
            namesMap.set(profile.user_id, data);
            if (profile.full_name) {
              namesMap.set(profile.full_name, data);
            }
            if (profile.email) {
              namesMap.set(profile.email, data);
            }
          });
          setApproverNames(namesMap);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        toast.error("An unexpected error occurred");
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
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
                  <p>This approver on leave (out of office)</p>
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

  const getListStr = (val?: string | string[]): string => {
    if (!val) return "N/A";
    if (Array.isArray(val)) return val.join(", ");
    return val;
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenseTypeMapping.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No expense type mappings found.
                    </TableCell>
                  </TableRow>
                ) : (
                  expenseTypeMapping.map((mapping, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">
                        {getListStr(mapping.expense_type)}
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {locationMapping.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No location mappings found.
                    </TableCell>
                  </TableRow>
                ) : (
                  locationMapping.map((mapping, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">
                        {getListStr(mapping.location)}
                      </TableCell>
                      <TableCell>
                        {getListStr(mapping.expense_type)}
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
