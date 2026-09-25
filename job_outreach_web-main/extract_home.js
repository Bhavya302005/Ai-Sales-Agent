const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, 'app', 'dashboard', 'page.tsx');
const content = fs.readFileSync(srcFile, 'utf-8');
const lines = content.split('\n');

const innerLines = lines.slice(2077, 2378); // lines 2078 to 2378 (0-indexed 2077 to 2377)

const minIndent = Math.min(...innerLines.filter(l => l.trim().length > 0).map(l => l.match(/^(\s*)/)[1].length));
const dedented = innerLines.map(l => {
  if (l.trim().length === 0) return '';
  return l.substring(Math.min(minIndent, l.match(/^(\s*)/)[1].length));
});

const jsxContent = dedented.join('\n');

const componentContent = `'use client';
import { useDashboard } from '../DashboardContext';

export default function HomeTab() {
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
${jsxContent}
  );
}
`;

const destFile = path.join(__dirname, 'app', 'dashboard', 'tabs', 'HomeTab.tsx');
fs.writeFileSync(destFile, componentContent, 'utf-8');
console.log('Created HomeTab.tsx');
