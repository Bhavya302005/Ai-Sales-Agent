import Link from "next/link";

import { getCallbacks } from "@/lib/api";

import { updateCallback } from "./actions";

export default async function CallbacksPage() {
  const callbacks = await getCallbacks();
  return (
    <>
      <header className="page-header"><div><div className="eyebrow">Human follow-up</div><h1 className="page-title">Callbacks</h1></div><span className="mode-badge">Operator confirmed</span></header>
      <section className="operations-list">{callbacks.length ? callbacks.map((item) => <article className="operation-card" key={item.id}><div><p className="kicker">{item.status.replaceAll("_", " ")}</p><h2>{item.requested_text}</h2><p>{item.scheduled_for ? `Scheduled ${new Date(item.scheduled_for).toLocaleString("en-IN")}` : "Choose an exact callback time after human confirmation."}</p><Link href={`/calls/${item.call_id}`}>View call evidence</Link></div>{!["completed", "cancelled"].includes(item.status) ? <form action={updateCallback} className="callback-form"><input name="callback_id" type="hidden" value={item.id} /><input name="scheduled_for" type="datetime-local" />{item.status === "scheduled" ? <button className="primary-button" name="status" type="submit" value="completed">Mark completed</button> : null}<button className="secondary-button" name="status" type="submit" value="scheduled">Schedule</button><button className="text-button" name="status" type="submit" value="cancelled">Cancel</button></form> : null}</article>) : <div className="empty-panel"><h2>No callbacks pending</h2><p>Confirmed human follow-ups appear here after qualified calls.</p></div>}</section>
    </>
  );
}
