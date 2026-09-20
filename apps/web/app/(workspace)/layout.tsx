import Link from "next/link";

import { signOut } from "@/app/login/actions";
import { getNotifications, getViewer } from "@/lib/api";

const navigation = [
  ["Knowledge", "/onboarding"],
  ["Sources", "/sources"],
  ["Opportunities", "/leads"],
  ["Campaign", "/campaigns"],
  ["Voice lab", "/voice-lab"],
  ["Analytics", "/analytics"],
  ["Callbacks", "/callbacks"],
  ["Notifications", "/notifications"],
  ["Integrations", "/settings/integrations"],
  ["Admin", "/admin"],
] as const;

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const [{ me, workspace }, notifications] = await Promise.all([getViewer(), getNotifications()]);
  return (
    <div className="product-shell">
      <aside className="sidebar">
        <Link className="brand" href="/leads">
          Signal<span>Path</span>
        </Link>
        <div className="workspace-label">
          <span>Workspace</span>
          <strong>{workspace.name}</strong>
        </div>
        <nav aria-label="Primary">
          {navigation.map(([label, href]) => (
            <Link className="nav-link" href={href} key={href}>
              {label}{label === "Notifications" && notifications.unread_count ? ` (${notifications.unread_count})` : ""}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span>{me.role}</span>
          <form action={signOut}>
            <button className="text-button" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="workspace-main">
        <div className="workspace-journey" aria-label="Product journey">
          {[
            ["Business", "/onboarding"],
            ["Discovery", "/sources"],
            ["Review", "/leads"],
            ["Campaign", "/campaigns"],
            ["Call", "/voice-lab"],
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
