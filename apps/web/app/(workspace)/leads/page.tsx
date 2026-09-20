import Link from "next/link";

import { getLeads } from "@/lib/api";

export default async function LeadsPage() {
  const leads = await getLeads();
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
        {leads.map((lead) => (
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
        {leads.length === 0 && (
          <div className="empty-panel">
            <h2>No opportunities yet.</h2>
            <p>Connect a discovery source or import consenting leads into a campaign.</p>
          </div>
        )}
      </section>
    </>
  );
}
