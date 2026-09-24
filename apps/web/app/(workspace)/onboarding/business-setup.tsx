"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";

import type { BusinessProfileAnalysis, OfferingVersion } from "@/lib/api";

import { confirmBusinessProfile } from "./actions";

type Props = { productName: string; active?: OfferingVersion };
const DRAFT_STORAGE_KEY = "signalpath.business-profile-draft.v1";
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
  const [confirming, setConfirming] = useState(false);
  const [confirmStage, setConfirmStage] = useState("Locking approved profile & ICP rules…");
  const [draftReady, setDraftReady] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Array<{ name: string; size: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).map((file) => ({
      name: file.name,
      size: file.size >= 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
        : `${Math.round(file.size / 1024)} KB`,
    }));
    setSelectedFiles(files);
  }

  useEffect(() => {
    if (!confirming) return;
    const stages = [
      "Locking approved business profile & ICP rules…",
      "Triggering Exa Lead Finder for active buyer requirements…",
      "Scanning LinkedIn, RFP boards, and tender portals with Exa…",
      "Mining buyer-intent opportunities & decision-maker signals…",
      "Ingesting opportunities and loading your workspace…",
    ];
    let idx = 0;
    const interval = window.setInterval(() => {
      idx++;
      if (idx < stages.length) {
        setConfirmStage(stages[idx]);
      }
    }, 2800);
    return () => window.clearInterval(interval);
  }, [confirming]);

  useEffect(() => {
    let draft: Partial<{
      companyName: string;
      companyUrl: string;
      businessDetails: string;
      services: string;
    }> = {};
    try {
      const stored = window.sessionStorage.getItem(DRAFT_STORAGE_KEY);
      if (stored) {
        draft = JSON.parse(stored) as typeof draft;
      }
    } catch {
      window.sessionStorage.removeItem(DRAFT_STORAGE_KEY);
    }
    const restoreDraft = window.setTimeout(() => {
      if (typeof draft.companyName === "string") setCompanyName(draft.companyName);
      if (typeof draft.companyUrl === "string") setCompanyUrl(draft.companyUrl);
      if (typeof draft.businessDetails === "string") setBusinessDetails(draft.businessDetails);
      if (typeof draft.services === "string") setServices(draft.services);
      setDraftReady(true);
    }, 0);
    return () => window.clearTimeout(restoreDraft);
  }, []);

  useEffect(() => {
    if (!draftReady) return;
    window.sessionStorage.setItem(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ companyName, companyUrl, businessDetails, services }),
    );
  }, [businessDetails, companyName, companyUrl, draftReady, services]);

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
      {active?.is_callable ? (
        <section className="active-profile-card">
          <div className="active-profile-info">
            <div className="active-profile-header-row">
              <span className="active-profile-pill">
                <span className="active-profile-dot" />
                Active Profile · Version {active.version}
              </span>
            </div>
            <h2 className="active-profile-title">
              {companyName || productName} is configured and ready
            </h2>
            <p className="active-profile-copy">
              Powering autonomous lead matching, fit scoring, and voice qualification across all campaigns.
            </p>
          </div>
          <div className="active-profile-quick-actions">
            <Link className="primary-button" href="/leads?provider=live">
              View matching leads →
            </Link>
            <Link className="secondary-button" href="/campaigns">
              Manage campaigns
            </Link>
          </div>
        </section>
      ) : null}

      <ol className="setup-steps" aria-label="Business setup progress">
        <li className="current"><span>1</span>{active?.is_callable ? "Update business evidence" : "Tell us about your business"}</li>
        <li className={analysis ? "current" : ""}><span>2</span>Review AI understanding</li>
        <li><span>3</span>Choose your workflow</li>
      </ol>

      <section className="detail-panel setup-intake">
        <div className="section-heading">
          <div>
            <p className="kicker">
              {active?.is_callable
                ? `Update business profile · Version ${active.version} currently active`
                : "Step 1 · Business evidence"}
            </p>
            <h2>What does your company sell?</h2>
          </div>
        </div>
        <p className="panel-copy">
          {active?.is_callable
            ? "Your current active profile remains locked for all calls. Submitting new evidence below allows you to review and approve an updated profile version."
            : "Add what you already have. We propose a profile; nothing becomes callable until you review and confirm it."}
        </p>
        <form onSubmit={analyze} className="knowledge-form">
          <label>Company name<input name="company_name" required minLength={2} value={companyName} onChange={(event) => setCompanyName(event.target.value)} /></label>
          <label>Company website<input name="company_url" type="url" placeholder="https://yourcompany.com" value={companyUrl} onChange={(event) => setCompanyUrl(event.target.value)} /></label>
          <label className="wide-field">Business description<textarea name="business_details" rows={4} placeholder="What you do, the outcomes you deliver, and what makes you different…" value={businessDetails} onChange={(event) => setBusinessDetails(event.target.value)} /></label>
          <label className="wide-field">Products or services — one per line<textarea name="services" rows={4} placeholder={"Microsoft 365 consulting\nSharePoint migration\nEmployee intranet implementation"} value={services} onChange={(event) => setServices(event.target.value)} /></label>

          <div className="wide-field upload-zone">
            <div className="upload-zone-header">
              <span className="upload-zone-title">Supporting documents (optional)</span>
              {active?.profile_source_count ? (
                <span className="upload-zone-active-sources">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  {active.profile_source_count} evidence source(s) active in your profile
                </span>
              ) : null}
            </div>

            <label className="upload-zone-droparea">
              <input
                ref={fileInputRef}
                name="documents"
                type="file"
                multiple
                accept=".txt,.md,.html,.htm,.pdf,.docx"
                onChange={handleFileChange}
                className="upload-hidden-input"
                aria-label="Upload supporting documents"
              />
              <div className="upload-droparea-content">
                <div className="upload-icon-circle">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <div className="upload-droparea-text">
                  <strong>Choose files or drag &amp; drop</strong>
                  <span>TXT, Markdown, HTML, PDF, or DOCX · up to 5 files · 2 MB each</span>
                </div>
              </div>
            </label>

            {selectedFiles.length > 0 ? (
              <div className="upload-selected-files">
                <span className="upload-files-heading">Ready for analysis ({selectedFiles.length}):</span>
                <div className="upload-files-list">
                  {selectedFiles.map((file, idx) => (
                    <div className="upload-file-chip" key={idx}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span className="upload-file-name">{file.name}</span>
                      <span className="upload-file-size">({file.size})</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <p className="upload-note">
              Uploaded documents are parsed and converted into AI evidence facts in your active profile. Browsers do not re-populate raw file inputs after page reload.
            </p>
          </div>

          {error ? <p className="form-error wide-field" role="alert">{error}</p> : null}
          <div className="wide-field form-submit-row">
            <p>Your text entries are saved in this browser tab while you review. Website and document content is treated as evidence—not instructions.</p>
            <button className="primary-button" disabled={loading} type="submit">
              {loading ? "Understanding your business…" : "Analyze my business"}
            </button>
          </div>
        </form>
      </section>

      {analysis ? (
        <section className="detail-panel setup-review">
          <div className="section-heading"><div><p className="kicker">Step 2 · Review required</p><h2>Here is what we understood</h2></div><span className="verified-pill">{analysis.analysis_method === "gemini" ? "AI generated" : "Conservative fallback"}</span></div>
          {analysis.warning ? <p className="setup-warning">{analysis.warning}</p> : null}
          <form
            action={confirmBusinessProfile}
            onSubmit={() => {
              setConfirming(true);
              setConfirmStage("Locking approved profile & ICP rules…");
            }}
            className="knowledge-form"
          >
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
            <div className="wide-field form-submit-row">
              <p>This creates an approved, versioned profile. You can create a new version later.</p>
              <button className="primary-button" disabled={confirming} type="submit">
                {confirming ? "Searching opportunities with Exa…" : "Confirm profile and continue"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {confirming ? (
        <div className="discovery-loading-overlay" role="status" aria-live="polite">
          <div className="discovery-loading-card">
            <div className="discovery-radar-wrap">
              <div className="discovery-radar-wave wave-1" />
              <div className="discovery-radar-wave wave-2" />
              <div className="discovery-radar-wave wave-3" />
              <div className="discovery-radar-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
            </div>
            <span className="discovery-eyebrow">AI Opportunity Discovery</span>
            <h3 className="discovery-title">Exa Lead Finder Active</h3>
            <p className="discovery-stage-text">{confirmStage}</p>
            <div className="discovery-progress-bar">
              <div className="discovery-progress-indicator" />
            </div>
            <div className="discovery-badges">
              <span className="source-pill active">
                <span className="pill-dot" />
                Exa Neural Search
              </span>
              <span className="source-pill">LinkedIn Intent</span>
              <span className="source-pill">Public RFPs</span>
              <span className="source-pill">Contact Enrichment</span>
            </div>
            <p className="discovery-subtext">
              Exa is searching live market sources for buyer intent matching your verified ICP. Your workspace will open automatically as soon as leads are loaded.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
