"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import FinanceReview from "./approvals/page";
import PaymentProcessing from "./payments/page";
import Records from "./records/page";
import { useOrgStore } from "@/store/useOrgStore";
import supabase from "@/lib/supabase";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/page-header";
import { PageLoader } from "@/components/ui/page-loader";
import { notFound, useParams, useRouter, useSearchParams } from "next/navigation";

// Wait until the org layout has loaded the role for this organisation before
// deciding. Calling notFound() earlier shows the 404 page, which replaces the
// layout, so the role would never load.
export default function FinancePage() {
  const { userRole, organization } = useOrgStore();
  const params = useParams<{ slug: string }>();

  if (!userRole || organization?.slug !== params?.slug) {
    return <PageLoader />;
  }
  if (userRole !== "owner" && userRole !== "admin") {
    notFound();
  }
  return <FinanceManagement />;
}

function FinanceManagement() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState("approvals");

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    params.delete("expID");
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
      <PageHeader
        title="Finance Management"
        description="Review approved expenses, process payments and look up payment records."
      />
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="gap-6"
      >
        <TabsList>
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
    </div>
  );
}
