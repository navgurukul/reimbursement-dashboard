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
    <div className="min-h-svh bg-background">
      <AppSidebar />
      <div className="lg:pl-64">
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full min-w-0 max-w-[1600px] px-4 py-5 outline-none sm:px-6 sm:py-6 lg:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
