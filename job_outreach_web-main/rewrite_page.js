const fs = require('fs');
const path = require('path');

const srcFile = path.join(__dirname, 'app', 'dashboard', 'page.tsx');
const content = fs.readFileSync(srcFile, 'utf-8');

// Find the line where the main return statement starts using regex to ignore line endings
const match = content.match(/return \([\r\n\s]+<div className="bg-transparent text-on-surface font-body-md min-h-screen overflow-x-hidden">/);

if (!match) {
  console.error("Could not find return statement");
  process.exit(1);
}

const returnIdx = match.index;
const beforeReturn = content.substring(0, returnIdx);

// We need to add dynamic imports at the top
const importsToAdd = `
import dynamic from 'next/dynamic';
import { DashboardContext } from './DashboardContext';
import TabSkeleton from './TabSkeleton';

const HomeTab = dynamic(() => import('./tabs/HomeTab'), { loading: () => <TabSkeleton /> });
const AutoAgentTab = dynamic(() => import('./tabs/AutoAgentTab'), { loading: () => <TabSkeleton /> });
const OutreachHubTab = dynamic(() => import('./tabs/OutreachHubTab'), { loading: () => <TabSkeleton /> });
const InboxScannerTab = dynamic(() => import('./tabs/InboxScannerTab'), { loading: () => <TabSkeleton /> });
const ResumeManagerTab = dynamic(() => import('./tabs/ResumeManagerTab'), { loading: () => <TabSkeleton /> });
const SettingsTab = dynamic(() => import('./tabs/SettingsTab'), { loading: () => <TabSkeleton /> });
`;

let newBeforeReturn = beforeReturn;
// Inject imports after the last standard import
const lastImportIdx = newBeforeReturn.lastIndexOf('import ');
const endOfLastImport = newBeforeReturn.indexOf('\n', lastImportIdx) + 1;
newBeforeReturn = newBeforeReturn.substring(0, endOfLastImport) + importsToAdd + newBeforeReturn.substring(endOfLastImport);

// Now for the context value object
const contextValue = `
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
    getValidProviderToken, setResumeBase64, isSidebarCollapsed, setIsSidebarCollapsed,
    router, handleSignOut
`;

const newRender = `  return (
    <DashboardContext.Provider value={{${contextValue}}}>
      <div className="bg-transparent text-on-surface font-body-md min-h-screen overflow-x-hidden">

        {/* Top Navigation Bar (Mobile only) */}
        <header className="flex justify-between items-center px-container-padding-mobile h-16 w-full z-40 bg-surface border-b border-outline-variant sticky top-0 lg:hidden">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">menu</span>
            <span className="font-headline-md text-headline-md font-bold text-primary">Job mail out</span>
          </div>
          <button className="relative w-9 h-9 rounded-full bg-surface-container-high border border-outline-variant flex items-center justify-center hover:bg-surface-container-highest transition-colors active:scale-95 overflow-hidden shadow-sm">
            {user?.email ? (
              <span className="text-sm font-bold text-primary">{user.email.substring(0, 1).toUpperCase()}</span>
            ) : (
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant">person</span>
            )}
            <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-surface rounded-full"></div>
          </button>
        </header>

        <div className="flex relative">

          {/* Collapsible Sidebar */}
          <aside className={\`fixed top-0 left-0 h-screen bg-surface border-r border-outline-variant z-50 hidden lg:flex flex-col transition-all duration-300 ease-in-out shadow-lg shadow-black/5 \${isSidebarCollapsed ? 'w-[68px]' : 'w-[272px]'}\`}>
            
            {/* Sidebar Header */}
            <div className={\`flex items-center h-[72px] border-b border-outline-variant/60 \${isSidebarCollapsed ? 'justify-center px-2' : 'justify-between px-6'}\`}>
              {!isSidebarCollapsed && (
                <div className="flex items-center gap-3 shrink-0 animate-fade-in-right">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-secondary flex items-center justify-center shadow-md shadow-primary/20 shrink-0">
                    <span className="material-symbols-outlined text-[16px] text-surface-container-lowest">forward_to_inbox</span>
                  </div>
                  <span className="font-headline-md text-headline-md font-bold text-on-surface truncate">Job mail out</span>
                </div>
              )}
              <button 
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors active:scale-95"
              >
                <span className="material-symbols-outlined text-[20px]">{isSidebarCollapsed ? 'menu_open' : 'menu'}</span>
              </button>
            </div>

            {/* Sidebar Navigation */}
            <nav className="flex-1 py-6 flex flex-col gap-1 overflow-y-auto overflow-x-hidden no-scrollbar">
              <button 
                onClick={() => setActiveTab('home')}
                className={\`h-12 flex items-center rounded-full transition-all duration-300 ease-in-out pl-2 mx-2 \${isSidebarCollapsed ? 'justify-center w-12 hover:bg-surface-container-high' : (\`w-[calc(100%-16px)] \${activeTab === 'home' || !activeTab ? 'bg-primary/10 text-primary font-bold shadow-[inset_4px_0_0_rgba(var(--primary-rgb),1)]' : 'text-on-surface hover:bg-surface-container-high hover:text-on-surface font-medium'}\`)}\`}
                title="Dashboard"
              >
                <span className={\`material-symbols-outlined text-[22px] \${isSidebarCollapsed ? 'shrink-0' : 'mr-4'}\`}>dashboard</span>
                {!isSidebarCollapsed && <span className="truncate">Dashboard</span>}
              </button>

              <button 
                onClick={() => setActiveTab('auto')}
                className={\`h-12 flex items-center rounded-full transition-all duration-300 ease-in-out pl-2 mx-2 \${isSidebarCollapsed ? 'justify-center w-12 hover:bg-surface-container-high' : (\`w-[calc(100%-16px)] \${activeTab === 'auto' ? 'bg-secondary/15 text-secondary font-bold shadow-[inset_4px_0_0_rgba(var(--secondary-rgb),1)]' : 'text-on-surface hover:bg-surface-container-high hover:text-on-surface font-medium'}\`)}\`}
                title="Auto Agent"
              >
                <span className={\`material-symbols-outlined text-[22px] \${isSidebarCollapsed ? 'shrink-0' : 'mr-4'}\`}>smart_toy</span>
                {!isSidebarCollapsed && (
                  <>
                    <span className="truncate flex-1 text-left">Auto Agent</span>
                    <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border border-secondary/30 bg-secondary/10 text-secondary mr-3 shrink-0">Beta</span>
                  </>
                )}
              </button>

              <button 
                onClick={() => setActiveTab('outreach')}
                className={\`h-12 flex items-center rounded-full transition-all duration-300 ease-in-out pl-2 mx-2 \${isSidebarCollapsed ? 'justify-center w-12 hover:bg-surface-container-high' : (\`w-[calc(100%-16px)] \${activeTab === 'outreach' ? 'bg-primary/10 text-primary font-bold shadow-[inset_4px_0_0_rgba(var(--primary-rgb),1)]' : 'text-on-surface hover:bg-surface-container-high hover:text-on-surface font-medium'}\`)}\`}
                title="Outreach Hub"
              >
                <span className={\`material-symbols-outlined text-[22px] \${isSidebarCollapsed ? 'shrink-0' : 'mr-4'}\`}>send</span>
                {!isSidebarCollapsed && <span className="truncate">Outreach Hub</span>}
              </button>

              <button 
                onClick={() => setActiveTab('inbox')}
                className={\`h-12 flex items-center rounded-full transition-all duration-300 ease-in-out pl-2 mx-2 \${isSidebarCollapsed ? 'justify-center w-12 hover:bg-surface-container-high' : (\`w-[calc(100%-16px)] \${activeTab === 'inbox' ? 'bg-primary/10 text-primary font-bold shadow-[inset_4px_0_0_rgba(var(--primary-rgb),1)]' : 'text-on-surface hover:bg-surface-container-high hover:text-on-surface font-medium'}\`)}\`}
                title="Reply Scanner"
              >
                <span className={\`material-symbols-outlined text-[22px] \${isSidebarCollapsed ? 'shrink-0' : 'mr-4'}\`}>mark_email_read</span>
                {!isSidebarCollapsed && <span className="truncate">Reply Scanner</span>}
              </button>

              <button 
                onClick={() => setActiveTab('resume')}
                className={\`h-12 flex items-center rounded-full transition-all duration-300 ease-in-out pl-2 mx-2 \${isSidebarCollapsed ? 'justify-center w-12 hover:bg-surface-container-high' : (\`w-[calc(100%-16px)] \${activeTab === 'resume' ? 'bg-primary/10 text-primary font-bold shadow-[inset_4px_0_0_rgba(var(--primary-rgb),1)]' : 'text-on-surface hover:bg-surface-container-high hover:text-on-surface font-medium'}\`)}\`}
                title="Resume Manager"
              >
                <span className={\`material-symbols-outlined text-[22px] \${isSidebarCollapsed ? 'shrink-0' : 'mr-4'}\`}>description</span>
                {!isSidebarCollapsed && <span className="truncate">Resume Manager</span>}
              </button>

              <button 
                onClick={() => setActiveTab('settings')}
                className={\`h-12 flex items-center rounded-full transition-all duration-300 ease-in-out pl-2 mx-2 mt-auto \${isSidebarCollapsed ? 'justify-center w-12 hover:bg-surface-container-high' : (\`w-[calc(100%-16px)] \${activeTab === 'settings' ? 'bg-primary/10 text-primary font-bold shadow-[inset_4px_0_0_rgba(var(--primary-rgb),1)]' : 'text-on-surface hover:bg-surface-container-high hover:text-on-surface font-medium'}\`)}\`}
                title="Settings"
              >
                <span className={\`material-symbols-outlined text-[22px] \${isSidebarCollapsed ? 'shrink-0' : 'mr-4'}\`}>settings</span>
                {!isSidebarCollapsed && <span className="truncate">Settings</span>}
              </button>
            </nav>

            {/* Sidebar User Profile (Bottom) */}
            <div className={\`p-4 border-t border-outline-variant/60 \${isSidebarCollapsed ? 'flex justify-center' : ''}\`}>
              <div className={\`flex items-center \${isSidebarCollapsed ? 'justify-center' : 'gap-3'} w-full\`}>
                <div className="w-10 h-10 rounded-full bg-surface-container-highest border border-outline-variant/60 flex items-center justify-center shrink-0 relative cursor-pointer hover:border-primary transition-colors group" title={user?.email || "User Profile"}>
                  {user?.email ? (
                    <span className="text-sm font-bold text-primary group-hover:scale-110 transition-transform">{user.email.substring(0, 1).toUpperCase()}</span>
                  ) : (
                    <span className="material-symbols-outlined text-[20px] text-on-surface-variant group-hover:text-primary transition-colors">person</span>
                  )}
                  <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-surface rounded-full shadow-sm"></div>
                </div>
                {!isSidebarCollapsed && (
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-on-surface truncate pr-2">{user?.email}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Online</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </aside>

          {/* Main Content Area */}
          <main className={\`flex-1 pb-32 lg:pb-12 transition-all duration-300 ease-in-out \${isSidebarCollapsed ? 'lg:ml-[68px]' : 'lg:ml-[272px]'}\`}>

            {(!activeTab || activeTab === 'home') && <HomeTab />}
            {activeTab === 'auto' && <AutoAgentTab />}
            {activeTab === 'outreach' && <OutreachHubTab />}
            {activeTab === 'inbox' && <InboxScannerTab />}
            {activeTab === 'resume' && <ResumeManagerTab />}
            {activeTab === 'settings' && <SettingsTab />}

          </main>

        </div>

        {/* Bottom Navigation (Mobile only) */}
        <nav className="fixed bottom-0 left-0 right-0 h-16 bg-surface/90 backdrop-blur-xl border-t border-outline-variant z-50 flex items-center justify-around px-2 lg:hidden shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
          <button onClick={() => setActiveTab('home')} className={\`flex flex-col items-center justify-center p-2 transition-colors active:scale-90 duration-200 \${activeTab === 'home' || !activeTab ? 'text-primary' : 'text-on-surface-variant'}\`}>
            <span className={\`material-symbols-outlined text-[24px] \${(activeTab === 'home' || !activeTab) ? 'font-variation-fill text-primary' : ''}\`}>dashboard</span>
          </button>
          <button onClick={() => setActiveTab('auto')} className={\`flex flex-col items-center justify-center p-2 transition-colors active:scale-90 duration-200 \${activeTab === 'auto' ? 'text-secondary' : 'text-on-surface-variant'}\`}>
            <span className={\`material-symbols-outlined text-[24px] \${activeTab === 'auto' ? 'font-variation-fill text-secondary drop-shadow-[0_0_4px_rgba(var(--secondary-rgb),0.5)]' : ''}\`}>smart_toy</span>
          </button>
          <button onClick={() => setActiveTab('outreach')} className={\`flex flex-col items-center justify-center p-2 transition-colors active:scale-90 duration-200 \${activeTab === 'outreach' ? 'text-primary' : 'text-on-surface-variant'}\`}>
            <span className={\`material-symbols-outlined text-[24px] \${activeTab === 'outreach' ? 'font-variation-fill text-primary drop-shadow-[0_0_4px_rgba(var(--primary-rgb),0.5)]' : ''}\`}>send</span>
          </button>
          <button onClick={() => setActiveTab('inbox')} className={\`flex flex-col items-center justify-center p-2 transition-colors active:scale-90 duration-200 \${activeTab === 'inbox' ? 'text-primary' : 'text-on-surface-variant'}\`}>
            <span className={\`material-symbols-outlined text-[24px] \${activeTab === 'inbox' ? 'font-variation-fill text-primary' : ''}\`}>mark_email_read</span>
          </button>
          <button onClick={() => setActiveTab('resume')} className={\`flex flex-col items-center justify-center p-2 transition-colors active:scale-90 duration-200 \${activeTab === 'resume' ? 'text-primary' : 'text-on-surface-variant'}\`}>
            <span className={\`material-symbols-outlined text-[24px] \${activeTab === 'resume' ? 'font-variation-fill text-primary' : ''}\`}>description</span>
          </button>
          <button onClick={() => setActiveTab('settings')} className={\`flex flex-col items-center justify-center p-2 transition-colors active:scale-90 duration-200 \${activeTab === 'settings' ? 'text-primary' : 'text-on-surface-variant'}\`}>
            <span className={\`material-symbols-outlined text-[24px] \${activeTab === 'settings' ? 'font-variation-fill text-primary' : ''}\`}>settings</span>
          </button>
        </nav>

      </div>
    </DashboardContext.Provider>
  );
}
`;

const finalContent = newBeforeReturn + newRender;
fs.writeFileSync(srcFile, finalContent, 'utf-8');
console.log('page.tsx successfully rewritten! Initial length was ' + content.length + ', new length is ' + finalContent.length);
