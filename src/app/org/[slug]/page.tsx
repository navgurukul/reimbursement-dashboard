"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function OrgRoot() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    const slug = params.slug as string;
    if (slug) {
      router.replace(`/org/${slug}/expenses`);
    }
  }, [params.slug, router]);

  return null;
}
