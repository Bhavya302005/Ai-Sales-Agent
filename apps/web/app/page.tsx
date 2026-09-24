import Link from "next/link";

import { diagnosticsEnabled } from "@/lib/runtime";

import { ApiHealth } from "./ui/api-health";

export default function Home() {
  const showDiagnostics = diagnosticsEnabled();
  return (
    <main className="shell">
      <header className="landing-nav" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "42px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#e83043", display: "inline-block" }} />
          <strong style={{ fontSize: "18px", letterSpacing: "-0.03em" }}>SignalPath</strong>
          <span style={{ fontSize: "11px", fontFamily: "var(--font-fragment-mono)", color: "var(--muted)", border: "1px solid var(--line-warm)", padding: "2px 8px", borderRadius: "100px" }}>AI SDR</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <Link href="/login" style={{ fontSize: "14px", fontWeight: 500, color: "var(--ink)", textDecoration: "none", padding: "6px 14px", borderRadius: "100px", border: "1px solid rgba(0,0,0,0.12)" }}>
            Sign In
          </Link>
          <Link href="/login" style={{ fontSize: "14px", fontWeight: 500, color: "#fff", background: "var(--ink)", textDecoration: "none", padding: "7px 16px", borderRadius: "100px" }}>
            Admin Portal
          </Link>
        </div>
      </header>

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
        <Link className="secondary-link" href="/login">
          Admin Sign In
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
