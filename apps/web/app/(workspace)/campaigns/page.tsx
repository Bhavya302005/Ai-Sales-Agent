import Link from "next/link";

import { getCampaigns, getLeads } from "@/lib/api";

import {
  approveLead,
  addLeadToCampaign,
  createCampaign,
  dispatchPstnCall,
  importLeadFile,
  requestBrowserCall,
  requestPstnCall,
} from "./actions";

export default async function CampaignsPage() {
  const [campaigns, leads] = await Promise.all([getCampaigns(), getLeads()]);
  return (
    <>
      <header className="page-header">
        <div><div className="eyebrow">Call control</div><h1 className="page-title">Campaigns and calling</h1></div>
        <span className="mode-badge">Consent required</span>
      </header>
      <section className="campaign-create-panel">
        <div><p className="kicker">Explicit workflow</p><h2>Create a safe campaign</h2></div>
        <form action={createCampaign} className="campaign-create-form">
          <input name="name" placeholder="Campaign name" required />
          <select defaultValue="leads_and_calling" name="mode">
            <option value="leads_and_calling">Leads + Calling</option>
            <option value="calling_only">Calling Only</option>
          </select>
          <input defaultValue="Asia/Kolkata" name="timezone" required />
          <select defaultValue="once" name="recurrence">
            <option value="once">One time</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <input defaultValue="1" max="5" min="1" name="max_attempts" type="number" />
          <input defaultValue="500" min="0" name="daily_budget_inr" type="number" />
          <button className="primary-button" type="submit">Create campaign</button>
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
              {campaign.recurrence} · maximum {campaign.max_attempts} attempt{campaign.max_attempts === 1 ? "" : "s"}
              {campaign.scheduled_start_at ? ` · starts ${new Date(campaign.scheduled_start_at).toLocaleString("en-IN")}` : " · available now"}
            </p>
            {campaign.mode === "calling_only" ? (
              <form action={importLeadFile} className="lead-upload-form">
                <input name="campaign_id" type="hidden" value={campaign.id} />
                <label>
                  Upload consenting leads (CSV/XLSX, max 100 rows)
                  <input accept=".csv,.xlsx" name="file" required type="file" />
                </label>
                <button className="secondary-button" type="submit">Validate and import</button>
              </form>
            ) : (
              <form action={addLeadToCampaign} className="lead-upload-form">
                <input name="campaign_id" type="hidden" value={campaign.id} />
                <label>
                  Add a reviewed direct opportunity
                  <select name="lead_id" required>
                    <option value="">Choose an opportunity</option>
                    {leads
                      .filter((lead) => !campaign.leads.some((item) => item.lead_id === lead.id))
                      .map((lead) => (
                        <option key={lead.id} value={lead.id}>
                          {lead.company_name ?? "Unknown company"} — {lead.normalized_need}
                        </option>
                      ))}
                  </select>
                </label>
                <button className="secondary-button" type="submit">Add for review</button>
              </form>
            )}
            {campaign.leads.map((item) => (
              <div className="campaign-lead" key={item.id}>
                <div>
                  <Link href={`/leads/${item.lead_id}`}>Review opportunity</Link>
                  <span>{item.state.replaceAll("_", " ")}</span>
                  <span className={item.disposition === "interested" ? "interested-pill" : ""}>{item.disposition.replaceAll("_", " ")}</span>
                  {item.latest_call_state ? <b>Latest {item.latest_call_transport} call: {item.latest_call_state}</b> : null}
                </div>
                {item.approved_at ? (
                  item.contact_id ? (
                    <div className="call-actions">
                      {item.latest_call_transport === "browser" && item.latest_call_state === "eligible" && item.latest_call_id ? (
                        <Link className="secondary-button" href={`/calls/${item.latest_call_id}`}>Open browser test</Link>
                      ) : (
                        <form action={requestBrowserCall}>
                          <input name="campaign_id" type="hidden" value={campaign.id} />
                          <input name="lead_id" type="hidden" value={item.lead_id} />
                          <input name="contact_id" type="hidden" value={item.contact_id} />
                          <input name="idempotency_key" type="hidden" value={`browser:${item.id}:${item.lead_id}:${item.contact_id}:${item.latest_call_id ?? "first"}`} />
                          <button className="secondary-button" type="submit">Prepare browser test</button>
                        </form>
                      )}
                      {item.latest_call_transport === "twilio" && item.latest_call_state === "eligible" && item.latest_call_id ? (
                        <form action={dispatchPstnCall}>
                          <input name="call_id" type="hidden" value={item.latest_call_id} />
                          <button className="primary-button" type="submit">Place real test call</button>
                        </form>
                      ) : item.latest_call_transport === "twilio" && item.latest_call_id && ["connecting", "active", "ending"].includes(item.latest_call_state ?? "") ? (
                        <Link className="primary-button" href={`/calls/${item.latest_call_id}`}>Track real call</Link>
                      ) : (
                        <form className="pstn-consent-form" action={requestPstnCall}>
                          <input name="campaign_id" type="hidden" value={campaign.id} />
                          <input name="lead_id" type="hidden" value={item.lead_id} />
                          <input name="contact_id" type="hidden" value={item.contact_id} />
                          <input name="idempotency_key" type="hidden" value={`twilio:${item.id}:${item.lead_id}:${item.contact_id}:${item.latest_call_id ?? "first"}`} />
                          <label><input name="consent_attested" type="checkbox" required /> Participant consented to this PSTN test</label>
                          <button className="primary-button" type="submit">Prepare real call</button>
                        </form>
                      )}
                    </div>
                  ) : <span className="warning-copy">No verified test contact</span>
                ) : (
                  <form action={approveLead}>
                    <input name="campaign_id" type="hidden" value={campaign.id} />
                    <input name="lead_id" type="hidden" value={item.lead_id} />
                    <button className="secondary-button" type="submit">Approve test lead</button>
                  </form>
                )}
                {item.latest_call_checks.some((check) => !check.passed) ? (
                  <ul className="eligibility-failures">
                    {item.latest_call_checks.filter((check) => !check.passed).map((check) => (
                      <li key={check.name}>{check.reason}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </article>
        ))}
      </section>
    </>
  );
}
