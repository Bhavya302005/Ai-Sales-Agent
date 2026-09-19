"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function JobStatusPoller({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => router.refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [active, router]);

  return active ? <span className="job-polling">Processing updates automatically…</span> : null;
}
