import Link from "next/link";

import { signOut } from "@/app/login/actions";
import { getNotifications, getViewer } from "@/lib/api";
import { diagnosticsEnabled } from "@/lib/runtime";

import { PrimaryNav, type NavEntry } from "./primary-nav";

const primaryNavigation: readonly [label: string, href: string][] = [
  ["Business profile", "/onboarding"],
  ["Discover", "/sources"],
  ["Leads", "/leads"],
  ["Campaigns", "/campaigns"],
  ["Analytics", "/analytics"],
  ["Callbacks", "/callbacks"],
  ["Notifications", "/notifications"],
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
      <aside className="sidebar">
        <div className="sidebar-top">
          <Link className="brand" href="/onboarding">
            Signal<span>Path</span>
          </Link>
          <div className="workspace-label">
            <span>Workspace</span>
            <strong>{workspace.name}</strong>
          </div>
        </div>
        <PrimaryNav navigation={navigation} />
        <div className="sidebar-bottom">
          <div className="sidebar-promo">
            <p className="sidebar-promo-title">Evidence-first calling</p>
            <p className="sidebar-promo-copy">Every call stays consent-gated, transcript-backed, and human-owned.</p>
          </div>
          <PrimaryNav navigation={[{ label: "Integrations", href: "/settings/integrations" }]} />
          <div className="sidebar-footer">
            <span>{me.role}</span>
            <form action={signOut}>
              <button className="text-button" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>
      <main className="workspace-main">
        <div className="workspace-journey" aria-label="Product journey">
          {[
            ["Business", "/onboarding"],
            ["Discovery", "/sources"],
            ["Review", "/leads"],
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
