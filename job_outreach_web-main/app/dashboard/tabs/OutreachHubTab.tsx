'use client';
import toast from 'react-hot-toast';
import { useState } from 'react';
import { useDashboard } from '../DashboardContext';

export default function OutreachHubTab() {
  const ctx = useDashboard();
  const {
    user, emailHistory, bccHistory, scannedReplies, getDynamicChartData,
    activeTab, setActiveTab, outreachTab, setOutreachTab,
    company, setCompany, jobTitle, setJobTitle, jobType, setJobType,
    experienceLevel, setExperienceLevel, toneStyle, setToneStyle,
    jobDescription, setJobDescription, jobPostUrl, setJobPostUrl,
    recruiterName, setRecruiterName, recruiterEmail, setRecruiterEmail,
    aiModel, setAiModel, isGenerating, subject, setSubject, draft, setDraft,
    showPreview, setShowPreview, resumeText, setResumeText, resumeBase64,
    isUploadingResume, signature, setSignature, setEmailHistory, setBccHistory,
    bccEmails, setBccEmails, bccJobTitle, setBccJobTitle,
    bccSubject, setBccSubject, bccDraft, setBccDraft,
    isGeneratingBcc, isSendingBcc, isSending,
    csvData, setCsvData, csvMode, setCsvMode,
    csvJobTitle, setCsvJobTitle, csvSubject, setCsvSubject,
    csvDraft, setCsvDraft, isGeneratingCsv, isSendingCsv,
    csvStatuses, setCsvStatuses, selectedCsvIndex, setSelectedCsvIndex,
    previewSubject, setPreviewSubject, previewBody, setPreviewBody,
    isGeneratingSingleDraft, isPreGeneratingAll,
    autoTargetTitle, setAutoTargetTitle, autoLeads, setAutoLeads,
    selectedLeads, setSelectedLeads, isFetchingLeads,
    isScanning, scanFilter, setScanFilter, scanDays, setScanDays,
    expandedSummary, setExpandedSummary,
    isProfileModalOpen, setIsProfileModalOpen,
    profileFullName, setProfileFullName, profilePhone, setProfilePhone,
    profileLinkedin, setProfileLinkedin, profileGithub, setProfileGithub,
    profilePortfolio, setProfilePortfolio, profileCurrentTitle, setProfileCurrentTitle,
    profileExperienceLevel, setProfileExperienceLevel,
    profileToneStyle, setProfileToneStyle, profileJobType, setProfileJobType,
    isSavingProfile, theme, defaultAiModel, setDefaultAiModel,
    dailyLimit, setDailyLimit,
    handleGenerate, handleSendEmail, handleResumeUpload,
    handleBccGenerate, handleBccSend,
    handleCsvUpload, handleCsvGenerate, handleTransferToBcc,
    handleCsvStartSending, handleSendOnlyApprovedCsv,
    handleReviewClick, saveAndApproveDraft, retryGenerateRow,
    quickApproveRow, approveAllCsvDrafts, preGenerateAllCsvDrafts,
    handleInlineSend, regenerateSingleAiDraft, handleScanReplies,
    handleFetchLeads, handleTransferAutoToCsv, handleTransferAutoToBcc,
    handleSaveProfile, handleThemeChange, handleSaveSettings,
    getValidProviderToken, setResumeBase64, isSidebarCollapsed,
    router, handleSignOut, sendCsvRow, csvCampaignHistory,
    credits, setShowBuyCreditsModal
  } = ctx;

  // Pagination state
  const ITEMS_PER_PAGE = 10;
  const [singlePage, setSinglePage] = useState(1);
  const [bccPage, setBccPage] = useState(1);
  const [csvPage, setCsvPage] = useState(1);

  return (
<div className="max-w-6xl mx-auto px-container-padding-mobile lg:px-container-padding-desktop pt-stack-lg space-y-stack-lg">
  <header className="mb-stack-lg text-center flex flex-col items-center">
    <h2 className="text-lg md:text-xl font-semibold tracking-tight text-on-surface flex items-center justify-center gap-3">
      <span className="material-symbols-outlined text-[32px] md:text-[38px] text-primary">send</span>
      <span>Outreach Hub</span>
    </h2>
    <p className="text-[13px] text-on-surface-variant mt-1">Automate and personalize your job hunt communication.</p>
  </header>

  <div className="bg-surface-container-low p-1.5 rounded-2xl flex flex-col md:flex-row items-center border border-outline-variant/60 gap-1.5 card-elevated max-w-2xl mx-auto mb-6">
    <button
      className={`flex-1 w-full py-2.5 px-4 text-[11px] font-semibold rounded-xl shadow-sm transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 ${outreachTab === 'single' ? 'bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container font-bold shadow-md shadow-primary/20' : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'}`}
      onClick={() => setOutreachTab('single')}
    >
      <span className="material-symbols-outlined text-[18px]">work</span>
      Single Job
    </button>
    <button
      className={`flex-1 w-full py-2.5 px-4 text-[11px] font-semibold rounded-xl shadow-sm transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 ${outreachTab === 'bulk' ? 'bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container font-bold shadow-md shadow-primary/20' : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'}`}
      onClick={() => setOutreachTab('bulk')}
    >
      <span className="material-symbols-outlined text-[18px]">group</span>
      Bulk BCC
    </button>
    <button
      className={`flex-1 w-full py-2.5 px-4 text-[11px] font-semibold rounded-xl shadow-sm transition-all duration-200 flex items-center justify-center gap-2 active:scale-95 ${outreachTab === 'csv' ? 'bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container font-bold shadow-md shadow-primary/20' : 'text-on-surface-variant hover:bg-surface-container-highest hover:text-on-surface'}`}
      onClick={() => setOutreachTab('csv')}
    >
      <span className="material-symbols-outlined text-[18px]">upload_file</span>
      Import CSV
    </button>
  </div>

  {outreachTab === 'single' && (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <section className="bg-surface-container border border-outline-variant rounded-xl p-stack-md card-elevated">
        <div className="space-y-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-on-surface-variant ml-1 flex items-center justify-between">
              <span>Company</span>
              <span className="text-[9px] font-bold text-primary border border-primary/20 bg-primary/5 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Required</span>
            </label>
            <div className="relative group rounded-lg bg-surface-container-lowest border border-outline-variant focus-within:border-primary focus-within:shadow-[0_0_0_3px_rgba(var(--primary-rgb),0.12)] transition-all duration-200">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-[20px]">
                business
              </span>
              <input
                className="w-full bg-transparent border-none py-3.5 pl-10 pr-4 text-[13px] text-on-surface focus:ring-0 outline-none placeholder:text-outline"
                placeholder="e.g. Anthropic"
                type="text"
                value={company}
                onChange={e => setCompany(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-on-surface-variant ml-1 flex items-center justify-between">
              <span>Job Title</span>
              <span className="text-[9px] font-bold text-primary border border-primary/20 bg-primary/5 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Required</span>
            </label>
            <div className="relative group rounded-lg bg-surface-container-lowest border border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all duration-200">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-[20px]">
                badge
              </span>
              <input
                className="w-full bg-transparent border-none py-3.5 pl-10 pr-4 text-[13px] text-on-surface focus:ring-0 outline-none placeholder:text-outline"
                placeholder="e.g. Senior UI/UX Designer"
                type="text"
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-on-surface-variant ml-1 flex items-center justify-between">
              <span>Recruiter Name</span>
              <span className="text-[9px] font-bold text-on-surface-variant border border-on-surface-variant/20 bg-on-surface-variant/5 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Optional</span>
            </label>
            <div className="relative group rounded-lg bg-surface-container-lowest border border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all duration-200">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-[20px]">
                person
              </span>
              <input
                className="w-full bg-transparent border-none py-3.5 pl-10 pr-4 text-[13px] text-on-surface focus:ring-0 outline-none placeholder:text-outline"
                placeholder="e.g. Sarah Mitchell"
                type="text"
                value={recruiterName}
                onChange={e => setRecruiterName(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-on-surface-variant ml-1 flex items-center justify-between">
              <span>Recruiter Email</span>
              <span className="text-[9px] font-bold text-primary border border-primary/20 bg-primary/5 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Required</span>
            </label>
            <div className="relative group rounded-lg bg-surface-container-lowest border border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all duration-200">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-[20px]">
                alternate_email
              </span>
              <input
                className="w-full bg-transparent border-none py-3.5 pl-10 pr-4 text-[13px] text-on-surface focus:ring-0 outline-none placeholder:text-outline"
                placeholder="e.g. sarah@company.com"
                type="email"
                value={recruiterEmail}
                onChange={e => setRecruiterEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-on-surface-variant ml-1 flex items-center justify-between">
              <span>Job Post URL</span>
              <span className="text-[9px] font-bold text-on-surface-variant border border-on-surface-variant/20 bg-on-surface-variant/5 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Optional</span>
            </label>
            <div className="relative group rounded-lg bg-surface-container-lowest border border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all duration-200">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-[20px]">
                link
              </span>
              <input
                className="w-full bg-transparent border-none py-3.5 pl-10 pr-4 text-[13px] text-on-surface focus:ring-0 outline-none placeholder:text-outline"
                placeholder="e.g. https://linkedin.com/jobs/..."
                type="url"
                value={jobPostUrl}
                onChange={e => setJobPostUrl(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-on-surface-variant ml-1 flex items-center justify-between">
              <span>Job Description</span>
              <span className="text-[9px] font-bold text-on-surface-variant border border-on-surface-variant/20 bg-on-surface-variant/5 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Optional</span>
            </label>
            <div className="relative group rounded-lg bg-surface-container-lowest border border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all duration-200">
              <span className="material-symbols-outlined absolute left-3 top-4 text-on-surface-variant group-focus-within:text-primary transition-colors text-[20px]">
                description
              </span>
              <textarea
                className="w-full bg-transparent border-none pt-3.5 pb-2 pl-10 pr-4 text-[13px] text-on-surface focus:ring-0 outline-none placeholder:text-outline"
                placeholder="Paste key responsibilities or requirements..."
                rows={3}
                value={jobDescription}
                onChange={e => setJobDescription(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-on-surface-variant ml-1 flex items-center justify-between">
              <span>Job Type</span>
              <span className="text-[9px] font-bold text-primary border border-primary/20 bg-primary/5 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Required</span>
            </label>
            <div className="relative group rounded-lg bg-surface-container-lowest border border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all duration-200">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-[20px]">
                work_outline
              </span>
              <select
                className="w-full appearance-none bg-transparent border-none py-3.5 pl-10 pr-10 text-[13px] text-on-surface focus:ring-0 outline-none cursor-pointer"
                value={jobType}
                onChange={e => setJobType(e.target.value)}
              >
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
                <option value="Internship">Internship</option>
                <option value="Freelance">Freelance</option>
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none group-focus-within:text-primary transition-colors">
                expand_more
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-on-surface-variant ml-1 flex items-center justify-between">
              <span>Experience Level</span>
              <span className="text-[9px] font-bold text-on-surface-variant border border-on-surface-variant/20 bg-on-surface-variant/5 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Optional</span>
            </label>
            <div className="relative group rounded-lg bg-surface-container-lowest border border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all duration-200">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-[20px]">
                workspace_premium
              </span>
              <select
                className="w-full appearance-none bg-transparent border-none py-3.5 pl-10 pr-10 text-[13px] text-on-surface focus:ring-0 outline-none cursor-pointer"
                value={experienceLevel}
                onChange={e => setExperienceLevel(e.target.value)}
              >
                <option value="Not specified">Not specified (Infer from Resume)</option>
                <option value="Senior">Senior</option>
                <option value="Mid-Level">Mid-Level</option>
                <option value="Junior">Junior</option>
                <option value="Fresher">Fresher</option>
                <option value="Lead">Lead</option>
                <option value="Executive">Executive</option>
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none group-focus-within:text-primary transition-colors">
                expand_more
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-on-surface-variant ml-1 flex items-center justify-between">
              <span>Email Tone & Style</span>
              <span className="text-[9px] font-bold text-primary border border-primary/20 bg-primary/5 px-1.5 py-0.5 rounded-full uppercase tracking-wider">Required</span>
            </label>
            <div className="relative group rounded-lg bg-surface-container-lowest border border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all duration-200">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-[20px]">
                tune
              </span>
              <select
                className="w-full appearance-none bg-transparent border-none py-3.5 pl-10 pr-10 text-[13px] text-on-surface focus:ring-0 outline-none cursor-pointer"
                value={toneStyle}
                onChange={e => setToneStyle(e.target.value)}
              >
                <option value="Direct & Execution-focused">Direct & Execution-focused (Standard)</option>
                <option value="Warm & Conversational">Warm & Conversational</option>
                <option value="Creative & Bold">Creative & Bold</option>
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none group-focus-within:text-primary transition-colors">
                expand_more
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-on-surface-variant ml-1">AI Model</label>
            <div className="relative group rounded-lg bg-surface-container-lowest border border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all duration-200">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-[20px]">
                smart_toy
              </span>
              <select
                className="w-full appearance-none bg-transparent border-none py-3.5 pl-10 pr-10 text-[13px] text-on-surface focus:ring-0 outline-none cursor-pointer"
                value={aiModel}
                onChange={e => setAiModel(e.target.value)}
              >
                <option value="gemini">Google Gemini 2.5 Flash</option>
                <option value="claude">Anthropic Claude 3.5 Sonnet</option>
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none group-focus-within:text-primary transition-colors">
                expand_more
              </span>
            </div>
          </div>
          <button
            className="bg-gradient-to-r from-primary-container to-secondary-container w-full py-4 rounded-xl font-headline-md text-[13px] font-bold text-on-primary-container mt-4 active:scale-[0.98] hover:opacity-95 transition-all flex items-center justify-center gap-2"
            onClick={handleGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? (
              <>
                <div className="spinner shrink-0" style={{ width: '18px', height: '18px', borderColor: 'currentColor', borderRightColor: 'transparent' }}></div>
                <span>Generating tailored draft...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined animate-pulse">auto_awesome</span>
                <span>Generate Personalized Draft</span>
                <span className="text-[9px] font-bold bg-amber-500/15 text-amber-500 px-1.5 py-0.5 rounded-full border border-amber-500/20">⚡ 1 Credit</span>
              </>
            )}
          </button>
        </div>
      </section>

      <section className="bg-surface-container border border-outline-variant rounded-xl p-stack-md glass-card flex flex-col gap-4">
        <div className="relative group rounded-lg bg-surface-container-lowest border border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all duration-200">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-[20px]">
            title
          </span>
          <input
            type="text"
            className="w-full bg-transparent border-none py-3.5 pl-10 pr-4 text-on-surface font-bold focus:ring-0 outline-none"
            placeholder="Subject Line"
            value={subject}
            onChange={e => setSubject(e.target.value)}
          />
        </div>

        <div className="flex flex-col flex-1 mt-1">
          {/* AI Composer Header Toolbar */}
          <div className="bg-surface-container-low border border-outline-variant/60 rounded-t-lg px-3 py-2 flex items-center justify-between gap-2 border-b-0">
            <div className="flex items-center gap-1.5 text-on-surface-variant">
              <span className="material-symbols-outlined text-[18px]">edit_note</span>
              <span className="text-[11px] font-semibold">AI Draft Composer</span>
            </div>
            <div className="flex items-center gap-2">
              {draft && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(draft);
                    toast.success("Copied to clipboard!");
                  }}
                  className="p-1.5 rounded hover:bg-surface-container-highest text-primary hover:text-secondary transition-all flex items-center justify-center"
                  title="Copy to clipboard"
                >
                  <span className="material-symbols-outlined text-[16px]">content_copy</span>
                </button>
              )}
              <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 font-mono">
                {draft ? draft.split(/\s+/).filter(Boolean).length : 0} words
              </span>
            </div>
          </div>

          <textarea
            className="bg-surface-dim border border-outline-variant rounded-b-lg rounded-t-none p-3 text-on-surface flex-1 min-h-[320px] outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-sans text-[13px] border-t-0"
            placeholder="Your generated email draft will appear here..."
            value={draft}
            onChange={e => setDraft(e.target.value)}
          />
        </div>

        <div className="flex gap-3 mt-2">
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="flex-1 bg-surface-dim border border-outline-variant text-on-surface hover:bg-surface-container-highest/50 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-[18px]">visibility</span> Preview Draft
          </button>
          <button
            type="button"
            className="flex-1 bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity active:scale-[0.98]"
            onClick={handleSendEmail}
            disabled={isSending}
          >
            <span className="material-symbols-outlined text-[18px]">send</span> {isSending ? "Sending..." : "Send Email"}
          </button>
        </div>
      </section>
    </div>
  )}

  {outreachTab === 'bulk' && (
    <div className="bg-surface-container border border-outline-variant rounded-xl p-stack-md glass-card flex flex-col gap-4">
      <h3 className="text-[15px] font-semibold tracking-tight text-on-surface">Bulk BCC Outreach</h3>

      <div className="flex flex-col gap-1.5">
        <label className="text-on-surface-variant text-[11px] font-semibold ml-1">BCC Email Addresses (comma separated)</label>
        <div className="relative group rounded-lg bg-surface-container-lowest border border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all duration-200">
          <span className="material-symbols-outlined absolute left-3 top-4 text-on-surface-variant group-focus-within:text-primary transition-colors text-[20px]">
            groups
          </span>
          <textarea
            className="w-full bg-transparent border-none pt-3.5 pb-2 pl-10 pr-4 text-[13px] text-on-surface focus:ring-0 outline-none placeholder:text-outline"
            rows={3}
            placeholder="e.g. recruiter1@comp.com, recruiter2@comp.com"
            value={bccEmails}
            onChange={e => setBccEmails(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-on-surface-variant text-[11px] font-semibold ml-1">Target Job Title</label>
        <div className="relative group rounded-lg bg-surface-container-lowest border border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all duration-200">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-[20px]">
            work
          </span>
          <input
            type="text"
            className="w-full bg-transparent border-none py-3.5 pl-10 pr-4 text-[13px] text-on-surface focus:ring-0 outline-none placeholder:text-outline"
            placeholder="e.g. Senior Frontend Engineer"
            value={bccJobTitle}
            onChange={e => setBccJobTitle(e.target.value)}
          />
        </div>
      </div>

      <button
        className="bg-gradient-to-r from-primary-container to-secondary-container w-full py-4 rounded-xl font-headline-md text-[13px] font-bold text-on-primary-container mt-4 active:scale-[0.98] hover:opacity-95 transition-all flex items-center justify-center gap-2"
        onClick={handleBccGenerate}
        disabled={isGeneratingBcc}
      >
        {isGeneratingBcc ? (
          <>
            <div className="spinner shrink-0" style={{ width: '18px', height: '18px', borderColor: 'currentColor', borderRightColor: 'transparent' }}></div>
            <span>Generating universal draft...</span>
          </>
        ) : (
          <>
            <span className="material-symbols-outlined animate-pulse">auto_awesome</span>
            <span>Generate Universal Draft</span>
            <span className="text-[9px] font-bold bg-amber-500/15 text-amber-500 px-1.5 py-0.5 rounded-full border border-amber-500/20">⚡ 1 Credit</span>
          </>
        )}
      </button>

      {bccDraft && (
        <>
          <div className="relative group rounded-lg bg-surface-container-lowest border border-outline-variant focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all duration-200 mt-4">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors text-[20px]">
              title
            </span>
            <input
              type="text"
              className="w-full bg-transparent border-none py-3.5 pl-10 pr-4 text-on-surface font-bold focus:ring-0 outline-none"
              value={bccSubject}
              onChange={e => setBccSubject(e.target.value)}
              placeholder="Subject Line"
            />
          </div>

          <div className="flex flex-col flex-1 mt-2">
            {/* AI Composer Header Toolbar */}
            <div className="bg-surface-container-low border border-outline-variant/60 rounded-t-lg px-3 py-2 flex items-center justify-between gap-2 border-b-0">
              <div className="flex items-center gap-1.5 text-on-surface-variant">
                <span className="material-symbols-outlined text-[18px]">edit_note</span>
                <span className="text-[11px] font-semibold">AI Draft Composer (Bulk)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(bccDraft);
                    toast.success("Copied to clipboard!");
                  }}
                  className="p-1.5 rounded hover:bg-surface-container-highest text-primary hover:text-secondary transition-all flex items-center justify-center"
                  title="Copy to clipboard"
                >
                  <span className="material-symbols-outlined text-[16px]">content_copy</span>
                </button>
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 font-mono">
                  {bccDraft.split(/\s+/).filter(Boolean).length} words
                </span>
              </div>
            </div>

            <textarea
              className="bg-surface-dim border border-outline-variant rounded-b-lg rounded-t-none p-3 text-on-surface min-h-[300px] outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-sans text-[13px] border-t-0"
              placeholder="Your generated bulk email draft will appear here..."
              value={bccDraft}
              onChange={e => setBccDraft(e.target.value)}
            />
          </div>

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="flex-1 bg-surface-dim border border-outline-variant text-on-surface hover:bg-surface-container-highest/50 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
            >
              <span className="material-symbols-outlined text-[18px]">visibility</span> Preview Draft
            </button>
            <button
              type="button"
              className="flex-1 bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity active:scale-[0.98]"
              onClick={handleBccSend}
              disabled={isSendingBcc}
            >
              <span className="material-symbols-outlined text-[18px]">send</span> {isSendingBcc ? "Sending..." : "Send via BCC"}
            </button>
          </div>
        </>
      )}
    </div>
  )}

  {outreachTab === 'csv' && (
    <div className="bg-surface-container border border-outline-variant rounded-xl p-stack-md glass-card flex flex-col gap-4">
      <h3 className="text-[15px] font-semibold tracking-tight text-on-surface">Import CSV / External Database</h3>
      <p className="text-[12px] text-on-surface-variant -mt-2">Upload a CSV or text file to automatically extract emails for your campaigns.</p>

      {csvMode === 'idle' && (
        <div className="border-2 border-dashed border-outline-variant rounded-xl p-12 flex flex-col items-center justify-center gap-4 text-on-surface-variant cursor-pointer relative hover:bg-surface-container-highest/20 transition-colors">
          <span className="material-symbols-outlined text-4xl">upload_file</span>
          <p>Upload a CSV file (Name, Email, Company, Title)</p>
          <input type="file" accept=".csv" onChange={handleCsvUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
        </div>
      )}

      {csvMode === 'select' && csvData.length > 0 && (
        <div className="flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-emerald-500/10 p-5 rounded-2xl flex justify-between items-center border border-emerald-500/20 shadow-md">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-400 text-2xl">check_circle</span>
                <span className="text-emerald-400 text-[15px] font-semibold tracking-tight">Found {csvData.length} Leads</span>
              </div>
              <p className="text-on-surface-variant text-sm">How would you like to send your applications to these leads?</p>
            </div>
            <button
              className="px-5 py-2.5 bg-surface-dim hover:bg-surface-container-highest border border-outline-variant rounded-xl text-on-surface font-bold text-sm transition-all active:scale-95"
              onClick={() => { setCsvMode('idle'); setCsvData([]); }}
            >
              Clear
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
            {/* Option 1: Send via Bulk BCC */}
            <div
              onClick={handleTransferToBcc}
              className="group flex flex-col items-center justify-center p-8 rounded-2xl border border-outline-variant bg-surface-container-low hover:bg-surface-container-highest/40 hover:border-primary/50 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 shadow-sm text-center"
            >
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <span className="material-symbols-outlined text-primary text-3xl">mail</span>
              </div>
              <h4 className="text-[15px] font-semibold tracking-tight text-on-surface mb-2 group-hover:text-primary transition-colors">Send via Bulk BCC</h4>
              <p className="text-on-surface-variant text-sm max-w-[280px]">Fastest. Sends a single email with everyone in BCC.</p>
            </div>

            {/* Option 2: Send Personally (Auto-Loop) */}
            <div
              onClick={() => setCsvMode('individual')}
              className="group flex flex-col items-center justify-center p-8 rounded-2xl border border-outline-variant bg-surface-container-low hover:bg-surface-container-highest/40 hover:border-secondary/50 cursor-pointer transition-all duration-300 transform hover:-translate-y-1 shadow-sm text-center"
            >
              <div className="w-16 h-16 rounded-full bg-secondary-container/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                <span className="material-symbols-outlined text-secondary text-3xl">track_changes</span>
              </div>
              <h4 className="text-[15px] font-semibold tracking-tight text-on-surface mb-2 group-hover:text-secondary transition-colors">Send Personally (Auto-Loop)</h4>
              <p className="text-on-surface-variant text-sm max-w-[280px]">Sends individual emails 1-by-1. Looks more professional.</p>
            </div>
          </div>
        </div>
      )}

      {csvMode === 'individual' && csvData.length > 0 && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-300">
          <div className="flex justify-between items-center">
            <h3 className="text-[15px] font-semibold tracking-tight text-on-surface">Individual Auto-Loop</h3>
            <button
              onClick={() => { setCsvMode('select'); setCsvDraft(''); }}
              className="px-4 py-2 border border-outline-variant rounded-xl text-on-surface hover:bg-surface-container-highest font-bold text-xs transition-all active:scale-95 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              Back to Options
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            {csvData.some(r => !r.company || !r.title) && (
              <div className="flex flex-col gap-1.5 animate-in fade-in duration-200">
                <label className="text-[11px] font-semibold text-on-surface-variant ml-1">Job Title Targeting</label>
                <input
                  type="text"
                  className="bg-surface-dim border border-outline-variant rounded-lg px-4 py-3 text-[13px] focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-outline"
                  placeholder="e.g. Software Engineer"
                  value={csvJobTitle}
                  onChange={e => setCsvJobTitle(e.target.value)}
                />
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold text-on-surface-variant ml-1">AI Model</label>
              <div className="relative">
                <select
                  className="w-full appearance-none bg-surface-dim border border-outline-variant rounded-lg px-4 py-3 text-[13px] focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all pr-10"
                  value={aiModel}
                  onChange={e => setAiModel(e.target.value)}
                >
                  <option value="gemini">Google Gemini 2.5 Flash</option>
                  <option value="claude">Anthropic Claude 3.5 Sonnet</option>
                </select>
                <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">expand_more</span>
              </div>
            </div>
          </div>

          {csvData.some(r => !r.company || !r.title) && (
            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 p-4 rounded-xl flex items-start gap-3 shadow-sm animate-in fade-in duration-200">
              <span className="material-symbols-outlined text-amber-400 mt-0.5">warning</span>
              <div className="flex-1 text-sm font-medium">
                Some leads are missing a Job Role or Company Name. Please generate a common draft as a fallback for these rows.
              </div>
            </div>
          )}

          <div className="bg-surface-container-low border border-outline-variant p-4 rounded-xl flex flex-col gap-3">
            <span className="text-[11px] font-semibold text-primary font-bold tracking-wider uppercase">Email Automation Control Deck</span>

            <div className="flex flex-col sm:flex-row gap-3">
              {csvData.some(r => !r.company || !r.title) && (
                <button
                  className="flex-1 bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container py-3 px-4 rounded-lg font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-95 transition-all text-xs"
                  onClick={handleCsvGenerate}
                  disabled={isGeneratingCsv}
                >
                  {isGeneratingCsv ? (
                    <>
                      <div className="spinner animate-spin rounded-full h-3.5 w-3.5 border-2 border-surface border-t-transparent mr-2"></div>
                      Generating Fallback...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-pulse">auto_awesome</span>
                      Generate Fallback Draft
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                className="flex-1 bg-primary/20 text-primary border border-primary/30 py-3 px-4 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-primary/30 active:scale-95 transition-all text-xs"
                onClick={preGenerateAllCsvDrafts}
                disabled={isPreGeneratingAll}
              >
                {isPreGeneratingAll ? (
                  <>
                    <div className="spinner animate-spin rounded-full h-3.5 w-3.5 border-2 border-current border-t-transparent mr-2"></div>
                    Generating AI Drafts...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                    Start Generate Drafts
                  </>
                )}
              </button>

              <button
                type="button"
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-3 px-4 rounded-lg font-extrabold flex items-center justify-center gap-2 active:scale-95 transition-all text-xs shadow-md"
                onClick={approveAllCsvDrafts}
                disabled={isPreGeneratingAll}
              >
                <span className="material-symbols-outlined text-[16px]">done_all</span>
                Approve All Drafts
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 border-t border-outline-variant/30 pt-3">
              <button
                type="button"
                className="flex-1 bg-surface-dim hover:bg-surface-container-highest border border-outline-variant text-on-surface py-3.5 px-6 rounded-lg font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-sm"
                onClick={handleSendOnlyApprovedCsv}
                disabled={isSendingCsv}
              >
                <span className="material-symbols-outlined text-[18px]">verified</span>
                Bulk Send Approved Emails ({csvStatuses.filter(s => s.status === 'approved').length})
              </button>

              <button
                type="button"
                className="flex-1 bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container hover:opacity-90 py-3.5 px-6 rounded-lg font-extrabold flex items-center justify-center gap-2 transition-all active:scale-[0.98] text-sm shadow-md shadow-primary/20"
                onClick={handleCsvStartSending}
                disabled={isSendingCsv}
              >
                <span className="material-symbols-outlined text-[18px]">bolt</span>
                Auto-Generate & Send All Remaining ({csvStatuses.filter(s => s.status !== 'success').length} left)
              </button>
            </div>
          </div>

          {csvDraft && (
            <div className="flex flex-col gap-4 border-t border-outline-variant/30 pt-6 animate-in fade-in duration-300">
              <div className="flex flex-col gap-1.5">
                <label className="text-on-surface-variant text-[11px] font-semibold ml-1">Subject Line</label>
                <input
                  type="text"
                  className="bg-surface-dim border border-outline-variant rounded-lg p-3.5 text-on-surface font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
                  value={csvSubject}
                  onChange={e => setCsvSubject(e.target.value)}
                  placeholder="Subject Line"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center px-1">
                  <label className="text-on-surface-variant text-[11px] font-semibold">CSV Base Email Draft Editor</label>
                  <span className="text-xs text-primary bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20 font-mono">
                    {csvDraft.split(/\s+/).filter(Boolean).length} words
                  </span>
                </div>
                <textarea
                  className="bg-surface-dim border border-outline-variant rounded-lg p-3.5 text-on-surface min-h-[300px] outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-sans text-[13px]"
                  value={csvDraft}
                  onChange={e => setCsvDraft(e.target.value)}
                  placeholder="Your base email draft will appear here..."
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowPreview(true)}
                  className="flex-1 bg-surface-dim border border-outline-variant text-on-surface hover:bg-surface-container-highest/50 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                >
                  <span className="material-symbols-outlined text-[18px]">visibility</span> Preview Draft
                </button>
              </div>
            </div>
          )}

          {/* Email Queue Table */}
          <div className="mt-4 flex flex-col gap-4 border-t border-outline-variant/30 pt-6">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">format_list_bulleted</span>
              <span className="text-[15px] font-semibold tracking-tight text-on-surface">
                Email Queue ({csvStatuses.filter(s => s.status === 'success' || s.status === 'sent').length}/{csvData.length})
              </span>
            </div>

            <div className="bg-surface-container-low border border-outline-variant rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto" style={{ maxHeight: '400px' }}>
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="sticky top-0 bg-surface-container-high/90 backdrop-blur-sm border-b border-outline-variant z-10">
                    <tr>
                      <th className="p-4 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">Name</th>
                      <th className="p-4 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">Company</th>
                      <th className="p-4 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider">Role</th>
                      <th className="p-4 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider font-semibold">Email Address</th>
                      <th className="p-4 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider font-semibold">Status</th>
                      <th className="p-4 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/30">
                    {csvData.map((row, i) => {
                      const statusRow = csvStatuses.find(s => s.email === row.email);
                      const status = statusRow ? statusRow.status : 'pending';
                      return (
                        <tr key={i} className="hover:bg-surface-container-highest/30 transition-colors">
                          <td className="p-4 text-[13px] text-on-surface font-semibold">{row.name || 'N/A'}</td>
                          <td className="p-4 text-on-surface-variant font-body-sm">{row.company || '-'}</td>
                          <td className="p-4">
                            <span className="px-2 py-1 rounded bg-primary/10 text-primary text-[11px] font-semibold text-[11px] font-bold">
                              {row.title || 'N/A'}
                            </span>
                          </td>
                          <td className="p-4 text-on-surface-variant font-body-sm">{row.email}</td>
                          <td className="p-4">
                            {status === 'pending' && (
                              <span className="inline-flex items-center gap-1 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider">
                                PENDING
                              </span>
                            )}
                            {status === 'generating' && (
                              <span className="inline-flex items-center gap-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider animate-pulse">
                                GENERATING
                              </span>
                            )}
                            {status === 'draft_ready' && (
                              <span className="inline-flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider">
                                DRAFT READY
                              </span>
                            )}
                            {status === 'approved' && (
                              <span className="inline-flex items-center gap-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider">
                                APPROVED
                              </span>
                            )}
                            {status === 'sending' && (
                              <span className="inline-flex items-center gap-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider animate-pulse">
                                SENDING
                              </span>
                            )}
                            {(status === 'success' || status === 'sent') && (
                              <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider">
                                SUCCESS
                              </span>
                            )}
                            {status === 'error' && (
                              <span className="inline-flex items-center gap-1 bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono tracking-wider">
                                ERROR
                              </span>
                            )}
                          </td>
                          <td className="p-4">
                            {status === 'success' || status === 'sent' ? (
                              <span className="text-emerald-400 text-xs font-bold flex items-center gap-1">
                                <span className="material-symbols-outlined text-[16px]">done</span> Sent
                              </span>
                            ) : (
                              <div className="flex items-center gap-2">
                                {status === 'error' ? (
                                  <button
                                    onClick={() => retryGenerateRow(i)}
                                    className="px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs font-bold transition-all flex items-center gap-1 shadow-sm active:scale-95 border border-red-500/30"
                                    title="Retry AI Generation"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">refresh</span>
                                    Retry
                                  </button>
                                ) : (
                                  <>
                                    {(status === 'idle' || status === 'draft_ready') && (
                                      <button
                                        onClick={() => handleReviewClick(i)}
                                        className="px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded text-xs font-bold transition-all flex items-center gap-1"
                                        title="Review and Edit AI Email Draft"
                                      >
                                        <span className="material-symbols-outlined text-[14px]">edit_note</span>
                                        Review
                                      </button>
                                    )}

                                    {status === 'draft_ready' && (
                                      <button
                                        onClick={() => quickApproveRow(i)}
                                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-bold transition-all flex items-center gap-1 shadow-sm active:scale-95"
                                        title="Approve directly"
                                      >
                                        <span className="material-symbols-outlined text-[14px]">check</span>
                                        Approve
                                      </button>
                                    )}

                                    <button
                                      onClick={() => handleInlineSend(i)}
                                      disabled={status === 'generating' || status === 'sending'}
                                      className="px-2.5 py-1 bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container hover:opacity-90 rounded text-xs font-bold transition-all flex items-center gap-1 active:scale-95 shadow-sm disabled:opacity-50"
                                      title="Send now"
                                    >
                                      <span className="material-symbols-outlined text-[14px]">
                                        {status === 'sending' ? 'hourglass_empty' : 'send'}
                                      </span>
                                      {status === 'sending' ? 'Sending...' : 'Send'}
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )}

  {/* SINGLE JOB HISTORY */}
  {outreachTab === 'single' && (() => {
    const singleEmails = emailHistory.filter(h => !h.company?.includes('(CSV)'));
    const singleVisible = singleEmails.slice(0, singlePage * ITEMS_PER_PAGE);
    const singleHasMore = singleVisible.length < singleEmails.length;
    return (
    <section>
      <div className="flex items-center justify-between mb-4 mt-8">
        <h3 className="font-headline-md text-body-lg font-bold text-on-surface">Single Email History</h3>
        <span className="text-[11px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
          {singleEmails.length} Sent
        </span>
      </div>
      <div className="space-y-3">
        {singleEmails.length === 0 && (
          <div className="bg-surface-container border border-outline-variant glass-card rounded-lg p-8 text-center text-on-surface-variant">
            <span className="material-symbols-outlined text-3xl mb-2 block">mail</span>
            <p className="text-[13px]">No individual emails sent yet.</p>
          </div>
        )}
        {singleVisible.map((h, i) => (
          <div key={i} className="bg-surface-container border border-outline-variant glass-card rounded-lg p-4 flex flex-col gap-2 hover:border-primary transition-all group">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[13px] text-[13px] font-bold text-on-surface">{h.jobTitle}</p>
                <p className="text-[13px] text-on-surface-variant">{h.company}</p>
              </div>
              {h.opened ? (
                <div className="bg-sky-500/10 text-sky-400 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border border-sky-500/20 flex items-center gap-1.5 animate-pulse">
                  <span className="material-symbols-outlined text-[12px] font-bold">visibility</span>
                  <span>OPENED {h.opensCount > 1 ? `(${h.opensCount}x)` : ''}</span>
                </div>
              ) : (
                <div className="bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border border-emerald-500/20">
                  SENT
                </div>
              )}
            </div>
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-outline-variant/50 gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 flex-1 min-w-0">
                <span className="text-[11px] font-semibold text-on-surface-variant shrink-0">{new Date(h.date).toLocaleDateString('en-US')}</span>
                <span className="text-xs text-on-surface-variant truncate">{h.recruiterEmail}</span>
                {h.opened && h.openedAt && (
                  <span className="text-[11px] text-sky-400 flex items-center gap-1 select-none sm:border-l sm:border-outline-variant/40 sm:pl-4">
                    <span className="material-symbols-outlined text-[13px]">schedule</span>
                    <span>Opened: {new Date(h.openedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, {new Date(h.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </span>
                )}
              </div>
              <a
                href={h.messageId && h.messageId !== 'N/A' ? `https://mail.google.com/mail/u/0/#all/${h.messageId}` : `https://mail.google.com/mail/u/0/#search/to:${encodeURIComponent(h.recruiterEmail)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg google-gradient-border transition-all duration-200 text-[11px] group/link shrink-0"
                title="Open in Gmail"
              >
                <svg className="w-[18px] h-[18px] shrink-0 group-hover/link:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5.455 4.64v14.726H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964l1.528 1.146z" fill="#4285F4" />
                  <path d="M3.927 3.493L5.455 4.64v7.09L0 6.82V5.457c0-2.023 2.309-3.178 3.927-1.964z" fill="#B00020" />
                  <path d="M5.455 4.64L12 9.548l6.545-4.908v7.09L12 16.64l-6.545-4.91V4.64z" fill="#EA4335" />
                  <path d="M20.073 3.493L18.545 4.64v7.09L24 6.82V5.457c0-2.023-2.309-3.178-3.927-1.964z" fill="#FBBC05" />
                  <path d="M18.545 4.64v14.726h3.819A1.636 1.636 0 0 0 24 19.366V5.457c0-2.023-2.309-3.178-3.927-1.964l-1.528 1.146z" fill="#34A853" />
                </svg>
                <span className="hidden sm:inline font-black tracking-wider text-[14.5px]">
                  <span className="text-[#4285F4]">G</span>
                  <span className="text-[#ea4335] dark:text-[#ff6b6b]">m</span>
                  <span className="text-[#fbbc05]">a</span>
                  <span className="text-[#4285F4]">i</span>
                  <span className="text-[#34a853]">l</span>
                </span>
              </a>
            </div>
          </div>
        ))}
        {singleHasMore && (
          <button
            onClick={() => setSinglePage(prev => prev + 1)}
            className="w-full py-3 mt-2 rounded-xl border border-outline-variant bg-surface-container-low hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">expand_more</span>
            Load More ({singleEmails.length - singleVisible.length} remaining)
          </button>
        )}
      </div>
    </section>
    );
  })()}

  {/* BULK BCC HISTORY */}
  {outreachTab === 'bulk' && (() => {
    const bccVisible = bccHistory.slice(0, bccPage * ITEMS_PER_PAGE);
    const bccHasMore = bccVisible.length < bccHistory.length;
    return (
    <section>
      <div className="flex items-center justify-between mb-4 mt-8">
        <h3 className="font-headline-md text-body-lg font-bold text-on-surface">Bulk BCC History</h3>
        <span className="text-[11px] font-semibold text-secondary bg-secondary/10 px-2 py-0.5 rounded-full border border-secondary/20">
          {bccHistory.length} Campaigns
        </span>
      </div>
      <div className="space-y-3">
        {bccHistory.length === 0 && (
          <div className="bg-surface-container border border-outline-variant glass-card rounded-lg p-8 text-center text-on-surface-variant">
            <span className="material-symbols-outlined text-3xl mb-2 block">campaign</span>
            <p className="text-[13px]">No bulk BCC campaigns sent yet.</p>
          </div>
        )}
        {bccVisible.map((h, i) => (
          <div key={i} className="bg-surface-container border border-outline-variant glass-card rounded-lg p-4 flex flex-col gap-2 hover:border-secondary transition-all group">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[13px] text-[13px] font-bold text-on-surface">{h.subject}</p>
                <p className="text-[13px] text-on-surface-variant">{h.recipientCount} recipients</p>
              </div>
              <div className="bg-secondary/10 text-secondary px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border border-secondary/20">
                BCC SENT
              </div>
            </div>
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-outline-variant/50 gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 flex-1 min-w-0">
                <span className="text-[11px] font-semibold text-on-surface-variant shrink-0">{new Date(h.date).toLocaleDateString('en-US')}</span>
              </div>
              <a
                href={h.messageId && h.messageId !== 'N/A' ? `https://mail.google.com/mail/u/0/#all/${h.messageId}` : `https://mail.google.com/mail/u/0/#search/subject:(${encodeURIComponent(h.subject)})`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg google-gradient-border transition-all duration-200 text-[11px] group/link shrink-0"
                title="Open in Gmail"
              >
                <svg className="w-[18px] h-[18px] shrink-0 group-hover/link:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M5.455 4.64v14.726H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964l1.528 1.146z" fill="#4285F4" />
                  <path d="M3.927 3.493L5.455 4.64v7.09L0 6.82V5.457c0-2.023 2.309-3.178 3.927-1.964z" fill="#B00020" />
                  <path d="M5.455 4.64L12 9.548l6.545-4.908v7.09L12 16.64l-6.545-4.91V4.64z" fill="#EA4335" />
                  <path d="M20.073 3.493L18.545 4.64v7.09L24 6.82V5.457c0-2.023-2.309-3.178-3.927-1.964z" fill="#FBBC05" />
                  <path d="M18.545 4.64v14.726h3.819A1.636 1.636 0 0 0 24 19.366V5.457c0-2.023-2.309-3.178-3.927-1.964l-1.528 1.146z" fill="#34A853" />
                </svg>
                <span className="hidden sm:inline font-black tracking-wider text-[14.5px]">
                  <span className="text-[#4285F4]">G</span>
                  <span className="text-[#ea4335] dark:text-[#ff6b6b]">m</span>
                  <span className="text-[#fbbc05]">a</span>
                  <span className="text-[#4285F4]">i</span>
                  <span className="text-[#34a853]">l</span>
                </span>
              </a>
            </div>
          </div>
        ))}
        {bccHasMore && (
          <button
            onClick={() => setBccPage(prev => prev + 1)}
            className="w-full py-3 mt-2 rounded-xl border border-outline-variant bg-surface-container-low hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">expand_more</span>
            Load More ({bccHistory.length - bccVisible.length} remaining)
          </button>
        )}
      </div>
    </section>
    );
  })()}

  {/* CSV IMPORT HISTORY */}
  {outreachTab === 'csv' && (() => {
    const csvVisible = csvCampaignHistory.slice(0, csvPage * ITEMS_PER_PAGE);
    const csvHasMore = csvVisible.length < csvCampaignHistory.length;
    return (
    <section>
      <div className="flex items-center justify-between mb-4 mt-8">
        <h3 className="font-headline-md text-body-lg font-bold text-on-surface">CSV Import History</h3>
        <span className="text-[11px] font-semibold text-tertiary bg-tertiary/10 px-2 py-0.5 rounded-full border border-tertiary/20">
          {csvCampaignHistory.length} Campaigns
        </span>
      </div>
      <div className="space-y-3">
        {csvCampaignHistory.length === 0 && (
          <div className="bg-surface-container border border-outline-variant glass-card rounded-lg p-8 text-center text-on-surface-variant">
            <span className="material-symbols-outlined text-3xl mb-2 block">upload_file</span>
            <p className="text-[13px]">No CSV campaigns sent yet.</p>
          </div>
        )}
        {csvVisible.map((h, i) => (
          <div key={i} className="bg-surface-container border border-outline-variant glass-card rounded-lg p-4 flex flex-col gap-2 hover:border-tertiary transition-all group">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[13px] text-[13px] font-bold text-on-surface">{h.csvName}</p>
                <p className="text-[13px] text-on-surface-variant">{h.jobTitle} • {h.totalEmails} total leads</p>
              </div>
              <div className="flex gap-2">
                <div className="bg-tertiary/10 text-tertiary px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border border-tertiary/20">
                  {h.sentCount} SENT
                </div>
                {h.failedCount > 0 && (
                  <div className="bg-error/10 text-error px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border border-error/20">
                    {h.failedCount} FAILED
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-outline-variant/50 gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-4 flex-1 min-w-0">
                <span className="text-[11px] font-semibold text-on-surface-variant shrink-0">{new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at {new Date(h.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                <span className="text-xs text-on-surface-variant capitalize">{h.status}</span>
              </div>
            </div>
          </div>
        ))}
        {csvHasMore && (
          <button
            onClick={() => setCsvPage(prev => prev + 1)}
            className="w-full py-3 mt-2 rounded-xl border border-outline-variant bg-surface-container-low hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface font-bold text-sm transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">expand_more</span>
            Load More ({csvCampaignHistory.length - csvVisible.length} remaining)
          </button>
        )}
      </div>
    </section>
    );
  })()}
</div>
  );
}
