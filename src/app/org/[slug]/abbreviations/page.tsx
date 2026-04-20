"use client";

import { useEffect, useMemo, useState } from "react";
import { notFound } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { Tags } from "lucide-react";
import {
    ExpenseTypeDetail,
    ProjectOfExpenseDetail,
    expenseTypeDetails,
    projectOfExpenseDetails,
} from "@/lib/db";
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
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { Input } from "@/components/ui/input";
import { Pagination, usePagination } from "@/components/pagination";

export default function ExpenseTypeDetailsPage() {
    const { organization, userRole } = useOrgStore();
    const canViewExpenseTypeDetails =
        userRole === "owner" ||
        userRole === "admin" ||
        userRole === "manager" ||
        userRole === "member";
    const [rows, setRows] = useState<ExpenseTypeDetail[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [projectRows, setProjectRows] = useState<ProjectOfExpenseDetail[]>([]);
    const [isProjectLoading, setIsProjectLoading] = useState(true);
    const [projectSearchQuery, setProjectSearchQuery] = useState("");

    const filteredRows = useMemo(() => {
        const normalizedQuery = searchQuery.trim().toLowerCase();

        if (!normalizedQuery) return rows;

        return rows.filter((item) => {
            const groupValue = item.group?.toLowerCase() || "";
            const subGroupValue = item.sub_group?.toLowerCase() || "";
            const expenseLedgerValue = item.expense_ledger?.toLowerCase() || "";
            const descriptionValue = item.description?.toLowerCase() || "";

            return (
                groupValue.includes(normalizedQuery) ||
                subGroupValue.includes(normalizedQuery) ||
                expenseLedgerValue.includes(normalizedQuery) ||
                descriptionValue.includes(normalizedQuery)
            );
        });
    }, [rows, searchQuery]);

    const filteredProjectRows = useMemo(() => {
        const normalizedQuery = projectSearchQuery.trim().toLowerCase();

        if (!normalizedQuery) return projectRows;

        return projectRows.filter((item) => {
            const projectValue = item.project_of_expense?.toLowerCase() || "";
            const descriptionValue = item.project_description?.toLowerCase() || "";

            return (
                projectValue.includes(normalizedQuery) ||
                descriptionValue.includes(normalizedQuery)
            );
        });
    }, [projectRows, projectSearchQuery]);

    const {
        currentPage: expenseTypeCurrentPage,
        setCurrentPage: setExpenseTypeCurrentPage,
        totalPages: expenseTypeTotalPages,
        paginatedData: paginatedExpenseTypeRows,
        totalItems: totalExpenseTypeItems,
    } = usePagination(filteredRows);

    const {
        currentPage: projectCurrentPage,
        setCurrentPage: setProjectCurrentPage,
        totalPages: projectTotalPages,
        paginatedData: paginatedProjectRows,
        totalItems: totalProjectItems,
    } = usePagination(filteredProjectRows);

    if (!canViewExpenseTypeDetails) {
        notFound();
    }

    useEffect(() => {
        const loadExpenseTypeDetails = async () => {
            if (!organization?.id) {
                setIsLoading(false);
                return;
            }

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

    useEffect(() => {
        setExpenseTypeCurrentPage(1);
    }, [searchQuery, setExpenseTypeCurrentPage]);

    useEffect(() => {
        setProjectCurrentPage(1);
    }, [projectSearchQuery, setProjectCurrentPage]);

    useEffect(() => {
        if (expenseTypeCurrentPage > expenseTypeTotalPages) {
            setExpenseTypeCurrentPage(expenseTypeTotalPages);
        }
    }, [expenseTypeCurrentPage, expenseTypeTotalPages, setExpenseTypeCurrentPage]);

    useEffect(() => {
        if (projectCurrentPage > projectTotalPages) {
            setProjectCurrentPage(projectTotalPages);
        }
    }, [projectCurrentPage, projectTotalPages, setProjectCurrentPage]);

    useEffect(() => {
        const loadProjectOfExpenseDetails = async () => {
            if (!organization?.id) {
                setIsProjectLoading(false);
                return;
            }

            setIsProjectLoading(true);

            const { data, error } = await projectOfExpenseDetails.getAll();

            if (error) {
                toast.error("Failed to load project of expense details", {
                    description: error.message,
                });
                setProjectRows([]);
                setIsProjectLoading(false);
                return;
            }

            setProjectRows(data);
            setIsProjectLoading(false);
        };

        loadProjectOfExpenseDetails();
    }, [organization?.id]);

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Tags className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold tracking-tight">Expense Type Details & Project Of Expense Details</h1>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Expense Type Details</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="mb-4">
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search by Group, Sub-Group, Expense Ledger / Expense Type, Description"
                        />
                    </div>
                    <div className="overflow-x-auto">
                    <Table className="min-w-[900px] table-fixed">
                        <TableHeader className="bg-gray-300">
                            <TableRow>
                                <TableHead className="w-[18%] whitespace-normal break-words">
                                    Group
                                </TableHead>
                                <TableHead className="w-[18%] whitespace-normal break-words">
                                    Sub-Group
                                </TableHead>
                                <TableHead className="w-[24%] whitespace-normal break-words">
                                    Expense Ledger / Expense Type
                                </TableHead>
                                <TableHead className="w-[40%] whitespace-normal break-words">
                                    Expense Type Description
                                </TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableSkeleton colSpan={4} rows={5} />
                            ) : filteredRows.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={4}>
                                        {rows.length === 0
                                            ? "No expense type details found."
                                            : "No matching expense type details found."}
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedExpenseTypeRows.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="whitespace-normal break-words align-top">
                                            {item.group}
                                        </TableCell>
                                        <TableCell className="whitespace-normal break-words align-top">
                                            {item.sub_group}
                                        </TableCell>
                                        <TableCell className="whitespace-normal break-words align-top">
                                            {item.expense_ledger}
                                        </TableCell>
                                        <TableCell className="whitespace-normal break-words align-top">
                                            {item.description || "-"}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                    </div>

                    {!isLoading && filteredRows.length > 0 && (
                        <Pagination
                            currentPage={expenseTypeCurrentPage}
                            totalPages={expenseTypeTotalPages}
                            totalItems={totalExpenseTypeItems}
                            onPageChange={setExpenseTypeCurrentPage}
                            itemLabel="Expense Type Details"
                        />
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Project of Expense Details</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="mb-4">
                        <Input
                            value={projectSearchQuery}
                            onChange={(e) => setProjectSearchQuery(e.target.value)}
                            placeholder="Search by Project of Expense or Description"
                        />
                    </div>

                    <div className="overflow-x-auto">
                        <Table className="min-w-[800px] table-fixed">
                            <TableHeader className="bg-gray-300">
                                <TableRow>
                                    <TableHead className="w-[35%] whitespace-normal break-words">
                                        Project of Expense
                                    </TableHead>
                                    <TableHead className="w-[65%] whitespace-normal break-words">
                                        Project of Expense Description
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isProjectLoading ? (
                                    <TableSkeleton colSpan={2} rows={5} />
                                ) : filteredProjectRows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={2}>
                                            {projectRows.length === 0
                                                ? "No project of expense details found."
                                                : "No matching project of expense details found."}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    paginatedProjectRows.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell className="whitespace-normal break-words align-top">
                                                {item.project_of_expense}
                                            </TableCell>
                                            <TableCell className="whitespace-normal break-words align-top">
                                                {item.project_description || "-"}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {!isProjectLoading && filteredProjectRows.length > 0 && (
                        <Pagination
                            currentPage={projectCurrentPage}
                            totalPages={projectTotalPages}
                            totalItems={totalProjectItems}
                            onPageChange={setProjectCurrentPage}
                            itemLabel="Project of Expense Details"
                        />
                    )}
                </CardContent>
            </Card>
        </div>
    );
}