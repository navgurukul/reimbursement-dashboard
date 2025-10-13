"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { useEffect } from "react";
import { useParams } from "next/navigation";
import { useOrgStore } from "@/store/useOrgStore";
import { useAuthStore } from "@/store/useAuthStore";
import { organizations } from "@/lib/db";

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ slug: string }>();
  const { setOrganization, setUserRole } = useOrgStore();
  const { user } = useAuthStore();

  useEffect(() => {
    const hydrateOrgFromSlug = async () => {
      const slug = params?.slug;
      if (!slug) return;
      try {
        const { data: org } = await organizations.getBySlug(slug);
        if (org) {
          setOrganization({ id: org.id, name: org.name, slug: org.slug });
          if (user?.id) {
            const { data: roleRow } = await organizations.getUserRole(org.id, user.id);
            if (roleRow?.role) setUserRole(roleRow.role as any);
          }
        }
      } catch (_) {
        // ignore
      }
    };
    void hydrateOrgFromSlug();
  }, [params?.slug, user?.id, setOrganization, setUserRole]);

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
