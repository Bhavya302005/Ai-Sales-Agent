"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function CallStatusPoller({ active, intervalMs = 3000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      router.refresh();
    }, intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs, router]);

  if (!active) return null;

  return (
    <div className="call-live-sync-bar" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px", borderRadius: "8px", background: "rgba(232, 48, 67, 0.08)", border: "none", color: "#e83043", fontSize: "13px", fontWeight: 500, margin: "10px 0" }}>
      <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#e83043", display: "inline-block" }} />
      <span>Call in progress · Auto-refreshing live call updates…</span>
    </div>
  );
}
