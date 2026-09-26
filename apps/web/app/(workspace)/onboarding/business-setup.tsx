"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";

import type { BusinessProfileAnalysis, OfferingVersion } from "@/lib/api";

import { confirmBusinessProfile } from "./actions";

type Props = { productName: string; active?: OfferingVersion; storageScope: string };
const lines = (values: string[]) => values.join("\n");
const factLines = (values: Record<string, string>) =>
  Object.entries(values).map(([key, value]) => `${key}: ${value}`).join("\n");

export function BusinessSetup({ productName, active, storageScope }: Props) {
  const draftStorageKey = `signalpath.business-profile-draft.v2.${storageScope}`;
  const uploadedDocsStorageKey = `signalpath.uploaded-docs.v2.${storageScope}`;
  const [analysis, setAnalysis] = useState<BusinessProfileAnalysis | null>(() => {
    if (active?.is_callable) {
      return {
        analysis_method: active.analysis_method || "gemini",
        analysis_token: "active-override",
        company_name: productName,
        description: active.description,
        services: active.services || [],
        target_customers: active.target_customers || [],
        icp: active.icp || { geographies: [], industries: [], needs: [] },
        facts: active.facts || {},
        exclusions: active.exclusions || [],
        pricing_policy: active.pricing_policy || "",
        qualification_questions: active.qualification_questions || [],
        handoff_conditions: active.handoff_conditions || [],
        sources: active.profile_sources || [],
      } as unknown as BusinessProfileAnalysis;
    }
    return null;
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState(productName);
  const [companyUrl, setCompanyUrl] = useState(active?.company_url ?? "");
  const [businessDetails, setBusinessDetails] = useState(active?.description ?? "");
  const [services, setServices] = useState(active ? lines(active.services) : "");
  const [confirming, setConfirming] = useState(false);
  const [confirmStage, setConfirmStage] = useState("Saving approved profile & ICP rules…");
  const [isEditing, setIsEditing] = useState(!active?.is_callable);
  const [draftReady, setDraftReady] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Array<{ name: string; size: string; file: File }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasActiveSources = Boolean(active?.profile_source_count && active.profile_source_count > 0);
  const [showUploadZone, setShowUploadZone] = useState(!hasActiveSources);
  const [savedDocNames, setSavedDocNames] = useState<string[]>([]);
  const [removedSources, setRemovedSources] = useState<string[]>([]);

  function focusField(fieldName: "company_url" | "business_details" | "services") {
    const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${fieldName}"]`);
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function beginEditing() {
    setIsEditing(true);
    window.setTimeout(() => {
      const editor = document.getElementById("business-profile-editor");
      if (typeof editor?.scrollIntoView === "function") {
        editor.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 0);
  }

  function triggerFileReplace() {
    fileInputRef.current?.click();
  }

  function toggleRemoveSource(label: string) {
    setRemovedSources((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    );
  }

  const activeSources = useMemo(() => {
    if (active?.profile_sources && active.profile_sources.length > 0) {
      return active.profile_sources;
    }
    const list: Array<{ label: string; kind: "website" | "document" | "user_input"; excerpt: string }> = [];
    if (active?.description || active?.services?.length) {
      list.push({
        label: "Business details & services",
        kind: "user_input",
        excerpt: active.description || (active.services || []).join(", "),
      });
    }
    if (active?.company_url) {
      list.push({
        label: active.company_url,
        kind: "website",
        excerpt: `Active company website evidence: ${active.company_url}`,
      });
    }
    if (savedDocNames.length > 0) {
      savedDocNames.forEach((name) => {
        list.push({
          label: name,
          kind: "document",
          excerpt: "Uploaded document evidence parsed into profile facts.",
        });
      });
    } else if (active?.profile_source_count && list.length < active.profile_source_count) {
      const docCount = active.profile_source_count - list.length;
      for (let i = 1; i <= docCount; i++) {
        list.push({
          label: `Uploaded document #${i}`,
          kind: "document",
          excerpt: "Document evidence parsed and locked into active profile.",
        });
      }
    }
    return list;
  }, [active, savedDocNames]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(uploadedDocsStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          window.setTimeout(() => setSavedDocNames(parsed), 0);
        }
      }
    } catch {
      // ignore
    }
  }, [uploadedDocsStorageKey]);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).map((file) => ({
      name: file.name,
      size: file.size >= 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
        : `${Math.round(file.size / 1024)} KB`,
      file,
    }));
    setSelectedFiles(files);
  }

  function removeFile(index: number) {
    const newFiles = [...selectedFiles];
    newFiles.splice(index, 1);
    setSelectedFiles(newFiles);
    
    if (fileInputRef.current) {
      const dt = new DataTransfer();
      newFiles.forEach((f) => dt.items.add(f.file));
      fileInputRef.current.files = dt.files;
    }
  }

  useEffect(() => {
    if (!confirming) return;
    const stages = [
      "Saving approved business profile & ICP rules…",
      "Activating the updated company profile…",
      "Preparing the Leads workspace…",
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
      const stored = window.sessionStorage.getItem(draftStorageKey);
      if (stored) {
        draft = JSON.parse(stored) as typeof draft;
      }
    } catch {
      window.sessionStorage.removeItem(draftStorageKey);
    }
    const restoreDraft = window.setTimeout(() => {
      if (typeof draft.companyName === "string") setCompanyName(draft.companyName);
      if (typeof draft.companyUrl === "string") setCompanyUrl(draft.companyUrl);
      if (typeof draft.businessDetails === "string") setBusinessDetails(draft.businessDetails);
      if (typeof draft.services === "string") setServices(draft.services);
      setDraftReady(true);
    }, 0);
    return () => window.clearTimeout(restoreDraft);
  }, [draftStorageKey]);

  useEffect(() => {
    if (!draftReady) return;
    window.sessionStorage.setItem(
      draftStorageKey,
      JSON.stringify({ companyName, companyUrl, businessDetails, services }),
    );
  }, [businessDetails, companyName, companyUrl, draftReady, draftStorageKey, services]);

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
      if (selectedFiles.length > 0) {
        try {
          const names = selectedFiles.map((f) => f.name);
          window.localStorage.setItem(uploadedDocsStorageKey, JSON.stringify(names));
          setSavedDocNames(names);
        } catch {
          // ignore
        }
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
            <button className="secondary-button" type="button" onClick={beginEditing}>
              Edit profile
            </button>
            <Link className="primary-button" href="/leads">
              Refresh leads →
            </Link>
          </div>
        </section>
      ) : null}

      <ol className="setup-steps" aria-label="Business setup progress">
        <li className="current"><span>1</span>{active?.is_callable ? "Update business evidence" : "Tell us about your business"}</li>
        <li className={analysis ? "current" : ""}><span>2</span>Review AI understanding</li>
        <li><span>3</span>Choose your workflow</li>
      </ol>

      {isEditing ? <section className="detail-panel setup-intake" id="business-profile-editor">
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
              <span className="upload-zone-title">Active profile evidence &amp; documents</span>
              {hasActiveSources ? (
                <button
                  type="button"
                  className="lead-upload-toggle-btn"
                  onClick={() => setShowUploadZone((prev) => !prev)}
                >
                  {showUploadZone ? "Hide document uploader" : "+ Upload additional document"}
                </button>
              ) : null}
            </div>

            {hasActiveSources ? (
              <div style={{ display: "grid", gap: "10px" }}>
                <div className="upload-active-card">
                  <div className="upload-active-info">
                    <div className="upload-active-badge">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{active?.profile_source_count} evidence source(s) active in your profile</span>
                    </div>
                    <p className="upload-active-desc">
                      Select an option below to edit text, replace an uploaded document, or upload a new file.
                    </p>
                  </div>
                </div>

                <div className="active-sources-list">
                  {activeSources.map((src, idx) => {
                    const isRemoved = removedSources.includes(src.label);
                    return (
                      <div key={idx} className={`source-item-card ${isRemoved ? "is-removed" : ""}`}>
                        <div className="source-item-main">
                          <div className="source-item-icon">
                            {src.kind === "document" ? (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                            ) : src.kind === "website" ? (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="2" y1="12" x2="22" y2="12" />
                                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                              </svg>
                            ) : (
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                                <polyline points="10 9 9 9 8 9" />
                              </svg>
                            )}
                          </div>
                          <div className="source-item-details">
                            <div className="source-item-title-row">
                              <span className="source-item-name">{src.label}</span>
                              <span className="source-item-kind">
                                {isRemoved ? "Removed from draft" : src.kind === "user_input" ? "Text input" : src.kind}
                              </span>
                            </div>
                            <p className="source-item-excerpt">
                              {isRemoved ? "This evidence will not be used in the next analysis." : src.excerpt}
                            </p>
                          </div>
                        </div>
                        <div className="source-item-actions">
                          {isRemoved ? (
                            <button
                              type="button"
                              className="source-action-btn"
                              onClick={() => toggleRemoveSource(src.label)}
                            >
                              Undo remove
                            </button>
                          ) : src.kind === "user_input" ? (
                            <button
                              type="button"
                              className="source-action-btn"
                              onClick={() => focusField("business_details")}
                            >
                              Edit text
                            </button>
                          ) : src.kind === "website" ? (
                            <button
                              type="button"
                              className="source-action-btn"
                              onClick={() => focusField("company_url")}
                            >
                              Edit URL
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="source-action-btn"
                                onClick={triggerFileReplace}
                              >
                                Replace file
                              </button>
                              <button
                                type="button"
                                className="source-action-btn danger"
                                onClick={() => toggleRemoveSource(src.label)}
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {showUploadZone || !hasActiveSources ? (
              <>
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
                      <span className="upload-droparea-title">Choose files or drag &amp; drop</span>
                      <span>TXT, Markdown, HTML, PDF, or DOCX · up to 5 files · 2 MB each</span>
                    </div>
                  </div>
                </label>

                {selectedFiles.length > 0 ? (
                  <div className="upload-selected-files">
                    <span className="upload-files-heading">New files ready for analysis ({selectedFiles.length}):</span>
                    <div className="upload-files-list">
                      {selectedFiles.map((file, idx) => (
                        <div className="upload-file-chip" key={idx} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span className="upload-file-name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "200px" }}>{file.name}</span>
                          <span className="upload-file-size" style={{ color: "var(--muted-2)", fontSize: "12px" }}>({file.size})</span>
                          <button type="button" onClick={() => removeFile(idx)} aria-label={`Remove ${file.name}`} style={{ background: "none", border: "none", padding: "4px", cursor: "pointer", display: "flex", color: "var(--muted)", marginLeft: "auto" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <p className="upload-note">
                  Uploaded documents are parsed and converted into AI evidence facts in your active profile. Browsers do not re-populate raw file inputs after page reload.
                </p>
              </>
            ) : null}
          </div>

          {error ? <p className="form-error wide-field" role="alert">{error}</p> : null}
          <div className="wide-field form-submit-row">
            <p>Your text entries are saved in this browser tab while you review. Website and document content is treated as evidence—not instructions.</p>
            <button className="primary-button" disabled={loading} type="submit">
              {loading ? "Understanding your business…" : "Analyze my business"}
            </button>
          </div>
        </form>
      </section> : null}

      {analysis ? (
        <section className="detail-panel setup-review">
          <div className="section-heading"><div><p className="kicker">Step 2 · Comprehensive review required</p><h2>Detailed company intelligence</h2></div><span className="verified-pill">{analysis.analysis_method === "gemini" ? "Evidence-grounded AI analysis" : "Conservative fallback"}</span></div>
          {analysis.warning ? <p className="setup-warning">{analysis.warning}</p> : null}
          <form
            action={confirmBusinessProfile}
            onSubmit={() => {
              setConfirming(true);
              setConfirmStage("Saving approved profile & ICP rules…");
            }}
            className="knowledge-form"
          >
            <input name="analysis_token" type="hidden" value={analysis.analysis_token} />
            <label>Company name<input name="company_name" required defaultValue={analysis.company_name} /></label>
            <label className="wide-field">Detailed company overview<textarea name="description" required minLength={20} rows={8} defaultValue={analysis.description} /></label>
            <label>Products and services<textarea name="services" required rows={8} defaultValue={lines(analysis.services)} /></label>
            <label>Ideal customers and buyer roles<textarea name="target_customers" required rows={8} defaultValue={lines(analysis.target_customers)} /></label>
            <label>Target geographies<textarea name="geographies" required rows={3} defaultValue={lines(analysis.icp.geographies)} /></label>
            <label>Target industries<textarea name="industries" required rows={3} defaultValue={lines(analysis.icp.industries)} /></label>
            <label className="wide-field">Customer needs we should look for<textarea name="needs" required rows={4} defaultValue={lines(analysis.icp.needs)} /></label>
            <details className="wide-field advanced-review" open>
              <summary>Review extracted company facts, guardrails, and qualification logic</summary>
              <div className="knowledge-form nested-form">
                <label className="wide-field">Comprehensive approved facts — one “label: detail” per line<textarea name="facts" required rows={14} defaultValue={factLines(analysis.facts)} /></label>
                <label>Exclusions<textarea name="exclusions" required rows={4} defaultValue={lines(analysis.exclusions)} /></label>
                <label className="wide-field">Pricing policy<textarea name="pricing_policy" required rows={3} defaultValue={analysis.pricing_policy} /></label>
                <label>Qualification questions<textarea name="qualification_questions" required rows={5} defaultValue={lines(analysis.qualification_questions)} /></label>
                <label>Human-handoff rules<textarea name="handoff_conditions" required rows={5} defaultValue={lines(analysis.handoff_conditions)} /></label>
              </div>
            </details>
            <div className="wide-field evidence-box"><span>Sources used ({analysis.sources.length})</span>{analysis.sources.map((source) => <p key={`${source.kind}-${source.content_hash}`}>{source.kind}: {source.label}</p>)}</div>
            <fieldset className="wide-field workflow-choice">
              <legend>Step 3 · What do you want to do first?</legend>
              <label><input name="workflow_mode" type="radio" value="leads_and_calling" defaultChecked /><span><span className="workflow-title">Find leads and call</span><small>Discover matching opportunities, review them, then start a campaign.</small></span></label>
              <label><input name="workflow_mode" type="radio" value="calling_only" /><span><span className="workflow-title">Call my own leads</span><small>Upload your consenting lead list and create a calling campaign.</small></span></label>
            </fieldset>
            <label className="wide-field confirmation-check"><input name="confirmed" type="checkbox" required />I reviewed this profile and approve it for lead matching and AI call preparation.</label>
            <div className="wide-field form-submit-row">
              <p>
                {active?.is_callable
                  ? "This updates the company profile used for future lead matching and calls."
                  : "This saves the company profile used for future lead matching and calls."}
              </p>
              <button className="primary-button" disabled={confirming} type="submit">
                {confirming
                  ? "Saving profile…"
                  : active?.is_callable
                    ? "Update profile"
                    : "Save profile and continue"}
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
            <span className="discovery-eyebrow">Business profile</span>
            <h3 className="discovery-title">Saving your company profile</h3>
            <p className="discovery-stage-text">{confirmStage}</p>
            <div className="discovery-progress-bar">
              <div className="discovery-progress-indicator" />
            </div>
            <div className="discovery-badges">
              <span className="source-pill active">
                <span className="pill-dot" />
                Approved profile
              </span>
              <span className="source-pill">ICP rules</span>
              <span className="source-pill">Sales guardrails</span>
            </div>
            <p className="discovery-subtext">
              Your Leads workspace will open next. Use its Refresh leads button whenever you want to run Exa discovery with this profile.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
