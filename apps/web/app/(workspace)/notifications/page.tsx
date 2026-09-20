import Link from "next/link";

import { getNotifications } from "@/lib/api";

import { markAllNotificationsRead, markNotificationRead } from "./actions";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ unread?: string; severity?: string }> }) {
  const filters = await searchParams;
  const query = new URLSearchParams();
  if (filters.unread === "true") query.set("unread_only", "true");
  if (["info", "success", "warning", "error"].includes(filters.severity ?? "")) query.set("severity", filters.severity!);
  const feed = await getNotifications(query.toString());
  return (
    <>
      <header className="page-header">
        <div><div className="eyebrow">Operator inbox</div><h1 className="page-title">Notifications</h1></div>
        <form action={markAllNotificationsRead}><button className="secondary-button" type="submit">Mark all read</button></form>
      </header>
      <form className="filter-bar" method="get">
        <select defaultValue={filters.severity ?? ""} name="severity"><option value="">All severities</option><option value="info">Info</option><option value="success">Success</option><option value="warning">Warning</option><option value="error">Error</option></select>
        <select defaultValue={filters.unread ?? "false"} name="unread"><option value="false">All messages</option><option value="true">Unread only</option></select>
        <button className="secondary-button" type="submit">Filter</button>
      </form>
      <section className="operations-list">
        {feed.items.length ? feed.items.map((item) => (
          <article className={`operation-card severity-${item.severity}`} key={item.id}>
            <div><p className="kicker">{item.notification_type.replaceAll("_", " ")}</p><h2>{item.title}</h2><p>{item.summary}</p></div>
            <div className="operation-actions">
              {item.action_url ? <Link className="secondary-button" href={item.action_url}>Open</Link> : null}
              {!item.read_at ? <form action={markNotificationRead}><input name="notification_id" type="hidden" value={item.id} /><button className="text-button" type="submit">Mark read</button></form> : <span>Read</span>}
            </div>
          </article>
        )) : <div className="empty-panel"><h2>Inbox clear</h2><p>Campaign, callback, import, and CRM events will appear here.</p></div>}
      </section>
    </>
  );
}
