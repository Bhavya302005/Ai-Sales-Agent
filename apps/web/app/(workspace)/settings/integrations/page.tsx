import { getBookingIntegrationStatus, getCampaigns, getCrmStatus, getDiscoveryStatus, getHubSpotContacts } from "@/lib/api";
import { getEmailOutreachStatus } from "../../campaigns/email-outreach/actions";
import { CustomSelect } from "@/app/ui/custom-select";

import { importHubSpotContact } from "./actions";

export default async function IntegrationsPage() {
  const [crm, allCampaigns, discovery, emailStatus, bookingStatus] = await Promise.all([
    getCrmStatus(),
    getCampaigns(),
    getDiscoveryStatus(),
    getEmailOutreachStatus().catch(() => ({ enabled: false, mode: "disabled", from_address: null, from_name: "SignalPath" })),
    getBookingIntegrationStatus(),
  ]);
  const campaigns = allCampaigns.filter((item) => item.mode === "calling_only");
  const contacts = crm.mode === "hubspot" && crm.configured ? await getHubSpotContacts() : null;
  return (
    <>
      <header className="page-header">
        <div><div className="eyebrow">External systems</div><h1 className="page-title">Integrations</h1></div>
        <span className={`knowledge-state ${crm.configured ? "callable" : "blocked"}`}>{crm.configured ? "Connected" : "Not connected"}</span>
      </header>
      <section className="integration-card">
        <div><p className="kicker">CRM provider</p><h2>{crm.label}</h2></div>
        <span className={crm.configured ? "knowledge-state callable" : "knowledge-state blocked"}>
          {crm.configured ? "Ready" : "Credentials required"}
        </span>
        <p>
          {crm.mode === "mock"
            ? "Connect HubSpot to import contacts and create follow-up tasks from qualified calls."
            : "Live mode: creates and reads back one HubSpot task. Failures become visible for retry or operator action."}
        </p>
      </section>
      <section className="integration-card operations-section">
        <div><p className="kicker">Opportunity discovery</p><h2>{discovery.label}</h2></div>
        <span className={discovery.live_refresh_available ? "knowledge-state callable" : "knowledge-state blocked"}>{discovery.live_refresh_available ? "Ready" : "Not connected"}</span>
        <p>{discovery.live_refresh_available ? "Public opportunities can be refreshed from the Discover workspace." : "Connect an approved public-search provider in deployment settings to enable live discovery."}</p>
      </section>

      <section className="integration-card operations-section">
        <div><p className="kicker">Calendly human handoff</p><h2>{bookingStatus.calendly_configured ? "Calendly connected" : "Calendly not configured"}</h2></div>
        <span className={bookingStatus.calendly_configured ? "knowledge-state callable" : "knowledge-state blocked"}>
          {bookingStatus.calendly_configured ? "Ready" : "Credentials required"}
        </span>
        <p>
          SMS mode: {bookingStatus.sms_mode}{bookingStatus.sms_live ? " (live delivery)" : " (simulated or disabled)"}. Booking checks run through {bookingStatus.scheduler_mode} scheduling after {bookingStatus.retry_delay_minutes} minute(s){bookingStatus.demo_mode ? " in test-only demo mode" : ""}.
        </p>
      </section>

      <section className="integration-card operations-section">
        <div><p className="kicker">Email outreach provider</p><h2>{emailStatus.enabled ? (emailStatus.mode === "sendgrid" ? "SendGrid" : "SMTP") : "Not configured"}</h2></div>
        <span className={emailStatus.enabled ? "knowledge-state callable" : "knowledge-state blocked"}>
          {emailStatus.enabled ? "Connected" : "Not connected"}
        </span>
        <p>
          {emailStatus.enabled
            ? `Emails will be sent from ${emailStatus.from_name} ${emailStatus.from_address ? `<${emailStatus.from_address}>` : ""} via ${emailStatus.mode}.`
            : "Set EMAIL_OUTREACH_MODE=sendgrid and your SENDGRID_API_KEY in the environment to enable email outreach features."}
        </p>
      </section>

      {contacts ? (
        <section className="integration-card operations-section">
          <div><p className="kicker">CRM lead import</p><h2>{contacts.label}</h2></div>
          <span className="knowledge-state callable">Live preview</span>
          <form action={importHubSpotContact} className="hubspot-import-form">
            <label>
              <span>CRM contact</span>
              <CustomSelect
                name="external_contact_id"
                defaultValue=""
                placeholder="Choose an importable contact"
                options={contacts.contacts
                  .filter((item) => item.importable)
                  .map((item) => ({
                    value: item.external_id,
                    label: `${item.display_name} · ${item.company} · ${item.masked_phone}`,
                  }))}
                required
                ariaLabel="CRM contact"
              />
            </label>
            <label>
              <span>Calling-only campaign</span>
              <CustomSelect
                name="campaign_id"
                defaultValue=""
                placeholder="Choose campaign"
                options={campaigns.map((item) => ({
                  value: item.id,
                  label: item.name,
                }))}
                required
                ariaLabel="Calling-only campaign"
              />
            </label>
            <label className="wide-field">Actual business requirement<textarea maxLength={2000} minLength={5} name="requirement" required rows={4} /></label>
            <label className="wide-field">Consent basis<input maxLength={500} minLength={5} name="consent_basis" required /></label>
            <label className="wide-field consent-check"><input name="consent_attested" required type="checkbox" /> I confirm this contact consented to the selected outreach workflow.</label>
            <button className="primary-button" type="submit">Import for review</button>
          </form>
        </section>
      ) : (
        <section className="integration-card operations-section">
          <div><p className="kicker">CRM lead import</p><h2>Connect HubSpot to import contacts</h2></div>
          <span className="knowledge-state blocked">Connection required</span>
          <p>A workspace owner can enable the HubSpot private-app connection in deployment settings.</p>
        </section>
      )}
    </>
  );
}
