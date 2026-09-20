import { getCampaigns, getCrmStatus, getHubSpotContacts } from "@/lib/api";

import { importHubSpotContact } from "./actions";

export default async function IntegrationsPage() {
  const crm = await getCrmStatus();
  const campaigns = (await getCampaigns()).filter((item) => item.mode === "calling_only");
  const contacts = crm.mode === "hubspot" && crm.configured ? await getHubSpotContacts() : null;
  return (
    <>
      <header className="page-header">
        <div><div className="eyebrow">External systems</div><h1 className="page-title">Integrations</h1></div>
        <span className="mode-badge">{crm.mode}</span>
      </header>
      <section className="integration-card">
        <div><p className="kicker">CRM provider</p><h2>{crm.label}</h2></div>
        <span className={crm.configured ? "knowledge-state callable" : "knowledge-state blocked"}>
          {crm.configured ? "Ready" : "Credentials required"}
        </span>
        <p>
          {crm.mode === "mock"
            ? "Demo-safe mode: creates deterministic local CRM references and verifies duplicate requests without claiming an external write."
            : "Live mode: creates and reads back one HubSpot task. Failures become visible for retry or operator action."}
        </p>
      </section>
      {contacts ? <section className="integration-card operations-section">
        <div><p className="kicker">CRM lead import</p><h2>{contacts.label}</h2></div>
        <span className="knowledge-state callable">Live preview</span>
        <form action={importHubSpotContact} className="hubspot-import-form">
          <label>Sandbox contact<select name="external_contact_id" required><option value="">Choose an importable contact</option>{contacts.contacts.filter((item) => item.importable).map((item) => <option key={item.external_id} value={item.external_id}>{item.display_name} · {item.company} · {item.masked_phone}</option>)}</select></label>
          <label>Calling-only campaign<select name="campaign_id" required><option value="">Choose campaign</option>{campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="wide-field">Actual business requirement<textarea maxLength={2000} minLength={5} name="requirement" required rows={4} /></label>
          <label className="wide-field">Consent basis<input maxLength={500} minLength={5} name="consent_basis" required /></label>
          <label className="wide-field consent-check"><input name="consent_attested" required type="checkbox" /> I attest this synthetic sandbox contact consented to this demo workflow.</label>
          <button className="primary-button" type="submit">Import for review</button>
        </form>
      </section> : <section className="integration-card operations-section"><div><p className="kicker">CRM lead import</p><h2>Enable HubSpot mode to preview sandbox contacts</h2></div><span className="knowledge-state blocked">Configuration required</span><p>Set CRM_MODE=hubspot and HUBSPOT_ACCESS_TOKEN, then restart the API.</p></section>}
    </>
  );
}
