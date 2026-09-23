import Link from "next/link";

import { getNotifications } from "@/lib/api";
import { CustomSelect, type CustomSelectOption } from "@/app/ui/custom-select";

import { markAllNotificationsRead, markNotificationRead } from "./actions";

const SEVERITY_OPTIONS: CustomSelectOption[] = [
  { value: "", label: "All severities" },
  { value: "info", label: "Info" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "error", label: "Error" },
];

const UNREAD_OPTIONS: CustomSelectOption[] = [
  { value: "false", label: "All messages" },
  { value: "true", label: "Unread only" },
];

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ unread?: string; severity?: string }>;
}) {
  const filters = await searchParams;
  const query = new URLSearchParams();
  if (filters.unread === "true") query.set("unread_only", "true");
  if (["info", "success", "warning", "error"].includes(filters.severity ?? "")) {
    query.set("severity", filters.severity!);
  }
  const feed = await getNotifications(query.toString());
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">Operator inbox</div>
          <h1 className="page-title">Notifications</h1>
        </div>
        <form action={markAllNotificationsRead}>
          <button className="secondary-button" type="submit">
            Mark all read
          </button>
        </form>
      </header>
      <form className="notifications-filter-bar" method="get">
        <CustomSelect
          name="severity"
          defaultValue={filters.severity ?? ""}
          options={SEVERITY_OPTIONS}
          ariaLabel="Filter by severity"
        />
        <CustomSelect
          name="unread"
          defaultValue={filters.unread ?? "false"}
          options={UNREAD_OPTIONS}
          ariaLabel="Filter by read status"
        />
        <button className="notifications-filter-btn" type="submit">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filter
        </button>
      </form>
      <section className="operations-list">
        {feed.items.length ? (
          feed.items.map((item) => (
            <article className={`operation-card severity-${item.severity}`} key={item.id}>
              <div>
                <p className="kicker">{item.notification_type.replaceAll("_", " ")}</p>
                <h2>{item.title}</h2>
                <p>{item.summary}</p>
              </div>
              <div className="operation-actions">
                {item.action_url ? (
                  <Link className="secondary-button" href={item.action_url}>
                    Open
                  </Link>
                ) : null}
                {!item.read_at ? (
                  <form action={markNotificationRead}>
                    <input name="notification_id" type="hidden" value={item.id} />
                    <button className="text-button" type="submit">
                      Mark read
                    </button>
                  </form>
                ) : (
                  <span className="read-status-badge">Read</span>
                )}
              </div>
            </article>
          ))
        ) : (
          <div className="empty-panel">
            <h2>Inbox clear</h2>
            <p>Campaign, callback, import, and CRM events will appear here.</p>
          </div>
        )}
      </section>
    </>
  );
}
