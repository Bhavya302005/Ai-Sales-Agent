"use client";

import { type FormEvent, useState } from "react";

import type { BusinessProfileAnalysis, OfferingVersion } from "@/lib/api";

import { confirmBusinessProfile } from "./actions";

type Props = { productName: string; active?: OfferingVersion };
const lines = (values: string[]) => values.join("\n");
const factLines = (values: Record<string, string>) =>
  Object.entries(values).map(([key, value]) => `${key}: ${value}`).join("\n");

export function BusinessSetup({ productName, active }: Props) {
  const [analysis, setAnalysis] = useState<BusinessProfileAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState(productName);
  const [companyUrl, setCompanyUrl] = useState(active?.company_url ?? "");
  const [businessDetails, setBusinessDetails] = useState(active?.description ?? "");
  const [services, setServices] = useState(active ? lines(active.services) : "");

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/business-profile/analyze", { method: "POST", body: formData });
      const body = (await response.json().catch(() => ({}))) as BusinessProfileAnalysis & {
        detail?: string | Array<{ msg?: string }>;
      };
      if (!response.ok) {
        const detail = Array.isArray(body.detail)
          ? body.detail.map((item) => item.msg).filter(Boolean).join("; ")
          : body.detail;
        throw new Error(detail || "Business analysis failed");
      }
      setAnalysis(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Business analysis failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="business-setup">
      <ol className="setup-steps" aria-label="Business setup progress">
        <li className="current"><span>1</span>Tell us about your business</li>
        <li className={analysis ? "current" : ""}><span>2</span>Review AI understanding</li>
        <li><span>3</span>Choose your workflow</li>
      </ol>

      <section className="detail-panel setup-intake">
        <div className="section-heading"><div><p className="kicker">Step 1 · Business evidence</p><h2>What does your company sell?</h2></div></div>
        <p className="panel-copy">Add what you already have. We propose a profile; nothing becomes callable until you review and confirm it.</p>
        <form onSubmit={analyze} className="knowledge-form">
          <label>Company name<input name="company_name" required minLength={2} value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></label>
          <label>Company website<input name="company_url" type="url" placeholder="https://yourcompany.com" value={companyUrl} onChange={(event) => setCompanyUrl(event.target.value)} /></label>
          <label className="wide-field">Business description<textarea name="business_details" rows={4} placeholder="What you do, the outcomes you deliver, and what makes you different…" value={businessDetails} onChange={(event) => setBusinessDetails(event.target.value)} /></label>
          <label className="wide-field">Products or services — one per line<textarea name="services" rows={4} placeholder={"Microsoft 365 consulting\nSharePoint migration\nEmployee intranet implementation"} value={services} onChange={(event) => setServices(event.target.value)} /></label>
          <label className="wide-field upload-zone">Supporting documents (optional)<input name="documents" type="file" multiple accept=".txt,.md,.html,.htm,.pdf,.docx" /><small>TXT, Markdown, HTML, PDF, or DOCX · up to 5 files · 2 MB each.</small></label>
          {error ? <p className="form-error wide-field" role="alert">{error}</p> : null}
          <div className="wide-field form-submit-row"><p>Website and document content is treated as evidence—not instructions.</p><button className="primary-button" disabled={loading} type="submit">{loading ? "Understanding your business…" : "Analyze my business"}</button></div>
        </form>
      </section>

      {analysis ? (
        <section className="detail-panel setup-review">
          <div className="section-heading"><div><p className="kicker">Step 2 · Review required</p><h2>Here is what we understood</h2></div><span className="verified-pill">{analysis.analysis_method === "gemini" ? "AI generated" : "Conservative fallback"}</span></div>
          {analysis.warning ? <p className="setup-warning">{analysis.warning}</p> : null}
          <form action={confirmBusinessProfile} className="knowledge-form">
            <input name="analysis_token" type="hidden" value={analysis.analysis_token} />
            <label>Company name<input name="company_name" required defaultValue={analysis.company_name} /></label>
            <label className="wide-field">Offering summary<textarea name="description" required minLength={20} rows={4} defaultValue={analysis.description} /></label>
            <label>Services<textarea name="services" required rows={5} defaultValue={lines(analysis.services)} /></label>
            <label>Target customers<textarea name="target_customers" required rows={5} defaultValue={lines(analysis.target_customers)} /></label>
            <label>Target geographies<textarea name="geographies" required rows={3} defaultValue={lines(analysis.icp.geographies)} /></label>
            <label>Target industries<textarea name="industries" required rows={3} defaultValue={lines(analysis.icp.industries)} /></label>
            <label className="wide-field">Customer needs we should look for<textarea name="needs" required rows={4} defaultValue={lines(analysis.icp.needs)} /></label>
            <details className="wide-field advanced-review">
              <summary>Review sales guardrails and qualification logic</summary>
              <div className="knowledge-form nested-form">
                <label>Approved facts — label: answer<textarea name="facts" required rows={4} defaultValue={factLines(analysis.facts)} /></label>
                <label>Exclusions<textarea name="exclusions" required rows={4} defaultValue={lines(analysis.exclusions)} /></label>
                <label className="wide-field">Pricing policy<textarea name="pricing_policy" required rows={3} defaultValue={analysis.pricing_policy} /></label>
                <label>Qualification questions<textarea name="qualification_questions" required rows={5} defaultValue={lines(analysis.qualification_questions)} /></label>
                <label>Human-handoff rules<textarea name="handoff_conditions" required rows={5} defaultValue={lines(analysis.handoff_conditions)} /></label>
              </div>
            </details>
            <div className="wide-field evidence-box"><strong>Sources used ({analysis.sources.length})</strong>{analysis.sources.map((source) => <p key={`${source.kind}-${source.content_hash}`}>{source.kind}: {source.label}</p>)}</div>
            <fieldset className="wide-field workflow-choice">
              <legend>Step 3 · What do you want to do first?</legend>
              <label><input name="workflow_mode" type="radio" value="leads_and_calling" defaultChecked /><span><strong>Find leads and call</strong><small>Discover matching opportunities, review them, then start a campaign.</small></span></label>
              <label><input name="workflow_mode" type="radio" value="calling_only" /><span><strong>Call my own leads</strong><small>Upload your consenting lead list and create a calling campaign.</small></span></label>
            </fieldset>
            <label className="wide-field confirmation-check"><input name="confirmed" type="checkbox" required />I reviewed this profile and approve it for lead matching and AI call preparation.</label>
            <div className="wide-field form-submit-row"><p>This creates an approved, versioned profile. You can create a new version later.</p><button className="primary-button" type="submit">Confirm profile and continue</button></div>
          </form>
        </section>
      ) : null}
    </div>
  );
}
