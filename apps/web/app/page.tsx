import Link from "next/link";

import { diagnosticsEnabled } from "@/lib/runtime";

import { ApiHealth } from "./ui/api-health";

export default function Home() {
  const showDiagnostics = diagnosticsEnabled();
  return (
    <main className="shell">
      <div className="eyebrow">SignalPath · AI sales workspace</div>
      <h1>Evidence in. Human-ready opportunity out.</h1>
      <p className="lede">
        A transparent workflow for discovering a requirement, explaining fit, qualifying with
        consent, and handing the outcome to a person—without inventing missing facts.
      </p>
      <div className="landing-actions">
        <Link className="primary-button action-link" href="/onboarding">
          Open workspace
        </Link>
        {showDiagnostics ? <Link className="secondary-link" href="/voice-lab">Voice diagnostics</Link> : null}
      </div>
      <section className="grid" aria-label="MVP status">
        <article className="card">
          <h2>Two ways to start</h2>
          <ol className="path">
            <li><strong>Leads + Calling:</strong> discover, review, then call</li>
            <li><strong>Calling Only:</strong> upload consenting leads, then call</li>
          </ol>
        </article>
        {showDiagnostics ? <ApiHealth /> : <article className="card"><h2>Built for responsible outreach</h2><p className="panel-copy">Consent gates, source evidence, suppression checks, and human-owned follow-up are part of every campaign.</p></article>}
      </section>
      <section className="journey-card" aria-label="End-to-end product journey">
        {["Business", "Discovery", "Review", "Campaign", "Call", "Insights", "Follow-up"].map(
          (step, index) => (
            <div key={step}><span>{index + 1}</span><strong>{step}</strong></div>
          ),
        )}
      </section>
    </main>
  );
}
