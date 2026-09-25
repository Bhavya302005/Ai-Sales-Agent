// Script to extract tab sections from page.tsx and create separate component files
const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, 'app', 'dashboard', 'page.tsx');
const content = fs.readFileSync(srcFile, 'utf-8');
const lines = content.split('\n');

// Tab sections (1-indexed line numbers from our discovery)
// HOME: 2077 - 2379 (the inner div is 2078-2378)
// AUTO: 2382 - 2521
// OUTREACH: 2522 - 3550
// INBOX: 3551 - 3726
// RESUME: 3727 - 3795
// SETTINGS: 3796 - 4800 (profile modal is inside settings)

// We need to find the exact closing line for each tab section
// Each tab starts with {activeTab === 'xxx' && ( and ends with )}
// Let's find them programmatically by counting braces

function findClosingBrace(lines, startLine) {
  // startLine is 0-indexed
  let depth = 0;
  let started = false;
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      if (line[j] === '(') { depth++; started = true; }
      if (line[j] === ')') { depth--; }
      if (started && depth === 0) return i;
    }
  }
  return -1;
}

const tabs = [
  { name: 'HomeTab', startLine: 2077, marker: "(!activeTab || activeTab === 'home')" },
  { name: 'AutoAgentTab', startLine: 2382, marker: "activeTab === 'auto'" },
  { name: 'OutreachHubTab', startLine: 2522, marker: "activeTab === 'outreach'" },
  { name: 'InboxScannerTab', startLine: 3551, marker: "activeTab === 'inbox'" },
  { name: 'ResumeManagerTab', startLine: 3727, marker: "activeTab === 'resume'" },
  { name: 'SettingsTab', startLine: 3796, marker: "activeTab === 'settings'" },
];

tabs.forEach(tab => {
  const startIdx = tab.startLine - 1; // 0-indexed
  const endIdx = findClosingBrace(lines, startIdx);
  console.log(`${tab.name}: lines ${tab.startLine}-${endIdx + 1} (${endIdx - startIdx + 1} lines)`);
  
  // Extract the inner content (skip the {activeTab === ... && ( wrapper and the closing )})
  // The wrapper line is: {activeTab === 'xxx' && (
  // The content starts on the next line
  // The closing is: )}
  
  // Get inner JSX (between the opening wrapper and closing })
  const innerStart = startIdx + 1; // line after {activeTab === 'xxx' && (
  const innerEnd = endIdx - 1; // line before )}
  
  const innerLines = lines.slice(innerStart, innerEnd + 1);
  
  // Remove leading indentation (find minimum non-empty indent and remove it)
  const nonEmptyLines = innerLines.filter(l => l.trim().length > 0);
  if (nonEmptyLines.length === 0) {
    console.log(`  WARNING: No content for ${tab.name}`);
    return;
  }
  
  const minIndent = Math.min(...nonEmptyLines.map(l => l.match(/^(\s*)/)[1].length));
  const dedented = innerLines.map(l => {
    if (l.trim().length === 0) return '';
    return l.substring(Math.min(minIndent, l.match(/^(\s*)/)[1].length));
  });
  
  const jsxContent = dedented.join('\n');
  
  // Create the component file
  const componentContent = `'use client';
import { useDashboard } from '../DashboardContext';

export default function ${tab.name}() {
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

  const tabDir = path.join(__dirname, 'app', 'dashboard', 'tabs');
  fs.writeFileSync(path.join(tabDir, `${tab.name}.tsx`), componentContent, 'utf-8');
  console.log(`  Created: tabs/${tab.name}.tsx`);
});

console.log('\nDone! All tab components created.');
