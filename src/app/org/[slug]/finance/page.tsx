"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import FinanceReview from "./approvals/page";
import PaymentProcessing from "./payments/page";
import Records from "./records/page";
import { useOrgStore } from "@/store/useOrgStore";
import supabase from "@/lib/supabase";
import { Spinner } from "@/components/ui/spinner";
import { notFound, useRouter } from "next/navigation";

export default function FinancePage() {
  const { userRole } = useOrgStore();
  if (userRole !== "owner" && userRole !== "admin") {
    notFound();
  }
  const [activeTab, setActiveTab] = useState("approvals");

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList className="gap-2">
        <TabsTrigger value="approvals">Approval Queue</TabsTrigger>
        <TabsTrigger value="payments">Payment Processing</TabsTrigger>
        <TabsTrigger value="records">Records</TabsTrigger>
      </TabsList>

      <TabsContent value="approvals">
        <FinanceReview />
      </TabsContent>

      <TabsContent value="payments">
        <PaymentProcessing />
      </TabsContent>

      <TabsContent value="records">
        <Records />
      </TabsContent>
    </Tabs>
  );
}
