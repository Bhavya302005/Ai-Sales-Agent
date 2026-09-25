import Link from "next/link";

import { getNotifications, getViewer } from "@/lib/api";
import { diagnosticsEnabled } from "@/lib/runtime";

import type { NavEntry } from "./primary-nav";
import { WorkspaceSidebar } from "./workspace-sidebar";

const primaryNavigation: readonly [label: string, href: string][] = [
  ["Business profile", "/onboarding"],
  ["Leads", "/leads"],
  ["Campaigns", "/campaigns"],
  ["Analytics", "/analytics"],
  ["Callbacks", "/callbacks"],
  ["Notifications", "/notifications"],
  ["Subscription", "/subscription"],
  ["Administration", "/admin"],
];

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const [{ me, workspace }, notifications] = await Promise.all([getViewer(), getNotifications()]);
  const withDiagnostics = diagnosticsEnabled()
    ? [...primaryNavigation.slice(0, 4), ["Voice diagnostics", "/voice-lab"] as const, ...primaryNavigation.slice(4)]
    : primaryNavigation;
  const navigation: NavEntry[] = withDiagnostics.map(([label, href]) => ({
    label,
    href,
    badge: label === "Notifications" ? notifications.unread_count : undefined,
  }));
  return (
    <div className="product-shell">
      <WorkspaceSidebar me={me} navigation={navigation} workspace={workspace} />
      <main className="workspace-main">
        <div className="workspace-journey" aria-label="Product journey">
          {[
            ["Business", "/onboarding"],
            ["Leads", "/leads"],
            ["Campaign", "/campaigns"],
            ["Call", "/campaigns"],
            ["Insights", "/analytics"],
            ["Follow-up", "/settings/integrations"],
          ].map(([label, href], index) => (
            <Link href={href} key={label}><span>{index + 1}</span>{label}</Link>
          ))}
        </div>
        {children}
      </main>
    </div>
  );
}
