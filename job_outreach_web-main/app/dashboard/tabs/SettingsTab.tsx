'use client';
import { useDashboard } from '../DashboardContext';

export default function SettingsTab() {
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
    regenerateSingleAiDraft, handleScanReplies,
    handleFetchLeads, handleTransferAutoToCsv, handleTransferAutoToBcc,
    handleSaveProfile, handleThemeChange, handleSaveSettings,
    getValidProviderToken, setResumeBase64, isSidebarCollapsed,
    router, handleSignOut
  } = ctx;

  return (
<div className="max-w-4xl mx-auto px-container-padding-mobile lg:px-container-padding-desktop pt-stack-lg space-y-stack-lg">
  <header className="mb-stack-lg">
    <h1 className="text-lg md:text-xl font-semibold text-on-surface flex items-center gap-3 tracking-tight">
      <span className="material-symbols-outlined text-[28px] text-primary">settings</span>
      Settings & Configurations
    </h1>
    <p className="text-on-surface-variant mt-1 text-[13px]">Customize application themes, default models, daily safety limits, and signatures.</p>
  </header>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-gutter">

    {/* Column 1: Appearance & Theme */}
    <div className="space-y-stack-md">
      <div className="bg-surface-container border border-outline-variant rounded-xl p-stack-md card-elevated flex flex-col h-full justify-between">
        <div>
          <h3 className="text-[15px] text-on-surface mb-3 flex items-center gap-2 font-semibold tracking-tight">
            <span className="material-symbols-outlined text-primary">palette</span>
            Application Theme
          </h3>
          <p className="text-on-surface-variant text-[12px] mb-4">Toggle between a premium glass-charcoal dark theme and a clean slate-white light theme.</p>

          <div className="grid grid-cols-2 gap-4">
            {/* Light Mode Selector Card */}
            <div
              onClick={() => handleThemeChange('light')}
              className={`cursor-pointer rounded-2xl p-5 border-2 transition-all duration-300 flex flex-col items-center justify-center text-center group hover:scale-[1.02] active:scale-[0.98] ${theme === 'light'
                ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10 ring-2 ring-primary/20'
                : 'border-outline-variant hover:border-on-surface-variant/40 bg-surface-container-low hover:shadow-md'
                }`}
            >
              <span className={`material-symbols-outlined text-4xl mb-2 group-hover:rotate-45 transition-transform duration-500 ${theme === 'light' ? 'text-primary' : 'text-on-surface-variant'}`}>
                light_mode
              </span>
              <span className="font-body-md font-semibold text-on-surface">Light Theme</span>
            </div>

            {/* Dark Mode Selector Card */}
            <div
              onClick={() => handleThemeChange('dark')}
              className={`cursor-pointer rounded-2xl p-5 border-2 transition-all duration-300 flex flex-col items-center justify-center text-center group hover:scale-[1.02] active:scale-[0.98] ${theme === 'dark'
                ? 'border-primary bg-primary/5 shadow-lg shadow-primary/10 ring-2 ring-primary/20'
                : 'border-outline-variant hover:border-on-surface-variant/40 bg-surface-container-low hover:shadow-md'
                }`}
            >
              <span className={`material-symbols-outlined text-4xl mb-2 group-hover:rotate-12 transition-transform duration-500 ${theme === 'dark' ? 'text-primary' : 'text-on-surface-variant'}`}>
                dark_mode
              </span>
              <span className="font-body-md font-semibold text-on-surface">Dark Theme</span>
            </div>
          </div>
        </div>

        <div className="mt-6 p-3 rounded-lg bg-surface-container-low border border-outline-variant text-[11px] text-on-surface-variant italic">
          💡 Tip: Settings are synced directly across device reloads and apply immediately.
        </div>
      </div>
    </div>

    {/* Column 2: Defaults & Limits */}
    <div className="space-y-stack-md">
      <div className="bg-surface-container border border-outline-variant rounded-xl p-stack-md card-elevated flex flex-col justify-between h-full">
        <div>
          <h3 className="text-[15px] text-on-surface mb-3 flex items-center gap-2 font-semibold tracking-tight">
            <span className="material-symbols-outlined text-primary">security</span>
            Safety & AI Defaults
          </h3>
          <p className="text-on-surface-variant text-[12px] mb-4">Manage outreach models and throttle applications to safe hourly limits.</p>

          <div className="space-y-4">
            {/* Default AI Model dropdown */}
            <div>
              <label className="block text-label-md text-on-surface font-semibold mb-2">Default AI Model</label>
              <select
                value={defaultAiModel}
                onChange={(e) => setDefaultAiModel(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-outline-variant bg-surface-container-low text-on-surface focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(var(--primary-rgb),0.12)] transition-all font-body-md cursor-pointer"
              >
                <option value="gemini">Google Gemini 2.5 Flash</option>
                <option value="claude">Anthropic Claude 3.5 Sonnet</option>
              </select>
            </div>

            {/* Daily application safety limit slider */}
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-label-md text-on-surface font-semibold">Daily Application Limit</label>
                <div className="flex items-center gap-2">
                  {dailyLimit <= 60 ? (
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 leading-none">
                      Safe
                    </span>
                  ) : dailyLimit <= 100 ? (
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 leading-none">
                      Caution
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded bg-red-500/10 text-red-400 border border-red-500/20 leading-none">
                      High Risk
                    </span>
                  )}
                  <span className="text-primary font-bold text-sm bg-primary/10 px-2.5 py-0.5 rounded-full border border-primary/20">{dailyLimit} emails</span>
                </div>
              </div>
              <input
                type="range"
                min="10"
                max="200"
                step="5"
                value={dailyLimit}
                onChange={(e) => setDailyLimit(parseInt(e.target.value, 10))}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-outline-variant accent-primary focus:outline-none transition-all duration-300"
              />
              <p className="text-[11px] text-on-surface-variant mt-1.5 leading-normal">Recommended safe ceiling is 50-80 emails/day to safeguard your personal Gmail account.</p>
            </div>
          </div>
        </div>
      </div>
    </div>

  </div>

  {/* Row 2: Dynamic Outreach Signature Editor */}
  <div className="bg-surface-container border border-outline-variant rounded-xl p-stack-md card-elevated">
    <h3 className="text-[15px] text-on-surface mb-1 flex items-center gap-2 font-semibold tracking-tight">
      <span className="material-symbols-outlined text-primary">signature</span>
      Dynamic Outreach Signature
    </h3>
    <p className="text-on-surface-variant text-[12px] mb-4">This signature is automatically appended to the bottom of all AI generated Single, Bulk BCC, and individual CSV applications.</p>

    <textarea
      value={signature}
      onChange={(e) => setSignature(e.target.value)}
      placeholder={`Regards,\nYour Name\nSoftware Engineer | +91 99999 99999\nhttps://linkedin.com/in/username`}
      rows={5}
      className="w-full p-4 rounded-xl border border-outline-variant bg-surface-container-low text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(var(--primary-rgb),0.12)] transition-all font-mono text-sm leading-relaxed"
    />

    <div className="mt-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <button
          onClick={() => {
            const lines = [`Regards,`, profileFullName || 'Your Name'];
            const details = [profileCurrentTitle, profilePhone].filter(Boolean).join(' | ');
            if (details) lines.push(details);
            if (profileLinkedin) lines.push(profileLinkedin);
            if (profileGithub) lines.push(profileGithub);
            if (profilePortfolio) lines.push(profilePortfolio);
            setSignature(lines.join('\n'));
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-highest hover:bg-primary/10 text-on-surface-variant hover:text-primary transition-colors text-xs font-semibold"
        >
          <span className="material-symbols-outlined text-[16px]">magic_button</span>
          Auto-Generate
        </button>
        <span className="text-xs text-on-surface-variant hidden sm:inline">✨ Works across all templates instantly.</span>
      </div>

      <button
        onClick={handleSaveSettings}
        className="flex items-center gap-2 px-6 py-2.5 ai-gradient-btn rounded-xl active:scale-95 transition-all duration-200"
      >
        <span className="material-symbols-outlined">save</span>
        Save Settings & Defaults
      </button>
    </div>
  </div>

</div>
  );
}
