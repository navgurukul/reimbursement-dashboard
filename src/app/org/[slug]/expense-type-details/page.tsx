"use client";

import { notFound } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { Tags } from "lucide-react";

export default function ExpenseTypeDetailsPage() {
    const { organization, userRole } = useOrgStore();
    const isAdmin = userRole === "owner" || userRole === "admin";

    if (!isAdmin) {
        notFound();
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Tags className="h-6 w-6 text-primary" />
                <h1 className="text-3xl font-bold tracking-tight">Expense Type Details</h1>
            </div>
            <p className="text-sm text-muted-foreground">
                No details are shown on this page.
            </p>
        </div>
    );
}