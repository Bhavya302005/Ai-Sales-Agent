import Link from "next/link";

import { getDiscovery, getDiscoveryStatus } from "@/lib/api";
import { diagnosticsEnabled } from "@/lib/runtime";

import { importDiscoveryDemo, refreshLiveDiscovery } from "./actions";

type Search = Promise<{
  type?: string;
  source?: string;
  q?: string;
  actionable?: string;
  provider?: string;
}>;

function label(value: string) {
  return value.replaceAll("_", " ");
}

export default async function SourcesPage({ searchParams }: { searchParams: Search }) {
  const filters = await searchParams;
  const query = new URLSearchParams();
  if (filters.type) query.set("type", filters.type);
  if (filters.source) query.set("source", filters.source);
  if (filters.q) query.set("q", filters.q);
  if (filters.actionable) query.set("actionable", filters.actionable);
  const [results, status] = await Promise.all([getDiscovery(query.toString()), getDiscoveryStatus()]);
  const showDiagnostics = diagnosticsEnabled();
  const visibleResults = showDiagnostics
    ? results
    : results.filter((item) => !item.original_url.startsWith("fixture://"));
  const direct = visibleResults.filter((item) => item.actionable);
  const signals = visibleResults.filter((item) => !item.actionable);
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">Discover with provenance</div>
          <h1 className="page-title">Requirements and market signals</h1>
        </div>
        <span className={`knowledge-state ${status.live_refresh_available ? "callable" : "blocked"}`}>{status.label}</span>
      </header>

      {filters.provider === "failed" ? (
        <div className="provider-notice warning-copy">
          Live Exa refresh was unavailable. Existing verified snapshot results were retained.
        </div>
      ) : filters.provider ? (
        <div className="provider-notice">
          {filters.provider === "live" ? "Live Exa results refreshed." : "Verified snapshot imported."}
        </div>
      ) : null}

      <section className="source-import-panel">
        <div>
          <p className="kicker">Opportunity discovery</p>
          <h2>{status.live_refresh_available ? "Find new matches for your approved ICP" : "Connect a discovery provider"}</h2>
          <p>
            Direct requirements enter review. Hiring posts and weaker signals remain market intelligence
            and never become call-eligible automatically.
          </p>
        </div>
        <div className="source-controls">
          {status.live_refresh_available ? <form action={refreshLiveDiscovery}><button className="primary-button" type="submit">Refresh opportunities</button></form> : <Link className="secondary-button" href="/settings/integrations">View integrations</Link>}
          {showDiagnostics ? <form action={importDiscoveryDemo}><button className="text-button" type="submit">Load diagnostic snapshot</button></form> : null}
        </div>
      </section>

      <form className="filter-bar" method="get">
        <input defaultValue={filters.q} name="q" placeholder="Company or requirement" />
        <select defaultValue={filters.type ?? ""} name="type">
          <option value="">All types</option>
          <option value="direct_requirement">Direct requirement</option>
          <option value="project_contract">Project contract</option>
          <option value="tender">Tender</option>
          <option value="freelance_project">Freelance project</option>
          <option value="hiring_signal">Hiring signal</option>
        </select>
        <select defaultValue={filters.actionable ?? ""} name="actionable">
          <option value="">Any status</option>
          <option value="true">Actionable</option>
          <option value="false">Signal only</option>
        </select>
        <button className="secondary-button" type="submit">Filter</button>
      </form>

      <section className="discovery-section">
        <div className="section-heading">
          <div><p className="kicker">Leads + Calling</p><h2>Direct opportunities ({direct.length})</h2></div>
          <span className="verified-pill">Operator review required</span>
        </div>
        <div className="source-list">
          {direct.map((item) => <DiscoveryCard item={item} key={item.id} />)}
          {!direct.length ? <p className="panel-copy">No direct opportunities match these filters.</p> : null}
        </div>
      </section>

      <section className="discovery-section signal-section">
        <div className="section-heading">
          <div><p className="kicker">Market intelligence</p><h2>Hiring and weak signals ({signals.length})</h2></div>
          <span className="mode-badge">Never auto-callable</span>
        </div>
        <div className="source-list">
          {signals.map((item) => <DiscoveryCard item={item} key={item.id} />)}
          {!signals.length ? <p className="panel-copy">No market signals match these filters.</p> : null}
        </div>
      </section>
    </>
  );
}

function DiscoveryCard({ item }: { item: Awaited<ReturnType<typeof getDiscovery>>[number] }) {
  const live = item.source === "exa_live_search";
  const sample = item.original_url.startsWith("fixture://");
  return (
    <article className="source-card">
      <div className="source-card-header">
        <div>
          <span>{label(item.opportunity_type)} · {label(item.source)}</span>
          <strong>{item.title}</strong>
          <small>{item.company ?? "Company unknown"} · {item.location ?? "Location unknown"}</small>
        </div>
        <b>{live ? "Live" : sample ? "Sample" : "Saved"}</b>
      </div>
      <blockquote>“{item.evidence_excerpt}”</blockquote>
      <dl>
        <div><dt>Original source</dt><dd>{sample ? "Sample opportunity · no public URL" : item.original_url}</dd></div>
        <div><dt>Published</dt><dd>{item.published_at ? new Date(item.published_at).toLocaleDateString("en-IN") : "Unknown"}</dd></div>
        <div><dt>Status</dt><dd>{item.actionable ? "Actionable after review" : "Signal only"}</dd></div>
      </dl>
      <p className="fine-print">Rights: {sample ? "Sample data for product walkthrough" : item.rights_note}</p>
    </article>
  );
}
