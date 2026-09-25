'use client';
import { createContext, useContext } from 'react';

// All dashboard shared state in one context — tabs consume via useDashboard()
export interface DashboardContextType {
  // Auth
  user: any;
  router: any;
  handleSignOut: () => void;

  // Navigation
  activeTab: string;
  setActiveTab: (tab: string) => void;
  outreachTab: string;
  setOutreachTab: (tab: string) => void;
  isSidebarCollapsed: boolean;
  setIsSidebarCollapsed: (v: boolean) => void;

  // Form State
  company: string; setCompany: (v: string) => void;
  jobTitle: string; setJobTitle: (v: string) => void;
  jobType: string; setJobType: (v: string) => void;
  experienceLevel: string; setExperienceLevel: (v: string) => void;
  toneStyle: string; setToneStyle: (v: string) => void;
  jobDescription: string; setJobDescription: (v: string) => void;
  jobPostUrl: string; setJobPostUrl: (v: string) => void;
  recruiterName: string; setRecruiterName: (v: string) => void;
  recruiterEmail: string; setRecruiterEmail: (v: string) => void;
  aiModel: string; setAiModel: (v: string) => void;

  // Generation State
  isGenerating: boolean;
  subject: string; setSubject: (v: string) => void;
  draft: string; setDraft: (v: string) => void;
  showPreview: boolean; setShowPreview: (v: boolean) => void;

  // Data State
  resumeText: string; setResumeText: (v: string) => void;
  resumeBase64: string; setResumeBase64: (v: string) => void;
  isUploadingResume: boolean;
  signature: string; setSignature: (v: string) => void;
  emailHistory: any[]; setEmailHistory: (v: any) => void;
  bccHistory: any[]; setBccHistory: (v: any) => void;

  // Bulk BCC State
  bccEmails: string; setBccEmails: (v: string) => void;
  bccJobTitle: string; setBccJobTitle: (v: string) => void;
  bccSubject: string; setBccSubject: (v: string) => void;
  bccDraft: string; setBccDraft: (v: string) => void;
  isGeneratingBcc: boolean;
  isSendingBcc: boolean;
  isSending: boolean;

  // CSV State
  csvData: any[]; setCsvData: (v: any) => void;
  csvMode: 'idle' | 'select' | 'individual'; setCsvMode: (v: any) => void;
  csvJobTitle: string; setCsvJobTitle: (v: string) => void;
  csvSubject: string; setCsvSubject: (v: string) => void;
  csvDraft: string; setCsvDraft: (v: string) => void;
  isGeneratingCsv: boolean;
  isSendingCsv: boolean;
  csvStatuses: any[]; setCsvStatuses: (v: any) => void;
  csvFileName: string;
  csvCampaignHistory: any[]; setCsvCampaignHistory: (v: any) => void;
  selectedCsvIndex: number | null; setSelectedCsvIndex: (v: number | null) => void;
  previewSubject: string; setPreviewSubject: (v: string) => void;
  previewBody: string; setPreviewBody: (v: string) => void;
  previewRecruiterName: string; setPreviewRecruiterName: (v: string) => void;
  previewRecruiterEmail: string; setPreviewRecruiterEmail: (v: string) => void;
  isGeneratingSingleDraft: boolean;
  isPreGeneratingAll: boolean;

  // Auto Agent State
  autoTargetTitle: string; setAutoTargetTitle: (v: string) => void;
  autoLeads: any[]; setAutoLeads: (v: any) => void;
  selectedLeads: Set<string>; setSelectedLeads: (v: Set<string>) => void;
  isFetchingLeads: boolean;

  // Inbox Scanner State
  isScanning: boolean;
  scannedReplies: any[];
  scanFilter: string; setScanFilter: (v: string) => void;
  scanDays: number; setScanDays: (v: number) => void;
  expandedSummary: Set<number>; setExpandedSummary: (v: Set<number>) => void;
  totalEmailsScanned: number;
  totalRepliesFromDb: number;

  // Profile State
  isProfileModalOpen: boolean; setIsProfileModalOpen: (v: boolean) => void;
  profileFullName: string; setProfileFullName: (v: string) => void;
  profilePhone: string; setProfilePhone: (v: string) => void;
  profileLinkedin: string; setProfileLinkedin: (v: string) => void;
  profileGithub: string; setProfileGithub: (v: string) => void;
  profilePortfolio: string; setProfilePortfolio: (v: string) => void;
  profileCurrentTitle: string; setProfileCurrentTitle: (v: string) => void;
  profileExperienceLevel: string; setProfileExperienceLevel: (v: string) => void;
  profileToneStyle: string; setProfileToneStyle: (v: string) => void;
  profileJobType: string; setProfileJobType: (v: string) => void;
  isSavingProfile: boolean;

  // Credits & Payment State
  credits: number; setCredits: (v: number) => void;
  creditsExpiresAt: string | null;
  showBuyCreditsModal: boolean; setShowBuyCreditsModal: (v: boolean) => void;
  deductCredit: (type: string, description: string) => Promise<boolean>;

  // Settings State
  theme: 'dark' | 'light';
  defaultAiModel: string; setDefaultAiModel: (v: string) => void;
  dailyLimit: number; setDailyLimit: (v: number) => void;

  // Handler Functions
  handleGenerate: () => Promise<void>;
  handleSendEmail: () => Promise<void>;
  handleResumeUpload: (e: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  handleBccGenerate: () => Promise<void>;
  handleBccSend: () => Promise<void>;
  handleCsvUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleCsvGenerate: () => Promise<void>;
  handleTransferToBcc: () => void;
  handleCsvStartSending: () => Promise<void>;
  handleSendOnlyApprovedCsv: () => Promise<void>;
  handleReviewClick: (index: number) => Promise<void>;
  saveAndApproveDraft: () => void;
  retryGenerateRow: (index: number) => Promise<void>;
  quickApproveRow: (index: number) => Promise<void>;
  approveAllCsvDrafts: () => Promise<void>;
  preGenerateAllCsvDrafts: () => Promise<void>;
  regenerateSingleAiDraft: () => Promise<void>;
  handleScanReplies: () => Promise<void>;
  handleFetchLeads: () => Promise<void>;
  handleTransferAutoToCsv: () => void;
  handleTransferAutoToBcc: () => void;
  handleSaveProfile: () => Promise<void>;
  handleThemeChange: (theme: 'dark' | 'light') => void;
  handleSaveSettings: () => void;
  getDynamicChartData: () => any[];
  getValidProviderToken: () => Promise<string | null>;
  sendCsvRow: (index: number, customSubject?: string, customBody?: string) => Promise<boolean>;
  saveCsvCampaign: (sentCount: number, failedCount: number) => Promise<void>;
  handleInlineSend: (index: number, customSubject?: string, customBody?: string) => Promise<void>;
}

export const DashboardContext = createContext<DashboardContextType | null>(null);

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used within DashboardContext.Provider');
  return ctx;
}
