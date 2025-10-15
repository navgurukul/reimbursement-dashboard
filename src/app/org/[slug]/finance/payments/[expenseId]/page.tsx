"use client";

import supabase from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { expenses, expenseEvents } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Clock } from "lucide-react";
import ExpenseHistory from "../../../expenses/[id]/history/expense-history"


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
    const params = useParams();
    const slug = params.slug as string;

    const [expense, setExpense] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [hasVoucher, setHasVoucher] = useState(false);
    const [eventTitle, setEventTitle] = useState<string | null>(null);

    useEffect(() => {
        const fetchExpense = async () => {
            if (!expenseId) return;
            const { data, error } = await expenses.getById(expenseId as string);
            if (error) toast.error("Failed to load expense details");
            else setExpense(data);

            // Fetch related event title if present
            if (data?.event_id) {
                try {
                    const { data: ev } = await expenseEvents.getById(data.event_id);
                    setEventTitle(ev?.title || null);
                } catch (e) {
                    setEventTitle(null);
                }
            } else {
                setEventTitle(null);
            }
            // Check if this expense has a voucher
            const { data: voucherData, error: voucherError } = await supabase
                .from("vouchers")
                .select("id, signature_url")
                .eq("expense_id", expenseId)
                .maybeSingle();

            if (!voucherError && voucherData) {
                setHasVoucher(true);
            }

            const expenseData = { ...data };
            const signaturePath = expenseData.signature_url;
            if (signaturePath && !signaturePath.startsWith("http")) {
                const { data: sigData } = supabase.storage
                    .from("user-signatures")
                    .getPublicUrl(signaturePath);
                if (sigData?.publicUrl) {
                    expenseData.signature_url = sigData.publicUrl;
                }
            }

            // Resolve approver signature
            const approverSignaturePath = expenseData.approver_signature_url;
            if (approverSignaturePath && !approverSignaturePath.startsWith("http")) {
                const { data: approverSigData } = supabase.storage
                    .from("user-signatures")
                    .getPublicUrl(approverSignaturePath);
                if (approverSigData?.publicUrl) {
                    expenseData.approver_signature_url = approverSigData.publicUrl;
                }
            }
            setExpense(expenseData);
            setLoading(false);
        };
        fetchExpense();
    }, [expenseId]);

    const handleViewReceipt = async () => {
        if (expense.receipt?.path) {
            try {
                const { url, error } = await expenses.getReceiptUrl(
                    expense.receipt.path
                );
                if (error) {
                    console.error("Error getting receipt URL:", error);
                    toast.error("Failed to load receipt");
                    return;
                }
                if (url) {
                    window.open(url, "_blank");
                }
            } catch (err) {
                console.error("Error opening receipt:", err);
                toast.error("Failed to open receipt");
            }
        }
    };

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
                                    <TableHead>Location of Expense</TableHead>
                                    <TableCell>{expense.location || "N/A"}</TableCell>
                                </TableRow>
                                <TableRow>
                                    <TableHead>Event Name</TableHead>
                                    <TableCell>{eventTitle || "N/A"}</TableCell>
                                </TableRow>
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
                                    <TableCell>₹{expense.approved_amount}</TableCell>
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
                                    <TableHead>Receipt/Voucher</TableHead>
                                    <TableCell>
                                        {expense.receipt ? (
                                            <Button
                                                variant="outline"
                                                onClick={handleViewReceipt}
                                                className="flex items-center"
                                            >
                                                <FileText className="mr-2 h-4 w-4" />
                                                View Receipt ({expense.receipt.filename || "Document"})
                                            </Button>
                                        ) : hasVoucher ? (
                                            <Button
                                                variant="outline"
                                                className="flex items-center text-blue-600"
                                                onClick={() =>
                                                    router.push(`/org/${slug}/expenses/${expense.id}/voucher`)
                                                }
                                            >
                                                <FileText className="mr-2 h-4 w-4" />
                                                View Voucher
                                            </Button>
                                        ) : (
                                            <p className="text-muted-foreground">
                                                No receipt or voucher available
                                            </p>
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
                    {/* Activity History */}
                    <div className="md:col-span-3">
                        <Card>
                            <CardHeader className="flex flex-row items-center">
                                <Clock className="h-5 w-5 mr-2 text-muted-foreground" />
                                <CardTitle>Activity History</CardTitle>
                            </CardHeader>
                            <CardContent className="max-h-[500px] overflow-auto">
                                <ExpenseHistory expenseId={typeof expenseId === "string" ? expenseId : ""} />
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </div>
    );
}

