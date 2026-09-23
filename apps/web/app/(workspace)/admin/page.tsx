import Link from "next/link";

import { getAdmin, getViewer } from "@/lib/api";
import { CustomSelect, type CustomSelectOption } from "@/app/ui/custom-select";

import { updateMember, updateRuntimeControls } from "./actions";

const ROLE_OPTIONS: CustomSelectOption[] = [
  { value: "owner", label: "Owner" },
  { value: "operator", label: "Operator" },
  { value: "viewer", label: "Viewer" },
];

const STATUS_OPTIONS: CustomSelectOption[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ action?: string; offset?: string }> }) {
  const query = await searchParams;
  const offset = Math.max(0, Number.parseInt(query.offset ?? "0", 10) || 0);
  const action = (query.action ?? "").slice(0, 100);
  const viewer = await getViewer();
  if (viewer.me.role !== "owner") return <div className="empty-panel"><h2>Owner access required</h2></div>;
  const { members, audit, controls, health, security } = await getAdmin(action, offset);
  return (
    <>
      <header className="page-header"><div><div className="eyebrow">Workspace control</div><h1 className="page-title">Administration</h1></div><span className="mode-badge">Owner only</span></header>
      <section className="operations-grid">
        <article className="detail-panel"><p className="kicker">Runtime safety</p><h2>{controls.effective_calls_paused ? "Calling paused" : "Calling available"}</h2><p className="panel-copy">Environment switch: {controls.environment_kill_switch ? "on" : "off"}</p><form action={updateRuntimeControls}><input name="calls_paused" type="hidden" value={controls.calls_paused ? "false" : "true"} /><button className="primary-button" type="submit">{controls.calls_paused ? "Resume calls" : "Pause all calls"}</button></form></article>
        <article className="detail-panel"><p className="kicker">Provider readiness</p><div className="usage-list">{Object.entries(health.providers).map(([name, value]) => <div key={name}><span>{name.replaceAll("_", " ")}</span><strong>{value.replaceAll("_", " ")}</strong></div>)}</div></article>
      </section>
      <section className="detail-panel operations-section"><div className="section-heading"><div><p className="kicker">Risk and compliance</p><h2>Outreach safeguards</h2></div><span className={`knowledge-state ${security.posture === "clear" ? "callable" : "blocked"}`}>{security.posture}</span></div><div className="signal-grid"><div><span>Policy-blocked calls</span><strong>{security.blocked_calls}</strong></div><div><span>Failed calls</span><strong>{security.failed_calls}</strong></div><div><span>Suppressed contacts</span><strong>{security.active_suppressions}</strong></div><div><span>Sensitive admin changes</span><strong>{security.recent_sensitive_changes}</strong></div></div><ul className="guardrail-list">{security.safeguards.map((item) => <li key={item}>{item}</li>)}</ul><p className="fine-print">Deterministic operational controls and review signals.</p></section>
      <section className="detail-panel operations-section">
        <p className="kicker">Members</p>
        <h2>Roles and access</h2>
        {members.map((member) => (
          <form action={updateMember} className="member-row" key={member.id}>
            <input name="membership_id" type="hidden" value={member.id} />
            <code>{member.user_id}</code>
            <CustomSelect defaultValue={member.role} name="role" options={ROLE_OPTIONS} ariaLabel="Member role" />
            <CustomSelect defaultValue={member.status} name="status" options={STATUS_OPTIONS} ariaLabel="Member status" />
            <button className="secondary-button" type="submit">Update</button>
          </form>
        ))}
      </section>
      <section className="detail-panel operations-section">
        <p className="kicker">Audit trail</p>
        <h2>Administrative and workflow activity</h2>
        <form className="filter-bar" method="get">
          <input defaultValue={action} name="action" placeholder="Exact action, e.g. callback_updated" />
          <button className="secondary-button" type="submit">Filter</button>
        </form>
        <div className="audit-list">
          {audit.map((entry) => (
            <div key={entry.id}>
              <strong>{entry.action.replaceAll("_", " ")}</strong>
              <span>{entry.target_type} · {new Date(entry.occurred_at).toLocaleString("en-IN")}</span>
              <small>{entry.reason ?? "No reason supplied"}</small>
            </div>
          ))}
        </div>
        <div className="audit-pagination">
          {offset > 0 ? (
            <Link className="secondary-button" href={`/admin?action=${encodeURIComponent(action)}&offset=${Math.max(0, offset - 25)}`}>
              ← Previous
            </Link>
          ) : null}
          {audit.length === 25 ? (
            <Link className="secondary-button" href={`/admin?action=${encodeURIComponent(action)}&offset=${offset + 25}`}>
              Next →
            </Link>
          ) : null}
        </div>
      </section>
    </>
  );
}
