"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import FinanceReview from "./approvals/page";
import PaymentProcessing from "./payments/page";
import Records from "./records/page";
import { useOrgStore } from "@/store/useOrgStore";
import supabase from "@/lib/supabase";
import { Spinner } from "@/components/ui/spinner";
import { notFound, useRouter, useSearchParams } from "next/navigation";

export default function FinancePage() {
  const { userRole } = useOrgStore();
  const searchParams = useSearchParams();
  const router = useRouter();

  if (userRole !== "owner" && userRole !== "admin") {
    notFound();
  }
  const [activeTab, setActiveTab] = useState("approvals");

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    params.delete("highlight");
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Financial management</h1>
      </div>
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="space-y-6"
      >
        <div className="w-full overflow-x-auto md:overflow-visible md:w-fit">
          <TabsList className="gap-2">
            <TabsTrigger value="approvals" className="cursor-pointer">
              Approval Queue
            </TabsTrigger>
            <TabsTrigger value="payments" className="cursor-pointer">
              Payment Processing
            </TabsTrigger>
            <TabsTrigger value="records" className="cursor-pointer">
              Records
            </TabsTrigger>
          </TabsList>
        </div>

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
    </div>
  );
}
