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
          <div className="eyebrow">{lead.company_name ?? "Company unknown"}</div>
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
          <span className="verified-pill">{isSample ? "Sample data" : "Source verified"}</span>
        </div>
        <blockquote>“{lead.source.evidence_excerpt}”</blockquote>
        <dl className="source-facts">
          <div><dt>Origin</dt><dd>{isSample ? "Sample opportunity · no public URL" : lead.source.url}</dd></div>
          <div><dt>Published</dt><dd>{date(lead.source.published_at)}</dd></div>
          <div><dt>Observed</dt><dd>{date(lead.source.observed_at)}</dd></div>
          <div><dt>Rights</dt><dd>{isSample ? "Sample data for product walkthrough" : lead.source.rights_note}</dd></div>
        </dl>
      </section>

      <div className="detail-grid">
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

        <section className="detail-panel unknown-panel">
          <p className="kicker">Explicit uncertainty</p>
          <h2>Still unknown</h2>
          <ul className="unknown-list">
            {lead.unknown_fields.map((field) => <li key={field}>{label(field)}</li>)}
          </ul>
          <p className="panel-copy">Unknown values do not become positive scoring signals or outreach permission.</p>
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
        <div><p className="kicker">Approved offering · v{lead.offering.version}</p><strong>{lead.offering.description}</strong></div>
        <p>{lead.offering.pricing_policy}</p>
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
