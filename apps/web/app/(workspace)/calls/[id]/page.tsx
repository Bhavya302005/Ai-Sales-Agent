import Link from "next/link";

import { getCallDetail } from "@/lib/api";

import { AudioPlayer } from "./audio-player";
import { BrowserCallSession } from "./browser-call-session";
import { callFailureMessage } from "./call-status";
import { refreshProviderCall, syncHandoffToCrm } from "./actions";
import { CallStatusPoller } from "@/app/(workspace)/campaigns/call-status-poller";
import { CopyLinkButton } from "@/app/ui/copy-link-button";

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const call = await getCallDetail(id);
  const evidence = new Set(call.qualification?.evidence_segment_ids ?? []);
  const providerSummary = typeof call.usage.provider_summary === "string" ? call.usage.provider_summary : null;
  const providerSentiment = typeof call.usage.provider_sentiment === "string" ? call.usage.provider_sentiment : null;
  const recordingAvailable = call.usage.provider_recording_available === true;
  const durationSeconds = typeof call.usage.duration_seconds === "number" ? call.usage.duration_seconds : 0;
  const isCallActive = ["connecting", "active", "ending"].includes(call.state);
  return (
    <>
      <Link className="back-link compact" href="/campaigns">← Campaigns</Link>
      <header className="page-header">
        <div>
          <div className="eyebrow">Consent-gated {call.transport === "browser" ? "voice diagnostic" : "outbound call"}</div>
          <h1 className="page-title">AI qualification session</h1>
        </div>
        <span className="mode-badge">{call.state}</span>
      </header>
      <CallStatusPoller active={isCallActive} intervalMs={2000} />
      {call.state === "eligible" && call.transport === "browser" ? (
        <BrowserCallSession callId={call.id} maxDuration={call.max_duration_seconds} />
      ) : ["twilio", "omnidim"].includes(call.transport) && call.state === "eligible" ? (
        <section className="empty-panel">
          <h2>Ready to start the call.</h2>
          <p>{call.transport === "omnidim" ? "OmniDimension status: eligible. Call is ready to dispatch." : "Twilio status: eligible."}</p>
        </section>
      ) : (call.state === "completed" || isCallActive) ? (
        <div className="call-detail-grid">
          <section className="detail-panel transcript-panel">
            <div className="section-heading">
              <div>
                <p className="kicker">{isCallActive ? "Live conversation" : "Finalized evidence"}</p>
                <h2>{isCallActive ? "Live transcript" : "Transcript"}</h2>
              </div>
              {isCallActive ? (
                call.transport === "omnidim" ? (
                  <span className="verified-pill">Pending provider sync</span>
                ) : (
                  <span className="verified-pill" style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(46, 125, 50, 0.1)", color: "#1b5e20", border: "1px solid rgba(46, 125, 50, 0.2)" }}>
                    <span className="active-profile-dot" /> Live sync active
                  </span>
                )
              ) : (
                <span className="verified-pill">{recordingAvailable ? "Provider recording available" : "Audio not stored"}</span>
              )}
            </div>
            <div className="transcript-list">
              {call.transcript.length > 0 ? (
                call.transcript.map((segment) => (
                  <article
                    id={`segment-${segment.id}`}
                    className={evidence.has(segment.id) ? "transcript-row cited" : "transcript-row"}
                    key={segment.id}
                  >
                    <div><span>{segment.speaker}</span><small>#{segment.sequence} · {segment.language}</small></div>
                    <p>{segment.text}</p>
                  </article>
                ))
              ) : (
                <article className="transcript-row" style={{ textAlign: "center", padding: "36px 16px" }}>
                  <p style={{ color: "var(--muted)", margin: 0 }}>
                    {call.transport === "omnidim"
                      ? "OmniDimension calls do not stream transcripts live. Complete the phone call, then use 'Refresh transcript now' to fetch the final log."
                      : "Call in progress with recipient. Conversation turns will appear here live as speech is exchanged."}
                  </p>
                </article>
              )}
            </div>
          </section>
          <div className="call-outcome-stack">
            {isCallActive ? (
              <section className="detail-panel">
                <div className="section-heading">
                  <div>
                    <p className="kicker">Live provider status</p>
                    <h2>Call in progress</h2>
                  </div>
                  <span className="mode-badge">{call.state}</span>
                </div>
                <p className="panel-copy">
                  {call.transport === "omnidim"
                    ? `OmniDimension status: ${call.usage.provider_status || call.state}. Audio is streaming between AI agent and prospect.`
                    : `Twilio call active (${call.state}).`}
                </p>
                {call.transport === "omnidim" ? (
                  <form action={refreshProviderCall} style={{ marginTop: "16px" }}>
                    <input name="call_id" type="hidden" value={call.id} />
                    <button className="secondary-button" type="submit">Refresh transcript now</button>
                  </form>
                ) : (
                  <Link className="secondary-button" href={`/calls/${call.id}`} style={{ marginTop: "16px", display: "inline-block" }}>
                    Refresh status
                  </Link>
                )}
              </section>
            ) : null}
            {(providerSummary || recordingAvailable) ? (
              <section className="detail-panel provider-insights">
                <p className="kicker">Provider insights</p>
                <h2>Call summary</h2>
                {providerSummary ? <p className="panel-copy">{providerSummary}</p> : null}
                {providerSentiment ? <p className="fine-print">Sentiment: {providerSentiment}</p> : null}
                {recordingAvailable ? (
                  <AudioPlayer
                    callId={call.id}
                    initialDuration={durationSeconds}
                    summaryText={providerSummary ?? undefined}
                  />
                ) : null}
              </section>
            ) : null}
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
            {call.booking_followup ? (
              <section className="detail-panel handoff-panel">
                <p className="kicker">Calendly handoff</p>
                <h2>Booking follow-up</h2>
                <div className="handoff-copy">
                  <strong>{call.booking_followup.status.replaceAll("_", " ")}</strong>
                  <p>
                    SMS: {call.booking_followup.delivery_mode} · {call.booking_followup.delivery_status}
                  </p>
                  {call.booking_followup.delivery_status === "simulated" ? (
                    <small>Demo mode: the booking link was prepared, but no SMS was sent.</small>
                  ) : null}
                  {call.booking_followup.scheduled_start_at ? (
                    <small>Booked for {new Date(call.booking_followup.scheduled_start_at).toLocaleString("en-IN")}</small>
                  ) : call.booking_followup.booking_check_at ? (
                    <small>Booking check {new Date(call.booking_followup.booking_check_at).toLocaleString("en-IN")}</small>
                  ) : null}
                  {call.booking_followup.calendly_link ? (
                    <div className="operation-actions">
                      <CopyLinkButton value={call.booking_followup.calendly_link} />
                      <a className="text-button" href={call.booking_followup.calendly_link} rel="noreferrer" target="_blank">Open Calendly</a>
                    </div>
                  ) : null}
                  {call.booking_followup.retry_call_id ? (
                    <Link className="text-button" href={`/calls/${call.booking_followup.retry_call_id}`}>View reminder call →</Link>
                  ) : null}
                  {call.booking_followup.last_error_code ? (
                    <small>Action required: {call.booking_followup.last_error_code.replaceAll("_", " ")}</small>
                  ) : null}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      ) : (
        <section className="empty-panel">
          <h2>{call.state === "failed" ? "The call did not complete." : "This call cannot start."}</h2>
          <p>
            {call.state === "failed"
              ? callFailureMessage(call)
              : `Current state: ${call.state}. Return to Campaigns to review the eligibility decision.`}
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
