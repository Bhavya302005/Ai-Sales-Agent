import Link from "next/link";

import { getLead } from "@/lib/api";

function label(value: string) {
  return value.replaceAll("_", " ");
}

function date(value: string | null) {
  if (!value) return "Not stated";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(
    new Date(value),
  );
}

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await getLead(id);
  const isSample = lead.source.url.startsWith("fixture://");
  return (
    <>
      <Link className="back-link compact" href="/leads">
        ← All opportunities
      </Link>
      <header className="detail-header">
        <div>
          <div className="eyebrow">
            {lead.contact_name ? `${lead.contact_name} · ${lead.company_name ?? "Company unknown"}` : (lead.company_name ?? "Company unknown")}
          </div>
          <h1 className="page-title">{lead.normalized_need}</h1>
        </div>
        <div className="score-orb large">
          {lead.score ?? "—"}
          <span>fit score</span>
        </div>
      </header>

      <section className="evidence-card">
        <div className="section-heading">
          <div>
            <p className="kicker">Original evidence</p>
            <h2>What the source actually says</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="verified-pill">{isSample ? "Sample data" : "Source verified"}</span>
            {!isSample && lead.source.url ? (
              <a
                href={lead.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="secondary-button"
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", padding: "6px 12px" }}
              >
                <span>Open original post</span>
                <span aria-hidden="true">↗</span>
              </a>
            ) : null}
          </div>
        </div>
        <blockquote>“{lead.source.evidence_excerpt}”</blockquote>
        <dl className="source-facts">
          <div>
            <dt>Origin URL</dt>
            <dd>
              {isSample ? (
                "Sample opportunity · no public URL"
              ) : (
                <a
                  href={lead.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="primary-link"
                  style={{ wordBreak: "break-all", display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  <span>{lead.source.url}</span>
                  <span aria-hidden="true">↗</span>
                </a>
              )}
            </dd>
          </div>
          <div><dt>Published</dt><dd>{date(lead.source.published_at)}</dd></div>
          <div><dt>Observed</dt><dd>{date(lead.source.observed_at)}</dd></div>
          <div><dt>Rights</dt><dd>{isSample ? "Sample data for product walkthrough" : lead.source.rights_note}</dd></div>
        </dl>
      </section>

      <div className="detail-grid">
        <div className="detail-col">
          <section className="detail-panel contact-panel">
            <p className="kicker">Direct contact</p>
            <h2>Verified phone & email</h2>
            <div className="contact-badges" style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginTop: "16px" }}>
              {lead.best_phone ? (
                <a
                  href={`tel:${lead.best_phone}`}
                  className="contact-badge phone-badge"
                  style={{ padding: "8px 16px", fontSize: "13.5px", fontWeight: 500 }}
                  title="Click to dial"
                >
                  <span className="badge-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </span>
                  <span>{lead.best_phone}</span>
                  <span className="badge-action">Call now</span>
                </a>
              ) : (
                <span className="contact-badge none-badge" style={{ padding: "8px 16px", fontSize: "13px" }}>
                  <span className="badge-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </span>
                  <span>Phone enriched on demand</span>
                </span>
              )}
              {lead.best_email ? (
                <a
                  href={`mailto:${lead.best_email}`}
                  className="contact-badge email-badge"
                  style={{ padding: "8px 16px", fontSize: "13.5px", fontWeight: 500 }}
                  title="Click to compose email"
                >
                  <span className="badge-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  </span>
                  <span>{lead.best_email}</span>
                  <span className="badge-action" style={{ background: "#0288d1" }}>Email</span>
                </a>
              ) : null}
            </div>
            <p className="fine-print" style={{ marginTop: "16px" }}>
              Verified via deep Exa intelligence & source crawl. Call-ready for human or AI outreach.
            </p>
          </section>

          <section className="detail-panel unknown-panel">
            <p className="kicker">Explicit uncertainty</p>
            <h2>Still unknown</h2>
            <ul className="unknown-list">
              {lead.unknown_fields.length > 0 ? (
                lead.unknown_fields.map((field) => <li key={field}>{label(field)}</li>)
              ) : (
                <li>All primary fields verified</li>
              )}
            </ul>
            <p className="panel-copy">Unknown values do not become positive scoring signals or outreach permission.</p>
          </section>
        </div>

        <section className="detail-panel">
          <p className="kicker">Why this lead</p>
          <h2>Transparent score</h2>
          {lead.score_detail ? (
            <>
              <p className="panel-copy">{lead.score_detail.explanation}</p>
              <div className="contributions">
                {lead.score_detail.contributions.map((item) => (
                  <div className="contribution" key={item.feature}>
                    <div><strong>{label(item.feature)}</strong><span>{Math.round(item.value * 100)}% signal</span></div>
                    <div className="bar"><i style={{ width: `${item.value * 100}%` }} /></div>
                    <b>+{item.points}</b>
                  </div>
                ))}
              </div>
              <p className="fine-print">{lead.score_detail.rule_version} · confidence {Math.round(lead.score_detail.confidence * 100)}%</p>
            </>
          ) : <p className="panel-copy">Scoring has not run.</p>}
        </section>
      </div>

      <section className="detail-panel assertions-panel">
        <div className="section-heading">
          <div><p className="kicker">Field provenance</p><h2>Assertion ledger</h2></div>
          <span className="mode-badge">{lead.assertions.length} assertion</span>
        </div>
        <div className="assertion-table" role="table" aria-label="Field assertions">
          {lead.assertions.map((assertion) => (
            <div className="assertion-row" role="row" key={assertion.id}>
              <div><span>Field</span><strong>{label(assertion.field_name)}</strong></div>
              <div><span>Status</span><strong>{label(assertion.status)}</strong></div>
              <div><span>Confidence</span><strong>{Math.round(assertion.confidence * 100)}%</strong></div>
              <div className="assertion-evidence"><span>Evidence</span><strong>{assertion.evidence_excerpt ?? "No excerpt"}</strong></div>
            </div>
          ))}
        </div>
      </section>

      <section className="offering-strip">
        <div>
          <p className="kicker">Approved offering · v{lead.offering.version}</p>
          <strong>{lead.offering.description}</strong>
        </div>
        <div>
          <p className="kicker">Pricing policy</p>
          <p>{lead.offering.pricing_policy}</p>
        </div>
      </section>

      {lead.pre_call_brief ? (
        <section className="brief-panel">
          <div className="section-heading">
            <div><p className="kicker">Grounded call preparation</p><h2>Pre-call brief</h2></div>
            <span className="verified-pill">Approved knowledge only</span>
          </div>
          <div className="brief-grid">
            <div className="brief-primary">
              <span>Suggested opener</span>
              <blockquote>“{lead.pre_call_brief.opener.text}”</blockquote>
              <small>Source-backed · {lead.pre_call_brief.opener.citations[0].reference_id}</small>
            </div>
            <div>
              <span>Likely need</span>
              <strong>{lead.pre_call_brief.likely_need.text}</strong>
            </div>
            <div>
              <span>Approved fit</span>
              <strong>{lead.pre_call_brief.fit_summary.text}</strong>
            </div>
          </div>
          <div className="brief-columns">
            <div>
              <h3>Qualification questions</h3>
              <ol>{lead.pre_call_brief.qualification_questions.map((item) => <li key={item.label}>{item.text}</li>)}</ol>
            </div>
            <div>
              <h3>Escalate to a human</h3>
              <ul>{lead.pre_call_brief.escalation_topics.map((item) => <li key={item.label}>{item.text}</li>)}</ul>
            </div>
            <div>
              <h3>Never invent</h3>
              <ul>{lead.pre_call_brief.prohibited_claims.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
