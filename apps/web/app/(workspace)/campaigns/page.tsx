import Link from "next/link";

import { getCallingProvider, getCampaignRuns, getCampaigns, getLeads, type CampaignRun } from "@/lib/api";
import { diagnosticsEnabled } from "@/lib/runtime";
import { CustomSelect, type CustomSelectOption } from "@/app/ui/custom-select";

import {
  approveLead,
  addLeadToCampaign,
  createCampaign,
  dispatchPstnCall,
  importLeadFile,
  requestBrowserCall,
  requestPstnCall,
  processDueCampaigns,
  updateCampaignRun,
} from "./actions";
import { CallStatusPoller } from "./call-status-poller";

const WORKFLOW_OPTIONS: CustomSelectOption[] = [
  { value: "leads_and_calling", label: "Discover leads + call" },
  { value: "calling_only", label: "Call an uploaded list" },
];

const SCHEDULE_OPTIONS: CustomSelectOption[] = [
  { value: "once", label: "Run once" },
  { value: "daily", label: "Run daily" },
  { value: "weekly", label: "Run weekly" },
  { value: "monthly", label: "Run monthly" },
];

export default async function CampaignsPage() {
  const [campaigns, leads, provider] = await Promise.all([getCampaigns(), getLeads(), getCallingProvider()]);
  const campaignRunEntries = await Promise.all(
    campaigns.map(async (campaign) => [campaign.id, await getCampaignRuns(campaign.id)] as const),
  );
  const runsByCampaign: Record<string, CampaignRun[]> = Object.fromEntries(campaignRunEntries);
  const showDiagnostics = diagnosticsEnabled();
  const hasActiveCalls = campaigns.some((campaign) =>
    campaign.leads.some((item) => ["connecting", "active", "ending"].includes(item.latest_call_state ?? ""))
  );
  return (
    <>
      <header className="page-header">
        <div><div className="eyebrow">Call control</div><h1 className="page-title">Campaigns and calling</h1></div>
        <span className={`knowledge-state ${provider.pstn_configured ? "callable" : "blocked"}`}>{provider.pstn_configured ? `${provider.label} ready` : "Calling setup required"}</span>
      </header>
      <CallStatusPoller active={hasActiveCalls} />
      <section className="campaign-create-panel">
        <div><p className="kicker">Explicit workflow</p><h2>Create a safe campaign</h2></div>
        <form action={createCampaign} className="campaign-create-form">
          <label><span>Campaign name</span><input name="name" placeholder="e.g. SharePoint opportunities" required /></label>
          <label>
            <span>Workflow</span>
            <CustomSelect
              name="mode"
              defaultValue="leads_and_calling"
              options={WORKFLOW_OPTIONS}
              ariaLabel="Select campaign workflow"
            />
          </label>
          <label><span>Time zone</span><input defaultValue="Asia/Kolkata" name="timezone" required /></label>
          <label>
            <span>Schedule</span>
            <CustomSelect
              name="recurrence"
              defaultValue="once"
              options={SCHEDULE_OPTIONS}
              ariaLabel="Select campaign schedule"
            />
          </label>
          <button className="primary-button" type="submit">Create campaign</button>
          <details className="campaign-advanced-settings">
            <summary>Retry and budget controls</summary>
            <div>
              <label><span>Maximum attempts</span><input defaultValue="1" max="5" min="1" name="max_attempts" type="number" /></label>
              <label><span>Retry delay (minutes)</span><input defaultValue="60" max="1440" min="5" name="retry_delay_minutes" type="number" /></label>
              <label><span>Daily budget (₹)</span><input defaultValue="500" min="0" name="daily_budget_inr" type="number" /></label>
            </div>
          </details>
        </form>
      </section>
      <section className="campaign-list">
        {campaigns.map((campaign) => (
          <article className="campaign-card" key={campaign.id}>
            <div className="section-heading">
              <div><p className="kicker">{campaign.mode.replaceAll("_", " ")} · {campaign.status} · {campaign.timezone}</p><h2>{campaign.name}</h2></div>
              <strong>₹{campaign.daily_budget_inr} daily cap</strong>
            </div>
            <p className="fine-print">
              {campaign.recurrence} · maximum {campaign.max_attempts} attempt{campaign.max_attempts === 1 ? "" : "s"} · retry after {campaign.retry_delay_minutes} minutes
              {campaign.scheduled_start_at ? ` · starts ${new Date(campaign.scheduled_start_at).toLocaleString("en-IN")}` : " · available now"}
            </p>
            <p className="fine-print">Calling provider: {provider.label} · {provider.pstn_configured ? "ready" : "action required in Administration"}</p>
            {(runsByCampaign[campaign.id] ?? []).slice(0, 3).map((run) => (
              <div className="campaign-run" key={run.id}>
                <span><b>{run.state}</b> · {new Date(run.scheduled_for).toLocaleString("en-IN")} · {run.ready_lead_count} approved lead(s)</span>
                {!["completed", "cancelled"].includes(run.state) ? (
                  <form action={updateCampaignRun}>
                    <input name="campaign_id" type="hidden" value={campaign.id} />
                    <input name="run_id" type="hidden" value={run.id} />
                    <button className="text-button" name="state" type="submit" value="completed">Complete</button>
                    <button className="text-button" name="state" type="submit" value="cancelled">Cancel</button>
                  </form>
                ) : null}
              </div>
            ))}
            {campaign.mode === "calling_only" ? (
              <form action={importLeadFile} className="lead-upload-form">
                <input name="campaign_id" type="hidden" value={campaign.id} />
                <label>
                  <span>Upload consenting leads (CSV/XLSX, max 100 rows)</span>
                  <input accept=".csv,.xlsx" name="file" required type="file" />
                </label>
                <button className="secondary-button" type="submit">Validate and import</button>
              </form>
            ) : (() => {
              const availableLeads = leads
                .filter((lead) => !campaign.leads.some((item) => item.lead_id === lead.id))
                .map((lead) => ({
                  value: lead.id,
                  label: `${lead.company_name ?? "Unknown company"} — ${lead.normalized_need}`,
                }));
              return (
                <form action={addLeadToCampaign} className="lead-upload-form">
                  <input name="campaign_id" type="hidden" value={campaign.id} />
                  <label>
                    <span>Add a reviewed direct opportunity</span>
                    <CustomSelect
                      name="lead_id"
                      defaultValue=""
                      placeholder={availableLeads.length > 0 ? "Choose an opportunity" : "No available opportunities"}
                      options={availableLeads}
                      required
                      ariaLabel="Choose an opportunity"
                    />
                  </label>
                  <button className="secondary-button" type="submit" disabled={availableLeads.length === 0}>
                    Add for review
                  </button>
                </form>
              );
            })()}
            {campaign.leads.map((item) => {
              const lead = leads.find((candidate) => candidate.id === item.lead_id);
              return <div className="campaign-lead" key={item.id}>
                <div>
                  <Link href={`/leads/${item.lead_id}`}>{lead?.company_name ?? "Review opportunity"}</Link>
                  <span>Status: {item.state.replaceAll("_", " ")}</span>
                  {item.disposition !== item.state ? <span className={item.disposition === "interested" ? "interested-pill" : ""}>Outcome: {item.disposition.replaceAll("_", " ")}</span> : null}
                  {item.latest_call_state ? <b>Last attempt: {item.latest_call_transport} · {item.latest_call_state}</b> : null}
                </div>
                {item.approved_at ? (
                  item.contact_id ? (
                    <div className="call-actions">
                      {showDiagnostics && item.latest_call_transport === "browser" && item.latest_call_state === "eligible" && item.latest_call_id ? (
                        <Link className="secondary-button" href={`/calls/${item.latest_call_id}`}>Open voice diagnostic</Link>
                      ) : showDiagnostics ? (
                        <form action={requestBrowserCall}>
                          <input name="campaign_id" type="hidden" value={campaign.id} />
                          <input name="lead_id" type="hidden" value={item.lead_id} />
                          <input name="contact_id" type="hidden" value={item.contact_id} />
                          <input name="idempotency_key" type="hidden" value={`browser:${item.id}:${item.lead_id}:${item.contact_id}:${item.latest_call_id ?? "first"}`} />
                          <button className="text-button" type="submit">Prepare voice diagnostic</button>
                        </form>
                      ) : null}
                      {item.latest_call_id && item.latest_call_state === "completed" ? (
                        <Link className="primary-button" href={`/calls/${item.latest_call_id}`}>View call summary & evidence →</Link>
                      ) : ["twilio", "omnidim"].includes(item.latest_call_transport ?? "") && item.latest_call_state === "eligible" && item.latest_call_id ? (
                        <form action={dispatchPstnCall}>
                          <input name="call_id" type="hidden" value={item.latest_call_id} />
                          <button className="primary-button" type="submit">Start call</button>
                        </form>
                      ) : ["twilio", "omnidim"].includes(item.latest_call_transport ?? "") && item.latest_call_id && ["connecting", "active", "ending"].includes(item.latest_call_state ?? "") ? (
                        <Link className="primary-button" href={`/calls/${item.latest_call_id}`}>Track call</Link>
                      ) : (
                        <form className="pstn-consent-form" action={requestPstnCall}>
                          <input name="campaign_id" type="hidden" value={campaign.id} />
                          <input name="lead_id" type="hidden" value={item.lead_id} />
                          <input name="contact_id" type="hidden" value={item.contact_id} />
                          <input name="transport" type="hidden" value={provider.transport} />
                          <input name="idempotency_key" type="hidden" value={`${provider.transport}:${item.id}:${item.lead_id}:${item.contact_id}:${item.latest_call_id ?? "first"}`} />
                          <label><input name="consent_attested" type="checkbox" required /> I confirm this contact consented to receive this call</label>
                          <button className="primary-button" disabled={!provider.pstn_configured} type="submit">Prepare call</button>
                        </form>
                      )}
                    </div>
                  ) : <span className="warning-copy">No callable contact</span>
                ) : (
                  <form action={approveLead}>
                    <input name="campaign_id" type="hidden" value={campaign.id} />
                    <input name="lead_id" type="hidden" value={item.lead_id} />
                    <button className="secondary-button" type="submit">Approve for outreach</button>
                  </form>
                )}
                {item.latest_call_checks.some((check) => !check.passed) ? (
                  <ul className="eligibility-failures">
                    {item.latest_call_checks.filter((check) => !check.passed).map((check) => (
                      <li key={check.name}>{check.reason}</li>
                    ))}
                  </ul>
                ) : null}
              </div>;
            })}
          </article>
        ))}
      </section>
      {showDiagnostics ? <form className="diagnostic-action" action={processDueCampaigns}><button className="text-button" type="submit">Process scheduler now</button></form> : null}
    </>
  );
}
