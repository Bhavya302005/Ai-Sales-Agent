import Link from "next/link";

import { getCallDetail } from "@/lib/api";

import { BrowserCallSession } from "./browser-call-session";
import { callFailureMessage } from "./call-status";
import { syncHandoffToCrm } from "./actions";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = await getCallDetail(id);
  const evidence = new Set(call.qualification?.evidence_segment_ids ?? []);
  return (
    <>
      <Link className="back-link compact" href="/campaigns">← Campaign eligibility</Link>
      <header className="page-header">
        <div>
          <div className="eyebrow">Consent-gated {call.transport === "twilio" ? "PSTN" : "browser"} call</div>
          <h1 className="page-title">AI qualification session</h1>
        </div>
        <span className="mode-badge">{call.state}</span>
      </header>
      {call.state === "eligible" && call.transport === "browser" ? (
        <BrowserCallSession callId={call.id} maxDuration={call.max_duration_seconds} />
      ) : call.transport === "twilio" && ["eligible", "connecting", "active", "ending"].includes(call.state) ? (
        <section className="empty-panel">
          <h2>{call.state === "eligible" ? "Ready to place the real call." : "Real test call is in progress."}</h2>
          <p>Twilio status: {call.state}. Audio is processed live and is not recorded.</p>
          <Link className="secondary-button" href={`/calls/${call.id}`}>Refresh status</Link>
        </section>
      ) : call.state === "completed" ? (
        <div className="call-detail-grid">
          <section className="detail-panel transcript-panel">
            <div className="section-heading">
              <div><p className="kicker">Finalized evidence</p><h2>Transcript</h2></div>
              <span className="verified-pill">Audio not stored</span>
            </div>
            <div className="transcript-list">
              {call.transcript.map((segment) => (
                <article
                  id={`segment-${segment.id}`}
                  className={evidence.has(segment.id) ? "transcript-row cited" : "transcript-row"}
                  key={segment.id}
                >
                  <div><span>{segment.speaker}</span><small>#{segment.sequence} · {segment.language}</small></div>
                  <p>{segment.text}</p>
                </article>
              ))}
            </div>
          </section>
          <div className="call-outcome-stack">
            <section className="detail-panel">
              <p className="kicker">Verified result</p><h2>Qualification</h2>
              {call.qualification ? (
                <dl className="qualification-list">
                  <div><dt>Need</dt><dd>{call.qualification.need ?? "Unknown"}</dd></div>
                  <div><dt>Scope</dt><dd>{call.qualification.scope ?? "Unknown"}</dd></div>
                  <div><dt>Timeline</dt><dd>{call.qualification.timeline ?? "Unknown"}</dd></div>
                  <div><dt>Authority known</dt><dd>{call.qualification.authority_known === null ? "Unknown" : call.qualification.authority_known ? "Yes" : "No"}</dd></div>
                  <div><dt>Budget known</dt><dd>{call.qualification.budget_known === null ? "Unknown" : call.qualification.budget_known ? "Yes" : "No"}</dd></div>
                  <div><dt>Interest</dt><dd>{call.qualification.interest ?? "Unknown"}</dd></div>
                  <div><dt>Next step</dt><dd>{call.qualification.requested_next_step ?? "None confirmed"}</dd></div>
                </dl>
              ) : <p className="panel-copy">No finalized qualification is available.</p>}
            </section>
            <section className="detail-panel handoff-panel">
              <p className="kicker">Owned next action</p><h2>Human handoff</h2>
              {call.handoff ? (
                <div className="handoff-copy">
                  <strong>{call.handoff.priority} priority · {call.handoff.state}</strong>
                  <p>{call.handoff.reason}</p>
                  <small>Due {new Date(call.handoff.due_at).toLocaleString("en-IN")}</small>
                  <small>Owner {call.handoff.owner_id}</small>
                  <small>CRM: {call.handoff.crm_provider} · {call.handoff.crm_sync_status}</small>
                  {call.handoff.external_reference ? (
                    <small>{call.handoff.external_reference}</small>
                  ) : (
                    <form action={syncHandoffToCrm}>
                      <input name="handoff_id" type="hidden" value={call.handoff.id} />
                      <input name="call_id" type="hidden" value={call.id} />
                      <button className="secondary-button" type="submit">Sync to {call.handoff.crm_provider} CRM</button>
                    </form>
                  )}
                </div>
              ) : <p className="panel-copy">No handoff was required for this outcome.</p>}
            </section>
          </div>
        </div>
      ) : (
        <section className="empty-panel">
          <h2>{call.state === "failed" ? "The real call did not complete." : "This call cannot start."}</h2>
          <p>
            {call.state === "failed"
              ? callFailureMessage(call)
              : `Current state: ${call.state}. Return to Campaign eligibility to review the decision.`}
          </p>
          <ul className="eligibility-failures">
            {call.eligibility_checks.filter((check) => !check.passed).map((check) => (
              <li key={check.name}>{check.reason}</li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
