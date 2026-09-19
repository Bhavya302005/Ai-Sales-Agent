import { getCrmStatus } from "@/lib/api";

export default async function IntegrationsPage() {
  const crm = await getCrmStatus();
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
    </>
  );
}
