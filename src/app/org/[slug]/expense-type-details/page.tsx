"use client";

import { useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { Tags } from "lucide-react";
import { ExpenseTypeDetail, expenseTypeDetails } from "@/lib/db";
import { toast } from "sonner";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ExpenseTypeDetailsPage() {
    const { organization, userRole } = useOrgStore();
    const canViewExpenseTypeDetails =
        userRole === "owner" ||
        userRole === "admin" ||
        userRole === "manager" ||
        userRole === "member";
    const [rows, setRows] = useState<ExpenseTypeDetail[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    if (!canViewExpenseTypeDetails) {
        notFound();
    }

    useEffect(() => {
        const loadExpenseTypeDetails = async () => {
            if (!organization?.id) return;

            setIsLoading(true);
            const { data, error } = await expenseTypeDetails.getAll();

            if (error) {
                toast.error("Failed to load expense type details", {
                    description: error.message,
                });
                setRows([]);
                setIsLoading(false);
                return;
            }

            setRows(data);
            setIsLoading(false);
        };

        loadExpenseTypeDetails();
    }, [organization?.id]);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Tags className="h-6 w-6 text-primary" />
                <h1 className="text-3xl font-bold tracking-tight">Expense Type Details</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Expense Type Details List</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Group</TableHead>
                                <TableHead>Sub-Group</TableHead>
                                <TableHead>Expense Ledger</TableHead>
                                <TableHead>Description</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={4}>Loading expense type details...</TableCell>
                                </TableRow>
                            ) : rows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4}>No expense type details found.</TableCell>
                                </TableRow>
                            ) : (
                                rows.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell>{item.group}</TableCell>
                                        <TableCell>{item.sub_group}</TableCell>
                                        <TableCell>{item.expense_ledger}</TableCell>
                                        <TableCell className="whitespace-normal">{item.description || "-"}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}