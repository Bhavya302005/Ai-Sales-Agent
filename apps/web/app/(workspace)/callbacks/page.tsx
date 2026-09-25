import Link from "next/link";

import { getCallbacks } from "@/lib/api";

import { updateCallback, sendBookingLink } from "./actions";
import { CopyLinkButton } from "@/app/ui/copy-link-button";

export default async function CallbacksPage() {
  const callbacks = await getCallbacks();
  return (
    <>
      <header className="page-header"><div><div className="eyebrow">Human follow-up</div><h1 className="page-title">Callbacks</h1></div><span className="mode-badge">Operator confirmed</span></header>
      <section className="operations-list">
        {callbacks.length ? (
          callbacks.map((item) => (
            <article className="operation-card" key={item.id}>
              <div>
                <p className="kicker">{item.status.replaceAll("_", " ")}</p>
                <h2>{item.requested_text}</h2>
                <p>
                  {item.scheduled_for
                    ? `Scheduled ${new Date(item.scheduled_for).toLocaleString("en-IN")}`
                    : "Choose an exact callback time after human confirmation."}
                </p>
                {item.booking_status ? (
                  <p>
                    Calendly: {item.booking_status.replaceAll("_", " ")} · SMS {item.booking_delivery_mode} / {item.booking_delivery_status}
                  </p>
                ) : null}
                {item.booked_at ? <small>Booked {new Date(item.booked_at).toLocaleString("en-IN")}</small> : null}
                {!item.booked_at && item.booking_check_at ? <small>Re-check {new Date(item.booking_check_at).toLocaleString("en-IN")}</small> : null}
              </div>
              <div className="operation-actions">
                <Link className="secondary-button" href={`/calls/${item.call_id}`}>
                  View call evidence →
                </Link>
                {item.booking_link ? <CopyLinkButton value={item.booking_link} /> : null}
                {item.retry_call_id ? <Link className="text-button" href={`/calls/${item.retry_call_id}`}>Reminder call →</Link> : null}
                {!item.booking_status && !["cancelled", "completed"].includes(item.status) ? (
                  <form action={sendBookingLink} className="callback-form">
                    <input name="callback_id" type="hidden" value={item.id} />
                    <button className="secondary-button" type="submit">
                      Send Booking Link
                    </button>
                  </form>
                ) : null}
                {!["completed", "cancelled"].includes(item.status) ? (
                  <form action={updateCallback} className="callback-form">
                    <input name="callback_id" type="hidden" value={item.id} />
                    <input name="scheduled_for" type="datetime-local" />
                    {item.status === "scheduled" ? (
                      <button className="primary-button" name="status" type="submit" value="completed">
                        Mark completed
                      </button>
                    ) : null}
                    <button className="secondary-button" name="status" type="submit" value="scheduled">
                      Schedule
                    </button>
                    <button className="text-button" name="status" type="submit" value="cancelled">
                      Cancel
                    </button>
                  </form>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <div className="empty-panel">
            <h2>No callbacks pending</h2>
            <p>Confirmed human follow-ups appear here after qualified calls.</p>
          </div>
        )}
      </section>
    </>
  );
}
