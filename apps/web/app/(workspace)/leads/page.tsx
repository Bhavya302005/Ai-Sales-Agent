import Link from "next/link";

import { getLeads, getOffering } from "@/lib/api";
import { confirmedBusinessProfile } from "@/lib/business-profile";
import { diagnosticsEnabled } from "@/lib/runtime";

export default async function LeadsPage() {
  const [leads, offering] = await Promise.all([getLeads(), getOffering()]);
  const profile = confirmedBusinessProfile(offering);
  if (!profile) {
    return (
      <>
        <header className="page-header">
          <div>
            <div className="eyebrow">Opportunity review</div>
            <h1 className="page-title">Set up your business first</h1>
          </div>
          <span className="knowledge-state blocked">Business profile required</span>
        </header>
        <section className="empty-panel">
          <h2>No leads are ready for review.</h2>
          <p>Complete business setup before discovering and qualifying matching opportunities.</p>
          <Link className="primary-button action-link" href="/onboarding">Complete business setup</Link>
        </section>
      </>
    );
  }
  const visibleLeads = diagnosticsEnabled()
    ? leads
    : leads.filter(
        (lead) =>
          lead.product_version_id === profile.id &&
          !lead.source_url.startsWith("fixture://"),
      );
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">Opportunity review</div>
          <h1 className="page-title">Evidence before outreach.</h1>
        </div>
        <span className="mode-badge">Ranked by evidence and fit</span>
      </header>
      <section className="lead-list" aria-label="Opportunities">
        {visibleLeads.map((lead) => (
          <Link className="lead-row" href={`/leads/${lead.id}`} key={lead.id}>
            <div>
              <div className="lead-meta">
                <span>{lead.company_name ?? "Company unknown"}</span>
                <span>·</span>
                <span>{lead.lifecycle}</span>
              </div>
              <h2>{lead.normalized_need}</h2>
              <p>{lead.source_url.startsWith("fixture://") ? "Sample opportunity data" : lead.source_url}</p>
            </div>
            <div className="score-orb" aria-label={lead.score === null ? "Not scored" : `Score ${lead.score}`}>
              {lead.score ?? "—"}
              <span>fit</span>
            </div>
          </Link>
        ))}
        {visibleLeads.length === 0 && (
          <div className="empty-panel">
            <h2>No opportunities yet.</h2>
            <p>Connect a discovery source or import consenting leads into a campaign.</p>
          </div>
        )}
      </section>
    </>
  );
}
