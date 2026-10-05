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
import { toast } from "sonner";
import { ExpenseTypeApproverMappingEntry, LocationApproverMappingEntry } from "@/lib/db";

export default function ApproverInfoPage() {
  const { organization, userRole } = useOrgStore();
  const orgId = organization?.id;

  const [expenseTypeMapping, setExpenseTypeMapping] = useState<ExpenseTypeApproverMappingEntry[]>([]);
  const [locationMapping, setLocationMapping] = useState<LocationApproverMappingEntry[]>([]);
  const [approverNames, setApproverNames] = useState<Map<string, string>>(new Map());
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

          const namesMap = new Map(
            profilesData?.map((profile) => [
              profile.user_id,
              profile.full_name || profile.email,
            ]) || []
          );
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

  const getApproverLabel = (idOrName?: string | string[]): string => {
    if (!idOrName) return "N/A";
    
    if (Array.isArray(idOrName)) {
      return idOrName.map(id => getApproverLabel(id)).join(", ");
    }
    
    return approverNames.get(idOrName) || idOrName;
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
                          ? getListStr(mapping.approver_name) 
                          : getApproverLabel(mapping.approver_id)}
                      </TableCell>
                      <TableCell>
                        {mapping.second_approver_name 
                          ? getListStr(mapping.second_approver_name) 
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
                          ? getListStr(mapping.approver_name) 
                          : getApproverLabel(mapping.approver_id)}
                      </TableCell>
                      <TableCell>
                        {mapping.second_approver_name 
                          ? getListStr(mapping.second_approver_name) 
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
