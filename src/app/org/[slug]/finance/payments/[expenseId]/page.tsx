"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { expenses } from "@/lib/db";
import { Badge } from "@/components/ui/badge";

import { toast } from "sonner";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export default function PaymentProcessingDetails() {
    const { expenseId } = useParams();
    const router = useRouter();

    const [expense, setExpense] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchExpense = async () => {
            if (!expenseId) return;
            const { data, error } = await expenses.getById(expenseId as string);
            if (error) toast.error("Failed to load expense details");
            else setExpense(data);
            setLoading(false);
        };
        fetchExpense();
    }, [expenseId]);

    if (loading) return <div className="p-6 text-gray-600">Loading...</div>;
    if (!expense) return <div className="p-6 text-red-600">Expense not found</div>;

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <Button
                    variant="outline"
                    onClick={() => router.push(`/org/${expense.org_id}/finance`)}
                    className="text-sm"
                >
                    ← Back to Payment Processing
                </Button>
            </div>

            {/* Grid Layout */}
            <div className="grid md:grid-cols-3 gap-8">
                {/* Expense Details */}
                <div className="md:col-span-2 space-y-6">
                    <div className="bg-white p-6 rounded shadow border">
                        <h2 className="text-lg font-semibold mb-4">Expense Details</h2>
                        <Table>
                            <TableBody>
                                <TableRow>
                                    <TableHead>Expense Type</TableHead>
                                    <TableCell>{expense.expense_type || "Not Provided"}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableHead>Amount</TableHead>
                                    <TableCell>₹{expense.amount}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableHead>Approved Amount</TableHead>
                                    <TableCell>₹{expense.amount}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableCell>
                                        {new Date(expense.date).toLocaleDateString("en-IN")}
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableHead>Status</TableHead>
                                    <TableCell>
                                        <Badge className="capitalize">{expense.status}</Badge>
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableHead>Approver</TableHead>
                                    <TableCell>{expense.approver?.full_name || "—"}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableHead>Receipt</TableHead>
                                    <TableCell>
                                        {expense.voucherId ? (
                                            <Button
                                                size="sm"
                                                variant="link"
                                                onClick={() =>
                                                    router.push(
                                                        `/org/${expense.org_id}/expenses/${expense.id}/voucher`
                                                    )
                                                }
                                            >
                                                View Receipt ({expense.voucher_filename || "Voucher"})
                                            </Button>
                                        ) : (
                                            "No Voucher"
                                        )}
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableHead>Description</TableHead>
                                    <TableCell>{expense.custom_fields?.description || "—"}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableHead>Signature</TableHead>
                                    <TableCell>
                                        {expense.signature_url ? (
                                            <img
                                                src={expense.signature_url}
                                                alt="Signature"
                                                className="h-16 object-contain border"
                                            />
                                        ) : (
                                            "Not Available"
                                        )}
                                    </TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableHead>Approver Signature</TableHead>
                                    <TableCell>
                                        {expense.approver_signature_url ? (
                                            <img
                                                src={expense.approver_signature_url}
                                                alt="Approver Signature"
                                                className="h-16 object-contain border"
                                            />
                                        ) : (
                                            "Not Available"
                                        )}
                                    </TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </div>
                </div>

                {/* Activity History */}
                <div className="space-y-6">
                    {/* Activity History */}
                    <div className="bg-white p-6 rounded shadow border">
                        <h2 className="text-lg font-semibold mb-4">Activity History</h2>
                        <div className="space-y-4 text-sm text-gray-700">
                            {expense.history?.length > 0 ? (
                                expense.history.map((entry: any, i: number) => (
                                    <div key={i} className="flex items-start gap-2">
                                        <div className={`w-2 h-2 mt-1 rounded-full ${entry.action === "Approved" ? "bg-green-600" : "bg-blue-500"}`} />
                                        <div>
                                            <div className="font-semibold">{entry.action}</div>
                                            <div className="text-xs text-gray-500">
                                                {entry.user} · {new Date(entry.timestamp).toLocaleString("en-IN")}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <>
                                    <div className="flex items-start gap-2">
                                        <div className="w-2 h-2 mt-1 rounded-full bg-green-600" />
                                        <div>
                                            <div className="font-semibold">Approved</div>
                                            <div className="text-xs text-gray-500">
                                                {expense.approver?.full_name || "—"} · {new Date().toLocaleString("en-IN")}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <div className="w-2 h-2 mt-1 rounded-full bg-blue-500" />
                                        <div>
                                            <div className="font-semibold">Created</div>
                                            <div className="text-xs text-gray-500">
                                                {expense.creator?.full_name || "—"} · {new Date(expense.date).toLocaleString("en-IN")}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

