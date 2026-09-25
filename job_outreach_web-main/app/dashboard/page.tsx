'use client';
import toast from 'react-hot-toast';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase/client';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

import { DashboardContext } from './DashboardContext';
import TabSkeleton from './TabSkeleton';

const HomeTab = dynamic(() => import('./tabs/HomeTab'), { loading: () => <TabSkeleton /> });
const AutoAgentTab = dynamic(() => import('./tabs/AutoAgentTab'), { loading: () => <TabSkeleton /> });
const OutreachHubTab = dynamic(() => import('./tabs/OutreachHubTab'), { loading: () => <TabSkeleton /> });
const InboxScannerTab = dynamic(() => import('./tabs/InboxScannerTab'), { loading: () => <TabSkeleton /> });
const ResumeManagerTab = dynamic(() => import('./tabs/ResumeManagerTab'), { loading: () => <TabSkeleton /> });
const SettingsTab = dynamic(() => import('./tabs/SettingsTab'), { loading: () => <TabSkeleton /> });
const ProfileModal = dynamic(() => import('./ProfileModal'), { ssr: false });
const CsvReviewModal = dynamic(() => import('./CsvReviewModal'), { ssr: false });
const PreviewModal = dynamic(() => import('./PreviewModal'), { ssr: false });
const BuyCreditsModal = dynamic(() => import('./BuyCreditsModal'), { ssr: false });



// Consolidated robust AI JSON parsing logic with multi-layer fallback
const parseAIResponse = (rawText: string, defaultSubject: string) => {
  let cleanText = rawText.trim();
  const match = cleanText.match(/\{[\s\S]*\}/);
  if (match) {
    cleanText = match[0];
  }

  // Pre-process and repair the JSON string before parsing to avoid JSON.parse syntax errors
  const repairJSON = (str: string): string => {
    let inString = false;
    let escaped = false;
    let result = "";

    for (let i = 0; i < str.length; i++) {
      const char = str[i];

      if (inString) {
        if (escaped) {
          // Check if it's a valid JSON escape sequence. If not, double escape the backslash.
          if (char === '"' || char === '\\' || char === '/' || char === 'b' || char === 'f' || char === 'n' || char === 'r' || char === 't' || char === 'u') {
            result += char;
          } else {
            if (result.endsWith('\\')) {
              result = result.slice(0, -1) + '\\\\';
            }
            result += char;
          }
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
          result += char;
        } else if (char === '"') {
          inString = false;
          result += char;
        } else if (char === '\n') {
          result += '\\n';
        } else if (char === '\r') {
          result += '\\r';
        } else if (char === '\t') {
          result += '\\t';
        } else {
          result += char;
        }
      } else {
        if (char === '"') {
          inString = true;
        }
        result += char;
      }
    }

    // Close unclosed strings
    if (inString) {
      if (escaped) {
        result = result.slice(0, -1);
      }
      result += '"';
    }

    // Repair unbalanced braces
    let openBraces = 0;
    let closeBraces = 0;
    for (let i = 0; i < result.length; i++) {
      if (result[i] === '{') openBraces++;
      if (result[i] === '}') closeBraces++;
    }
    while (openBraces > closeBraces) {
      result += '}';
      closeBraces++;
    }

    return result;
  };

  try {
    const repairedText = repairJSON(cleanText);
    const parsed = JSON.parse(repairedText);
    // Convert literal \n sequences to actual newlines (Gemini structured output double-escapes them)
    let body = (parsed.body || '')
      .replace(/\\\\n/g, '\n') // In case it's \\n
      .replace(/\\n/g, '\n')   // Standard literal \n
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');
    // Strip any markdown from subject — subject must always be plain text
    let subject = (parsed.subject || '')
      .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/~~(.*?)~~/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .trim();
    return { subject, body };
  } catch (e) {
    // If it still fails, use the robust regex fallback silently without logging a console warning

    // Extract subject and strip any markdown
    const subjMatch = rawText.match(/"subject"\s*:\s*"([^"]+)"/i);
    let subject = subjMatch ? subjMatch[1] : defaultSubject;
    subject = subject
      .replace(/\*\*\*(.*?)\*\*\*/g, '$1')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/__(.*?)__/g, '$1')
      .replace(/_(.*?)_/g, '$1')
      .replace(/~~(.*?)~~/g, '$1')
      .replace(/`(.*?)`/g, '$1')
      .replace(/^#{1,6}\s*/gm, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .trim();

    // Extract body
    let body = '';
    const bodyIndexMatch = rawText.match(/"body"\s*:\s*"/i);
    if (bodyIndexMatch && bodyIndexMatch.index !== undefined) {
      const startIndex = bodyIndexMatch.index + bodyIndexMatch[0].length;
      let bodyPart = rawText.substring(startIndex);

      const bodyMatch = bodyPart.match(/^([\s\S]+?)"\s*\}\s*$/);
      if (bodyMatch) {
        body = bodyMatch[1];
      } else {
        let trimmed = bodyPart.trim();
        if (trimmed.endsWith('}')) {
          trimmed = trimmed.slice(0, -1).trim();
        }
        if (trimmed.endsWith('"')) {
          trimmed = trimmed.slice(0, -1);
        }
        body = trimmed;
      }
    } else {
      body = rawText;
    }

    body = body
      .replace(/\\\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\');

    return { subject, body };
  }
};

const stripHtml = (html: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || "";
};

export default function Dashboard() {
  const [activeTab, setRawActiveTab] = useState('home');

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab) setRawActiveTab(tab);

    if (params.get('profile') === 'true') {
      setTimeout(() => setIsProfileModalOpen(true), 100);
    }
  }, []);

  // Sync profile modal state to URL explicitly

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (isProfileModalOpen) {
      params.set('profile', 'true');
    } else {
      params.delete('profile');
    }

    const newSearch = params.toString();
    const newUrl = newSearch ? `?${newSearch}` : window.location.pathname;
    window.history.replaceState(null, '', newUrl);
  }, [isProfileModalOpen]);

  const setActiveTab = (tab: string) => {
    setRawActiveTab(tab);
    const params = new URLSearchParams(window.location.search);
    params.set('tab', tab);
    window.history.replaceState(null, '', `?${params.toString()}`);
  };
  const [outreachTab, setOutreachTab] = useState('single');
  const [user, setUser] = useState<any>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const router = useRouter();

  // Form State
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [jobType, setJobType] = useState('Full-time');
  const [experienceLevel, setExperienceLevel] = useState('Not specified');
  const [toneStyle, setToneStyle] = useState('Direct & Execution-focused');
  const [jobDescription, setJobDescription] = useState('');
  const [jobPostUrl, setJobPostUrl] = useState('');
  const [recruiterName, setRecruiterName] = useState('');
  const [recruiterEmail, setRecruiterEmail] = useState('');
  const [aiModel, setAiModel] = useState('gemini');

  // Generation State
  const [isGenerating, setIsGenerating] = useState(false);
  const [subject, setSubject] = useState('');
  const [draft, setDraft] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  // Profile State
  const [profileFullName, setProfileFullName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileLinkedin, setProfileLinkedin] = useState('');
  const [profileGithub, setProfileGithub] = useState('');
  const [profilePortfolio, setProfilePortfolio] = useState('');
  const [profileCurrentTitle, setProfileCurrentTitle] = useState('');
  const [profileExperienceLevel, setProfileExperienceLevel] = useState('');
  const [profileToneStyle, setProfileToneStyle] = useState('');
  const [profileJobType, setProfileJobType] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // Data State
  const [resumeText, setResumeText] = useState('');
  const [resumeBase64, setResumeBase64] = useState('');
  const [isUploadingResume, setIsUploadingResume] = useState(false);
  const [bccEmails, setBccEmails] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [emailHistory, setEmailHistory] = useState<any[]>([]);

  // Bulk BCC State
  const [bccJobTitle, setBccJobTitle] = useState('');
  const [bccSubject, setBccSubject] = useState('');
  const [bccDraft, setBccDraft] = useState('');
  const [isGeneratingBcc, setIsGeneratingBcc] = useState(false);
  const [isSendingBcc, setIsSendingBcc] = useState(false);
  const [bccHistory, setBccHistory] = useState<any[]>([]);

  // CSV Import State
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvMode, setCsvMode] = useState<'idle' | 'select' | 'individual'>('idle');
  const [csvJobTitle, setCsvJobTitle] = useState('');
  const [csvSubject, setCsvSubject] = useState('');
  const [csvDraft, setCsvDraft] = useState('');
  const [isGeneratingCsv, setIsGeneratingCsv] = useState(false);
  const [isSendingCsv, setIsSendingCsv] = useState(false);
  const [csvStatuses, setCsvStatuses] = useState<any[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [currentCampaignId, setCurrentCampaignId] = useState<string | null>(null);
  const [csvCampaignHistory, setCsvCampaignHistory] = useState<any[]>([]);

  // CSV Approval & Preview States
  const [selectedCsvIndex, setSelectedCsvIndex] = useState<number | null>(null);
  const [previewSubject, setPreviewSubject] = useState('');
  const [previewBody, setPreviewBody] = useState('');
  const [previewRecruiterName, setPreviewRecruiterName] = useState('');
  const [previewRecruiterEmail, setPreviewRecruiterEmail] = useState('');
  const [isGeneratingSingleDraft, setIsGeneratingSingleDraft] = useState(false);
  const [isPreGeneratingAll, setIsPreGeneratingAll] = useState(false);

  const getDynamicChartData = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const chartData = [];

    // Get last 7 days starting from today going backwards, then reverse to go chronologically
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toDateString();
      const dayLabel = days[d.getDay()];

      let sentCount = 0;
      let openedCount = 0;
      let replyCount = 0;

      // Count single/CSV emails sent on this calendar day
      emailHistory.forEach(h => {
        if (h.date && new Date(h.date).toDateString() === dateStr) {
          sentCount += 1;
          if (h.opened || (h.opensCount && h.opensCount > 0) || h.status === 'Opened') {
            openedCount += 1;
          }
        }
      });

      // Count BCC emails sent on this calendar day
      bccHistory.forEach(h => {
        if (h.date && new Date(h.date).toDateString() === dateStr) {
          sentCount += (h.recipientCount || 0);
        }
      });

      // Count scanned replies received on this calendar day
      scannedReplies.forEach(r => {
        if (r.date && new Date(r.date).toDateString() === dateStr) {
          replyCount += 1;
        }
      });

      chartData.push({
        day: dayLabel,
        sentCount,
        openedCount,
        replyCount,
        dateStr: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      });
    }

    // Find the maximum value globally across all three metrics to scale proportionally
    const maxVal = Math.max(...chartData.map(d => Math.max(d.sentCount, d.openedCount, d.replyCount)), 1);

    return chartData.map(item => {
      const sentHeight = item.sentCount > 0 ? Math.max(8, Math.round((item.sentCount / maxVal) * 85)) : 0;
      const openedHeight = item.openedCount > 0 ? Math.max(8, Math.round((item.openedCount / maxVal) * 85)) : 0;
      const replyHeight = item.replyCount > 0 ? Math.max(8, Math.round((item.replyCount / maxVal) * 85)) : 0;
      return {
        ...item,
        sentHeight: `${sentHeight}%`,
        openedHeight: `${openedHeight}%`,
        replyHeight: `${replyHeight}%`
      };
    });
  };


  // Auto Agent State
  const [autoTargetTitle, setAutoTargetTitle] = useState('');
  const [autoLeads, setAutoLeads] = useState<any[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [isFetchingLeads, setIsFetchingLeads] = useState(false);

  // Inbox Scanner State
  const [isScanning, setIsScanning] = useState(false);
  const [scannedReplies, setScannedReplies] = useState<any[]>([]);
  const [scanFilter, setScanFilter] = useState('All');
  const [scanDays, setScanDays] = useState(7);
  const [expandedSummary, setExpandedSummary] = useState<Set<number>>(new Set());
  const [totalEmailsScanned, setTotalEmailsScanned] = useState(0);
  const [totalRepliesFromDb, setTotalRepliesFromDb] = useState(0);
  const hasAutoScanned = useRef(false);


  // Sidebar Collapse State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [hoveredNavItem, setHoveredNavItem] = useState<{id: string, label: string, top: number} | null>(null);

  // Credits & Payment State
  const [credits, setCredits] = useState(50);
  const [creditsExpiresAt, setCreditsExpiresAt] = useState<string | null>(null);
  const [showBuyCreditsModal, setShowBuyCreditsModal] = useState(false);

  // Deduct 1 credit — returns true if successful, false if insufficient
  const deductCredit = async (type: string, description: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/credits/deduct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, description }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCredits(data.credits);
        return true;
      }
      // Insufficient credits
      if (res.status === 402) {
        setCredits(data.credits ?? 0);
        toast.error('⚡ Credits khatam ho gaye! Please buy more credits.');
        setShowBuyCreditsModal(true);
        return false;
      }
      toast.error(data.error || 'Credit deduction failed');
      return false;
    } catch (err) {
      console.error('Credit deduction error:', err);
      toast.error('Failed to verify credits. Please try again.');
      return false;
    }
  };

  // Settings State
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [defaultAiModel, setDefaultAiModel] = useState('gemini');
  const [dailyLimit, setDailyLimit] = useState(50);
  const [signature, setSignature] = useState('');

  const handleScanReplies = async () => {
    // Collect all sent emails
    const sentEmailsSet = new Set<string>();
    emailHistory.forEach(r => sentEmailsSet.add(r.recruiterEmail));

    const sentEmails = Array.from(sentEmailsSet);
    if (sentEmails.length === 0) {
      toast.success("No sent emails found in your history. You must send applications before scanning for replies.");
      return;
    }

    setIsScanning(true);

    // Calculate "Emails Scanned" = emails WE sent in the selected time period
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - scanDays);
    const sentInPeriod = emailHistory.filter(h => {
      if (!h.date) return false;
      return new Date(h.date) >= cutoffDate;
    });
    setTotalEmailsScanned(sentInPeriod.length);

    // No skip — always re-scan and re-classify all replies so corrections apply
    const skipMessageIds: string[] = [];

    try {
      const providerToken = await getValidProviderToken();
      if (!providerToken) {
        toast.error("Your Google connection token has expired or is missing. Please Sign Out and Sign In again.");
        setIsScanning(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch('/api/gmail/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${providerToken}`
        },
        body: JSON.stringify({ sentEmails, days: scanDays, skipMessageIds })
      });

      const data = await res.json();
      if (res.ok) {
        const newReplies = data.classified_emails || [];

        // Upsert new replies into DB (duplicates are handled by unique constraint)
        if (session?.user?.id && newReplies.length > 0) {
          const dbReplies = newReplies.map((r: any) => ({
            user_id: session.user.id,
            message_id: r.messageId,
            sender_name: r.senderName,
            sender_email: r.senderEmail,
            subject: r.subject,
            category: r.category,
            summary: r.summary,
            date: r.date,
          }));

          try {
            const { error } = await supabase
              .from('scanned_replies')
              .upsert(dbReplies, { onConflict: 'user_id,message_id', ignoreDuplicates: false });
            if (error) {
              console.error("Scanned replies upsert error:", error.message);
            }
          } catch (dbErr) {
            console.error("Scanned replies DB upsert failed:", dbErr);
          }
        }

        // Fetch updated scanned replies from DB to keep the local state in sync with all replies
        if (session?.user?.id) {
          const { data: replies } = await supabase
            .from('scanned_replies')
            .select('*')
            .eq('user_id', session.user.id)
            .order('date', { ascending: false });

          if (replies) {
            setScannedReplies(replies.map(r => ({
              messageId: r.message_id,
              senderName: r.sender_name,
              senderEmail: r.sender_email,
              subject: r.subject,
              category: r.category,
              summary: r.summary,
              date: r.date
            })));
            setTotalRepliesFromDb(replies.length);
          }
        }
      } else {
        toast.error("Scan failed: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      toast.error("Error scanning inbox: " + err);
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    // Load theme
    const savedTheme = (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
    setTheme(savedTheme);
    if (savedTheme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }

    // Load other settings
    const savedModel = localStorage.getItem('default_ai_model') || 'gemini';
    setDefaultAiModel(savedModel);
    setAiModel(savedModel);

    const savedLimit = parseInt(localStorage.getItem('daily_limit') || '50', 10);
    setDailyLimit(savedLimit);

    const savedSig = localStorage.getItem('email_signature') || '';
    setSignature(savedSig);
  }, []);

  // Auto-scan replies when user opens the Inbox tab for the first time
  useEffect(() => {
    if (activeTab === 'inbox' && !hasAutoScanned.current && !isScanning && emailHistory.length > 0) {
      hasAutoScanned.current = true;
      handleScanReplies();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);


  const handleSaveProfile = async () => {
    if (!user) return;
    setIsSavingProfile(true);

    // Auto-generate signature if it is currently empty
    let newSig = signature;
    if (!signature.trim()) {
      const lines = [`Regards,`, profileFullName || 'Your Name'];
      const details = [profileCurrentTitle, profilePhone].filter(Boolean).join(' | ');
      if (details) lines.push(details);
      if (profileLinkedin) lines.push(profileLinkedin);
      if (profileGithub) lines.push(profileGithub);
      if (profilePortfolio) lines.push(profilePortfolio);
      newSig = lines.join('\n');
      setSignature(newSig);
      localStorage.setItem('email_signature', newSig);
    }

    try {
      const { error } = await supabase.from('user_profiles').upsert({
        user_id: user.id,
        full_name: profileFullName,
        phone: profilePhone,
        linkedin_url: profileLinkedin,
        github_url: profileGithub,
        portfolio_url: profilePortfolio,
        current_title: profileCurrentTitle,
        experience_level: profileExperienceLevel,
        default_tone_style: profileToneStyle,
        default_job_type: profileJobType,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });

      if (error) throw error;
      setIsProfileModalOpen(false);
    } catch (err: any) {
      toast.error("Error saving profile: " + err.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleThemeChange = (newTheme: 'dark' | 'light') => {
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.cookie = `theme=${newTheme};path=/;max-age=31536000`;
    if (newTheme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  };

  const handleSaveSettings = () => {
    localStorage.setItem('default_ai_model', defaultAiModel);
    localStorage.setItem('daily_limit', dailyLimit.toString());
    localStorage.setItem('email_signature', signature);
    toast.success("Settings saved successfully! ✅");
  };

  useEffect(() => {
    let mounted = true;
    let isInitialized = false;

    const initializeSession = async (activeSession: any) => {
      if (isInitialized) return;
      isInitialized = true;
      
      const user = activeSession.user;
      setUser(user);

      // Cache provider tokens if present in this session (e.g., right after login)
      if (activeSession.provider_token) {
        localStorage.setItem('cached_provider_token', activeSession.provider_token);
      }
      if (activeSession.provider_refresh_token) {
        localStorage.setItem('cached_provider_refresh_token', activeSession.provider_refresh_token);
      }

      // Load Profile (Resume)
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      // Check if user just completed the onboarding flow
      const rawOnboardingData = localStorage.getItem('onboarding_data');
      let onboardingData: any = null;
      if (rawOnboardingData) {
        try {
          onboardingData = JSON.parse(rawOnboardingData);
        } catch { /* ignore parse errors */ }
        localStorage.removeItem('onboarding_data');
      }

      if (onboardingData && (!profile || !profile.full_name)) {
        // New user from onboarding — upsert collected data to Supabase
        const upsertPayload: any = {
          user_id: user.id,
          updated_at: new Date().toISOString(),
        };
        if (onboardingData.full_name) upsertPayload.full_name = onboardingData.full_name;
        if (onboardingData.current_title) upsertPayload.current_title = onboardingData.current_title;
        if (onboardingData.phone) upsertPayload.phone = onboardingData.phone;
        if (onboardingData.linkedin_url) upsertPayload.linkedin_url = onboardingData.linkedin_url;
        if (onboardingData.github_url) upsertPayload.github_url = onboardingData.github_url;
        if (onboardingData.portfolio_url) upsertPayload.portfolio_url = onboardingData.portfolio_url;
        if (onboardingData.experience_level) upsertPayload.experience_level = onboardingData.experience_level;
        if (onboardingData.default_tone_style) upsertPayload.default_tone_style = onboardingData.default_tone_style;
        if (onboardingData.default_job_type) upsertPayload.default_job_type = onboardingData.default_job_type;

        // Preserve any existing resume data if profile already exists
        if (profile?.resume_text) upsertPayload.resume_text = profile.resume_text;
        if (profile?.resume_base64) upsertPayload.resume_base64 = profile.resume_base64;

        await supabase.from('user_profiles').upsert(upsertPayload, { onConflict: 'user_id' });

        // Set local state from onboarding data
        setProfileFullName(onboardingData.full_name || '');
        setProfileCurrentTitle(onboardingData.current_title || '');
        setProfilePhone(onboardingData.phone || '');
        setProfileLinkedin(onboardingData.linkedin_url || '');
        setProfileGithub(onboardingData.github_url || '');
        setProfilePortfolio(onboardingData.portfolio_url || '');
        setProfileExperienceLevel(onboardingData.experience_level || '');
        setProfileToneStyle(onboardingData.default_tone_style || '');
        setProfileJobType(onboardingData.default_job_type || '');
        setResumeText(profile?.resume_text || '');
        setResumeBase64(profile?.resume_base64 || '');

        if (onboardingData.experience_level) setExperienceLevel(onboardingData.experience_level);
        if (onboardingData.default_tone_style) setToneStyle(onboardingData.default_tone_style);
        if (onboardingData.default_job_type) setJobType(onboardingData.default_job_type);

        // Don't show ProfileModal — data was already collected during onboarding
      } else if (profile) {
        setResumeText(profile.resume_text || '');
        setResumeBase64(profile.resume_base64 || '');
        setProfileFullName(profile.full_name || '');
        setProfilePhone(profile.phone || '');
        setProfileLinkedin(profile.linkedin_url || '');
        setProfileGithub(profile.github_url || '');
        setProfilePortfolio(profile.portfolio_url || '');
        setProfileCurrentTitle(profile.current_title || '');
        setProfileExperienceLevel(profile.experience_level || '');
        setProfileToneStyle(profile.default_tone_style || '');
        setProfileJobType(profile.default_job_type || '');

        if (profile.experience_level) setExperienceLevel(profile.experience_level);
        if (profile.default_tone_style) setToneStyle(profile.default_tone_style);
        if (profile.default_job_type) setJobType(profile.default_job_type);

        // Profile modal no longer auto-opens for new users.
        // Onboarding page (/onboarding) handles initial profile setup.
      } else {
        // No profile row exists — should not happen after onboarding,
        // but if it does, the user can edit via the sidebar profile card.
      }

      // Load email history
      const { data: emails } = await supabase
        .from('email_history')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (emails) {
        setEmailHistory(emails.map(e => ({
          id: e.id,
          company: e.company,
          jobTitle: e.job_title,
          recruiterEmail: e.recruiter_email,
          status: e.status,
          date: e.date,
          messageId: e.message_id,
          opened: e.opened || false,
          openedAt: e.opened_at || null,
          opensCount: e.opens_count || 0
        })));
      }

      // Load BCC history
      const { data: bcc } = await supabase
        .from('bcc_history')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (bcc) {
        setBccHistory(bcc.map(b => ({
          id: b.id,
          subject: b.subject,
          recipientCount: b.recipient_count,
          status: b.status,
          date: b.date,
          messageId: b.message_id
        })));
      }

      // Load Scanned Replies
      const { data: replies } = await supabase
        .from('scanned_replies')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (replies) {
        setScannedReplies(replies.map(r => ({
          messageId: r.message_id,
          senderName: r.sender_name,
          senderEmail: r.sender_email,
          subject: r.subject,
          category: r.category,
          summary: r.summary,
          date: r.date
        })));
        setTotalRepliesFromDb(replies.length);
      }

      // Load CSV Campaign History
      const { data: csvCampaigns } = await supabase
        .from('csv_campaign_history')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false });

      if (csvCampaigns) {
        setCsvCampaignHistory(csvCampaigns.map(c => ({
          id: c.id,
          csvName: c.csv_name,
          totalEmails: c.total_emails,
          sentCount: c.sent_count,
          failedCount: c.failed_count,
          jobTitle: c.job_title,
          status: c.status,
          date: c.date
        })));
      }

      // Load Credits Balance
      try {
        const creditsRes = await fetch('/api/credits');
        if (creditsRes.ok) {
          const creditsData = await creditsRes.json();
          setCredits(creditsData.credits ?? 50);
          setCreditsExpiresAt(creditsData.expires_at || null);
        }
      } catch (err) {
        console.warn('Failed to load credits:', err);
      }
      
      if (mounted) setIsAuthLoading(false);
    };

    // onAuthStateChange is the SOLE authority for client-side auth decisions.
    // The middleware already protects /dashboard server-side, so we do NOT
    // redirect to '/' if INITIAL_SESSION has no session — that would cause
    // the race condition where the user gets bounced back to landing.
    //
    // Events handled:
    // - INITIAL_SESSION: Fires once when Supabase finishes processing any tokens.
    //   If there's a session, initialize the dashboard. If not, do nothing
    //   (middleware already redirected if the user is truly unauthenticated).
    // - SIGNED_IN / TOKEN_REFRESHED: Initialize session (handles tab refocus, etc.)
    // - SIGNED_OUT: Redirect to landing page.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;

      if (event === 'INITIAL_SESSION') {
        if (newSession) {
          initializeSession(newSession);
        } else {
          // Don't redirect here — middleware handles it.
          // The session might still be loading from cookies.
          // As a safety net, try getSession() after a short delay.
          setTimeout(async () => {
            if (!mounted || isInitialized) return;
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              initializeSession(session);
            } else {
              // Truly no session — redirect to login
              router.push('/');
            }
          }, 500);
        }
      } else if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && newSession) {
        initializeSession(newSession);
      } else if (event === 'SIGNED_OUT') {
        router.push('/');
      }
    });
    
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  // Real-time email tracking updates subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('email_history_realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'email_history',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new;
            setEmailHistory(prev =>
              prev.map(item =>
                item.id === updated.id
                  ? {
                    ...item,
                    status: updated.status,
                    opened: updated.opened || false,
                    openedAt: updated.opened_at || null,
                    opensCount: updated.opens_count || 0
                  }
                  : item
              )
            );
          } else if (payload.eventType === 'INSERT') {
            const inserted = payload.new;
            setEmailHistory(prev => {
              if (prev.some(item => item.id === inserted.id)) return prev;
              return [
                {
                  id: inserted.id,
                  company: inserted.company,
                  jobTitle: inserted.job_title,
                  recruiterEmail: inserted.recruiter_email,
                  status: inserted.status,
                  date: inserted.date,
                  messageId: inserted.message_id,
                  opened: inserted.opened || false,
                  openedAt: inserted.opened_at || null,
                  opensCount: inserted.opens_count || 0
                },
                ...prev
              ];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPreview(false);
      }
    };
    if (showPreview) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showPreview]);

  // Auto-sync newly generated drafts into an open Review modal
  useEffect(() => {
    if (selectedCsvIndex !== null && csvStatuses[selectedCsvIndex]) {
      const statusRow = csvStatuses[selectedCsvIndex];
      // If the modal is open and empty, and the draft just finished generating, auto-fill it
      if (statusRow.status === 'draft_ready' && statusRow.body && !previewBody) {
        setPreviewSubject(statusRow.subject || csvSubject || '');
        setPreviewBody(statusRow.body);
      }
    }
  }, [csvStatuses, selectedCsvIndex, previewBody, csvSubject]);

  const handleSignOut = () => {
    setIsLogoutConfirmOpen(true);
  };

  const executeSignOut = async () => {
    setIsLogoutConfirmOpen(false);
    localStorage.removeItem('cached_provider_token');
    await supabase.auth.signOut();
    router.push('/');
  };

  const getValidProviderToken = async () => {
    // Check cached token first
    const cached = localStorage.getItem('cached_provider_token');
    if (cached) {
      const test = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${cached}` } });
      if (test.ok) return cached;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    // Test session token
    if (session.provider_token) {
      const test2 = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${session.provider_token}` } });
      if (test2.ok) return session.provider_token;
    }

    // Refresh if failed
    const refreshToken = session.provider_refresh_token || localStorage.getItem('cached_provider_refresh_token');
    if (refreshToken) {
      console.log("Token expired, requesting refresh...");
      const refreshRes = await fetch('/api/gmail/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_refresh_token: refreshToken })
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        localStorage.setItem('cached_provider_token', data.provider_token);
        return data.provider_token;
      } else {
        // If refresh fails, clear caches
        localStorage.removeItem('cached_provider_token');
        localStorage.removeItem('cached_provider_refresh_token');
      }
    }
    return null;
  };

  const handleGenerate = async () => {
    if (!company || !jobTitle) {
      toast.error("Please enter company and job title.");
      return;
    }

    if (!resumeText) {
      const proceed = confirm("Aapne resume upload nahi kiya hai. AI bina aapke details ke generic draft banayega. Kya aap continue karna chahte hain?");
      if (!proceed) return;
    }

    // Check and deduct credit before generation
    const hasCredit = await deductCredit('generation', `Single email for ${jobTitle} at ${company}`);
    if (!hasCredit) return;

    setIsGenerating(true);
    setDraft('');

    try {
      const greetingName = recruiterName ? recruiterName : "Hiring Manager";
      const promptObj: any = {
        task: "Write a deeply personalized, human-sounding, high-conversion job application email. Every sentence must contain at least one detail from the candidate's resume. The email should read as if the candidate wrote it themselves, not an AI.",
        candidate_details: {
          resume_context: resumeText ? resumeText.substring(0, 2000) : "No resume provided."
        },
        job_details: {
          company: company,
          job_title: jobTitle,
          job_type: jobType,
          job_description: jobDescription || "Not provided",
          job_post_url: jobPostUrl || "Not provided",
          recruiter_name: greetingName,
          experience_level: experienceLevel
        },
        generation_preferences: {
          tone_style: toneStyle,
          tone_style_instruction: `CRITICAL: You MUST write the entire email in the '${toneStyle}' style. This is NON-NEGOTIABLE. The tone, vocabulary, sentence structure, and energy level must ALL match this style perfectly. Do NOT default to a generic professional tone — match the EXACT quality and style the user has chosen.`,
          output_format: "Strict JSON only",
          length_target: "3-5 detailed paragraphs, complete and untruncated"
        },
        resume_analysis_priority: [
          "STEP 1: Before writing, deeply analyze resume_context. Extract: full name, years of experience, job titles held, companies worked at, tech stack, programming languages, frameworks, tools, certifications, education, projects with scale/metrics, achievements with numbers/percentages, leadership experience, domain expertise.",
          "STEP 2: Identify the TOP 3-4 strongest signals from the resume that directly match the target job_title and company domain.",
          "STEP 3: For each signal, prepare a specific proof point with numbers/metrics/scale if available."
        ],
        instructions: [
          "Return ONLY valid JSON with keys: subject, body.",
          "Do NOT start body with 'Subject:'. Subject goes in its own JSON key.",
          "Do NOT use unescaped double quotes in body. Use single quotes instead.",
          "Ensure all newlines are properly escaped as \\n.",
          `GREETING RULE (MANDATORY): The email body MUST start with 'Dear ${greetingName},' or 'Hi ${greetingName},' on the very first line. Do NOT use 'Hi,' or 'Dear,' alone without a name. Do NOT use placeholder names like '[Name]' or '[Hiring Manager]'. Use the exact recruiter_name value: '${greetingName}'.`,
          "SUBJECT LINE RULES (STRICTLY ENFORCED):",
          "- Subject MUST be PLAIN TEXT ONLY. Absolutely NO markdown, NO asterisks (*), NO bold (**), NO underscores (_), NO hashtags (#), NO backticks, NO brackets. Just clean readable text.",
          "- Subject must include a specific skill/achievement from resume. Not generic.",
          "- Example: 'ML Engineer with 50k/day Pipeline Experience - Application for Senior AI Role'",
          "CRITICAL PERSONALIZATION RULES:",
          "- The resume_context is your PRIMARY data source. Mine it exhaustively.",
          "- Extract and USE: specific project names, company names, tech stack, metrics, percentages, team sizes, user counts, revenue impact, years of experience.",
          "- Every paragraph MUST contain at least one specific detail from the resume. No generic paragraphs allowed.",
          "- If the resume mentions '50% improvement' or '10k users' or '3 years experience', USE those exact numbers.",
          "- Connect resume achievements DIRECTLY to what the target company/role needs.",
          "- Name specific technologies from the resume that match the job requirements.",
          "ANTI-GENERIC RULES (STRICTLY ENFORCED):",
          "- NEVER write 'I am a passionate developer' or 'I am excited about this opportunity' or similar generic openings.",
          "- NEVER write 'I believe I would be a great fit' without immediately proving WHY with resume evidence.",
          "- NEVER use filler phrases like 'with my extensive background', 'leveraging my skills', 'strong foundation in'.",
          "- If you catch yourself writing a generic sentence, replace it with a specific resume-backed claim.",
          `TONE & STYLE ENFORCEMENT (MANDATORY): Write the ENTIRE email in '${toneStyle}' style. This means every sentence, word choice, and paragraph flow must reflect this tone. Do NOT ignore this — it is the user's explicit quality preference.`,
          "EMAIL STRUCTURE:",
          "- Opening: Start with a specific hook connecting a resume achievement to the company's domain/product. Example: 'Having built a real-time ML pipeline serving 50k predictions/day at [Previous Company], I was immediately drawn to [Company]'s work in...'.",
          "- Middle (1-2 paragraphs): Present 3-4 concrete proof points from resume. Use **bold** for key metrics and achievements in the BODY ONLY. Connect each to the target role.",
          "- Closing: Specific ask for a 10-15 minute chat. Mention what you'd love to discuss (something specific to the role).",
          "Tailor to experience_level: fresher = projects + learning velocity + academic achievements; mid = ownership + delivery + metrics; senior = scale + leadership + architecture + business impact.",
          "Tailor to job_type: internship = potential + projects; full-time = proven delivery; contract = fast ramp-up + domain expertise.",
          "FORMATTING: Use markdown ONLY in the email body (** for bold, - for bullet points, 1. 2. for lists). The subject line must have ZERO markdown. NO HTML tags anywhere.",
          "NEVER truncate. Complete every sentence.",
          "Do NOT include any closing sign-off, signature, name, or 'Sincerely/Regards/Best' at the end. The user's signature is automatically appended by the system.",
          "If job_description is provided, map resume skills to JD requirements explicitly."
        ]
      };

      const prompt = JSON.stringify(promptObj);

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model: aiModel })
      });

      const data = await res.json();
      if (res.ok) {
        const { subject: generatedSubject, body: generatedBody } = parseAIResponse(
          data.text,
          `Application for ${jobTitle} at ${company} - ${user?.email || 'Candidate'}`
        );

        // Post-process: fix greeting if AI missed or used placeholder name
        let finalBody = generatedBody;
        const greetingFixName = recruiterName || 'Hiring Manager';
        // Fix patterns like "Hi," "Dear," "Hi ," "Dear ," (no name after greeting)
        finalBody = finalBody.replace(/^(Hi|Dear|Hello)\s*,/i, `$1 ${greetingFixName},`);
        // Fix placeholder patterns like "[Name]", "[Hiring Manager]", "[Recruiter Name]"
        finalBody = finalBody.replace(/\[(Name|Hiring Manager|Recruiter Name|Recruiter|HR Manager)\]/gi, greetingFixName);

        if (signature && !finalBody.includes(signature)) {
          finalBody += `\n\n${signature}`;
        }
        setDraft(finalBody);
        setSubject(generatedSubject);
      } else {
        toast.error("Error: " + data.error);
      }
    } catch (err: any) {
      toast.error("Failed to generate draft.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingResume(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target?.result as string;
      try {
        const res = await fetch('/api/resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Data })
        });
        const data = await res.json();
        if (res.ok) {
          setResumeText(data.text);
          setResumeBase64(base64Data);

          // Save to Supabase for persistence
          if (user?.id) {
            await supabase.from('user_profiles').upsert({
              user_id: user.id,
              resume_text: data.text,
              resume_base64: base64Data,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id' });
          }

          toast.success("Resume processed and saved!");
        } else {
          toast.error("Error parsing PDF: " + data.error);
        }
      } catch (err) {
        toast.error("Failed to upload resume.");
      } finally {
        setIsUploadingResume(false);
      }
    };
    reader.readAsDataURL(file);
  };


  const handleSendEmail = async () => {
    if (!recruiterEmail) {
      toast.error("Please enter the Recruiter Email.");
      return;
    }
    if (!draft) {
      toast.success("Please generate a draft first.");
      return;
    }

    try {
      const providerToken = await getValidProviderToken();

      if (!providerToken) {
        toast.success("Your Google connection token has expired or is missing. Please Sign Out and Sign In again to authorize Gmail.");
        return;
      }

      setIsSending(true);

      // Convert markdown **bold** to <strong> and newlines to <br/>
      let formattedDraft = draft.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      formattedDraft = formattedDraft.replace(/\n/g, '<br/>');

      const trackingId = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : (Math.random().toString(36).substring(2) + Date.now().toString(36));

      const trackingServerBase = process.env.NEXT_PUBLIC_TRACKING_SERVER_URL || window.location.origin;
      const trackingUrl = trackingServerBase.includes('your-deployed-tracking-server')
        ? `${window.location.origin}/api/track?id=${trackingId}`
        : `${trackingServerBase}/track?id=${trackingId}`;

      const trackingPixel = `<img src="${trackingUrl}" width="1" height="1" style="display:none;width:1px;height:1px;" alt="" />`;
      const htmlBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">${formattedDraft}</div>${trackingPixel}`;

      const res = await fetch('/api/gmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${providerToken}`
        },
        body: JSON.stringify({
          to: recruiterEmail,
          subject: subject,
          htmlBody: htmlBody,
          attachmentBase64: resumeBase64 || null,
          filename: resumeBase64 ? "Resume.pdf" : undefined
        })
      });

      const data = await res.json();
      if (res.ok) {
        const newRecord = {
          id: trackingId,
          user_id: user.id,
          company,
          job_title: jobTitle,
          recruiter_email: recruiterEmail,
          status: 'Sent',
          date: new Date().toISOString(),
          message_id: data.messageId
        };

        // Insert into Supabase
        const { data: inserted, error } = await supabase.from('email_history').insert([newRecord]).select().single();

        if (inserted && !error) {
          const uiRecord = {
            id: inserted.id,
            company: inserted.company,
            jobTitle: inserted.job_title,
            recruiterEmail: inserted.recruiter_email,
            status: inserted.status,
            date: inserted.date,
            messageId: inserted.message_id,
            opened: inserted.opened || false,
            openedAt: inserted.opened_at || null,
            opensCount: inserted.opens_count || 0
          };
          setEmailHistory([uiRecord, ...emailHistory]);
        }


        toast.success(`Email sent successfully! Message ID: ${data.messageId}`);
        setCompany("");
        setJobTitle("");
        setRecruiterName("");
        setRecruiterEmail("");
        setJobPostUrl("");
        setJobDescription("");
        setSubject("");
        setDraft("");
      } else {
        toast.error("Error sending email: " + data.error);
      }
    } catch (err: any) {
      toast.error("Failed to send email. " + err.message);
    } finally {
      setIsSending(false);
    }
  };

  const handleBccGenerate = async () => {
    if (!bccJobTitle) {
      toast.error("Please enter a Job Title Targeting value.");
      return;
    }

    if (!resumeText) {
      const proceed = confirm("Aapne resume upload nahi kiya hai. AI bina aapke details ke generic draft banayega. Kya aap continue karna chahte hain?");
      if (!proceed) return;
    }

    // Check and deduct credit before BCC generation
    const hasCredit = await deductCredit('generation', `BCC email for ${bccJobTitle}`);
    if (!hasCredit) return;

    setIsGeneratingBcc(true);
    setBccDraft('');

    try {
      const promptObj: any = {
        task: "Write a deeply personalized, human-sounding job application email for bulk sending. Every sentence must draw from the candidate's resume. Do NOT mention any specific company name since this goes to multiple companies.",
        candidate_details: {
          resume_context: resumeText ? resumeText.substring(0, 2000) : "No resume provided."
        },
        job_details: {
          job_title: bccJobTitle,
          note: "This email will be sent to MULTIPLE companies. Do NOT include any specific company name."
        },
        generation_preferences: {
          tone_style: toneStyle,
          tone_style_instruction: `CRITICAL: You MUST write the entire email in the '${toneStyle}' style. This is NON-NEGOTIABLE. The tone, vocabulary, sentence structure, and energy level must ALL match this style perfectly.`,
          output_format: "Strict JSON only",
          length_target: "3-5 detailed paragraphs, complete and untruncated"
        },
        instructions: [
          "Return ONLY valid JSON with keys: subject, body.",
          "Do NOT start body with 'Subject:'.",
          "Do NOT mention any specific company name. Use 'your team' or 'your organization' instead.",
          "SUBJECT LINE RULES (STRICTLY ENFORCED): Subject MUST be PLAIN TEXT ONLY. Absolutely NO markdown, NO asterisks (*), NO bold (**), NO underscores (_), NO hashtags (#), NO backticks. Just clean readable text.",
          "FORMATTING: Use markdown ONLY in the email body (** for bold, - for bullets, 1. 2. for numbered lists). NO HTML tags. NO markdown in subject.",
          "Start directly with the greeting (Dear Hiring Manager,). GREETING RULE (MANDATORY): The email body MUST start with 'Dear Hiring Manager,' or 'Hi Hiring Manager,' on the very first line. Do NOT use 'Hi,' or 'Dear,' alone without a name. Do NOT use placeholder names like '[Name]'.",
          `TONE & STYLE ENFORCEMENT (MANDATORY): Write the ENTIRE email in '${toneStyle}' style. Every sentence, word choice, and paragraph flow must reflect this tone exactly as the user wants.`,
          "RESUME PERSONALIZATION (MANDATORY):",
          "- Extract specific projects, metrics, tech stack, years of experience, achievements from resume_context.",
          "- Every paragraph must contain at least one specific resume detail.",
          "- Use exact numbers/percentages/metrics from resume.",
          "- Present 3-4 concrete proof points with **bold** emphasis on key achievements IN THE BODY ONLY.",
          "- NO generic filler like 'passionate developer' or 'extensive background'.",
          "- Opening must lead with the candidate's strongest resume achievement relevant to the role.",
          "NEVER truncate. Complete every sentence.",
          "Do NOT include any closing sign-off, signature, name, or 'Sincerely/Regards/Best' at the end. The user's signature is automatically appended by the system."
        ]
      };
      const prompt = JSON.stringify(promptObj);

      if (!bccSubject) {
        setBccSubject(`Application for ${bccJobTitle} - ${user?.email || 'Candidate'}`);
      }

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model: aiModel })
      });

      const data = await res.json();
      if (res.ok) {
        const { subject: generatedSubject, body: generatedBody } = parseAIResponse(
          data.text,
          `Application for ${bccJobTitle} - ${user?.email || 'Candidate'}`
        );
        let finalBody = generatedBody;
        // Post-process: fix greeting name
        finalBody = finalBody.replace(/^(Hi|Dear|Hello)\s*,/i, '$1 Hiring Manager,');
        finalBody = finalBody.replace(/\[(Name|Hiring Manager|Recruiter Name|Recruiter|HR Manager|Hiring Team)\]/gi, 'Hiring Manager');

        if (signature && !finalBody.includes(signature)) {
          finalBody += `\n\n${signature}`;
        }
        setBccDraft(finalBody);
        setBccSubject(generatedSubject);
      } else {
        toast.error("Error: " + data.error);
      }
    } catch (err: any) {
      toast.error("Failed to generate BCC draft.");
    } finally {
      setIsGeneratingBcc(false);
    }
  };

  const handleBccSend = async () => {
    if (!bccEmails) {
      toast.error("Please enter recipient emails in the BCC field.");
      return;
    }
    if (!bccDraft) {
      toast.success("Please generate a draft first.");
      return;
    }

    try {
      const providerToken = await getValidProviderToken();

      if (!providerToken) {
        toast.success("Your Google connection token has expired or is missing. Please Sign Out and Sign In again.");
        return;
      }

      setIsSendingBcc(true);

      let formattedDraft = bccDraft.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      formattedDraft = formattedDraft.replace(/\n/g, '<br/>');

      const htmlBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">${formattedDraft}</div>`;

      // Split and clean emails
      const emailList = bccEmails.split(',').map(e => e.trim()).filter(e => e.length > 0);

      const res = await fetch('/api/gmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${providerToken}`
        },
        body: JSON.stringify({
          bcc: emailList.join(', '),
          subject: bccSubject,
          htmlBody: htmlBody,
          attachmentBase64: resumeBase64 || null,
          filename: resumeBase64 ? "Resume.pdf" : undefined
        })
      });

      let data;
      const resText = await res.text();
      try {
        data = JSON.parse(resText);
      } catch (e) {
        console.error("Backend returned HTML instead of JSON:", resText);
        toast.error(`Server error (HTML returned). Status: ${res.status}. Check console for details.`);
        setIsSendingBcc(false);
        return;
      }

      if (res.ok) {
        const newRecord = {
          user_id: user.id,
          subject: bccSubject,
          recipient_count: emailList.length,
          status: 'Sent',
          date: new Date().toISOString(),
          message_id: data.messageId
        };

        // Insert into Supabase
        const { data: inserted, error } = await supabase.from('bcc_history').insert([newRecord]).select().single();

        if (inserted && !error) {
          const uiRecord = {
            id: inserted.id,
            subject: inserted.subject,
            recipientCount: inserted.recipient_count,
            status: inserted.status,
            date: inserted.date,
            messageId: inserted.message_id
          };
          setBccHistory([uiRecord, ...bccHistory]);
        } else {
          // Fallback to local state if Supabase fails (e.g. column not added yet)
          const uiRecord = {
            id: Date.now(),
            subject: newRecord.subject,
            recipientCount: newRecord.recipient_count,
            status: newRecord.status,
            date: newRecord.date,
            messageId: newRecord.message_id
          };
          setBccHistory([uiRecord, ...bccHistory]);
          console.warn("Supabase insertion failed, using local state fallback:", error);
        }

        toast.success(`Bulk BCC sent successfully to ${emailList.length} recipients! Message ID: ${data.messageId}`);
        setBccEmails("");
        setBccJobTitle("");
        setBccSubject("");
        setBccDraft("");
      } else {
        toast.error("Error sending bulk BCC: " + data.error);
      }
    } catch (err: any) {
      toast.error("Failed to send bulk BCC. " + err.message);
    } finally {
      setIsSendingBcc(false);
    }
  };

  const saveCsvCampaign = async (sentCount: number, failedCount: number) => {
    if (!user) return;
    const campaignRecord = {
      user_id: user.id,
      csv_name: csvFileName || 'Unnamed CSV',
      total_emails: csvData.length,
      sent_count: sentCount,
      failed_count: failedCount,
      job_title: csvJobTitle || 'N/A',
      status: failedCount === 0 && sentCount > 0 ? 'completed' : 'partial',
      date: new Date().toISOString()
    };

    try {
      if (currentCampaignId) {
        // UPDATE existing record
        const { data, error } = await supabase
          .from('csv_campaign_history')
          .update({
            sent_count: sentCount,
            failed_count: failedCount,
            status: campaignRecord.status
          })
          .eq('id', currentCampaignId)
          .select()
          .single();

        if (data && !error) {
          setCsvCampaignHistory(prev => prev.map(c => c.id === currentCampaignId ? {
            ...c,
            sentCount: data.sent_count,
            failedCount: data.failed_count,
            status: data.status
          } : c));
        }
      } else {
        // INSERT new record
        const { data: inserted, error } = await supabase
          .from('csv_campaign_history')
          .insert([campaignRecord])
          .select()
          .single();

        if (inserted && !error) {
          setCurrentCampaignId(inserted.id);
          setCsvCampaignHistory(prev => [{
            id: inserted.id,
            csvName: inserted.csv_name,
            totalEmails: inserted.total_emails,
            sentCount: inserted.sent_count,
            failedCount: inserted.failed_count,
            jobTitle: inserted.job_title,
            status: inserted.status,
            date: inserted.date
          }, ...prev]);
        }
      }
    } catch (err) {
      console.error('Failed to save CSV campaign record:', err);
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setCurrentCampaignId(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      const data: any[] = [];

      // Auto-detect delimiter: comma, semicolon, or tab
      let delimiter = ',';
      if (lines.length > 0) {
        if (lines[0].includes(';') && !lines[0].includes(',')) delimiter = ';';
        else if (lines[0].includes('\t') && !lines[0].includes(',')) delimiter = '\t';
      }

      const parseCsvLine = (line: string) => {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          if (line[i] === '"') inQuotes = !inQuotes;
          else if (line[i] === delimiter && !inQuotes) { result.push(cur.trim()); cur = ''; }
          else cur += line[i];
        }
        result.push(cur.trim());
        return result.map(s => s.replace(/^"|"$/g, '').trim());
      };

      if (lines.length >= 2) {
        const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase());
        const emailIdx = headers.findIndex(h => h.includes('email') || h.includes('mail'));
        const nameIdx = headers.findIndex(h => h === 'name' || h.includes('name') || h.includes('person') || h.includes('lead') || h.includes('candidate'));
        const compIdx = headers.findIndex(h => h.includes('company') || h.includes('organization') || h.includes('employer') || h.includes('firm'));
        const titleIdx = headers.findIndex(h => h.includes('title') || h.includes('role') || h.includes('job') || h.includes('position') || h.includes('designation'));

        if (emailIdx !== -1) {
          for (let i = 1; i < lines.length; i++) {
            const cols = parseCsvLine(lines[i]);
            const email = cols[emailIdx];
            if (email && email.includes('@')) {
              data.push({
                email,
                name: nameIdx !== -1 && cols[nameIdx] ? cols[nameIdx] : '',
                company: compIdx !== -1 && cols[compIdx] ? cols[compIdx] : '',
                title: titleIdx !== -1 && cols[titleIdx] ? cols[titleIdx] : ''
              });
            }
          }
        }
      }

      if (data.length === 0) {
        const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g;
        const found = text.match(emailRegex) || [];
        const uniqueEmails = Array.from(new Set(found));
        uniqueEmails.forEach(email => data.push({ email, name: '', company: '', title: '' }));
      }

      const uniqueData = data.filter((v, i, a) => a.findIndex(t => t.email === v.email) === i);

      if (uniqueData.length === 0) {
        toast.success("No valid emails found in the file.");
        return;
      }
      setCsvData(uniqueData);
      setCsvStatuses(uniqueData.map(row => ({
        email: row.email,
        status: 'pending',
        subject: '',
        body: '',
        approved: false
      })));
      setCsvMode('select');
    };
    reader.readAsText(file);
  };

  const handleTransferToBcc = () => {
    setBccEmails(csvData.map(r => r.email).join(', '));
    setOutreachTab('bulk');
  };

  const handleCsvGenerate = async () => {
    if (!csvJobTitle) {
      toast.error("Please enter a Job Title Targeting value.");
      return;
    }

    // Check and deduct credit before CSV template generation
    const hasCredit = await deductCredit('generation', `CSV template for ${csvJobTitle}`);
    if (!hasCredit) return;

    setIsGeneratingCsv(true);
    setCsvDraft('');
    try {
      const promptObj: any = {
        task: "Write a deeply personalized, human-sounding job application email for CSV bulk sending. Every sentence must draw from the candidate's resume. Do NOT mention any specific company name.",
        candidate_details: {
          resume_context: resumeText ? resumeText.substring(0, 2000) : "No resume provided."
        },
        job_details: {
          job_title: csvJobTitle,
          note: "This email will be sent individually to multiple recruiters. Do NOT include any specific company name."
        },
        generation_preferences: {
          tone_style: toneStyle,
          tone_style_instruction: `CRITICAL: You MUST write the entire email in the '${toneStyle}' style. This is NON-NEGOTIABLE. Match the tone, vocabulary, sentence structure, and energy level exactly.`,
          output_format: "Strict JSON only",
          length_target: "3-5 detailed paragraphs, complete and untruncated"
        },
        instructions: [
          "Return ONLY valid JSON with keys: subject, body.",
          "Do NOT start body with 'Subject:'.",
          "Do NOT mention any specific company name.",
          "SUBJECT LINE RULES (STRICTLY ENFORCED): Subject MUST be PLAIN TEXT ONLY. Absolutely NO markdown, NO asterisks (*), NO bold (**), NO underscores (_), NO hashtags (#), NO backticks. Just clean readable text.",
          "FORMATTING: Use markdown ONLY in the email body (** for bold, - for bullets, 1. 2. for numbered lists). NO HTML tags. NO markdown in subject.",
          "Start directly with the greeting.",
          `TONE & STYLE ENFORCEMENT (MANDATORY): Write the ENTIRE email in '${toneStyle}' style. Every sentence, word choice, and paragraph flow must reflect this tone exactly as the user wants.`,
          "RESUME PERSONALIZATION (MANDATORY):",
          "- Extract specific projects, metrics, tech stack, years of experience from resume_context.",
          "- Every paragraph must reference a specific resume detail.",
          "- Present 3-4 concrete proof points with **bold** emphasis IN THE BODY ONLY.",
          "- NO generic filler. Lead with strongest achievement.",
          "NEVER truncate. Complete every sentence.",
          "Do NOT include any closing sign-off, signature, name, or 'Sincerely/Regards/Best' at the end. The user's signature is automatically appended by the system."
        ]
      };
      const prompt = JSON.stringify(promptObj);

      if (!csvSubject) setCsvSubject(`Application for ${csvJobTitle} - ${user?.email || 'Candidate'}`);

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, model: aiModel })
      });
      const data = await res.json();
      if (res.ok) {
        const { subject: generatedSubject, body: generatedBody } = parseAIResponse(
          data.text,
          `Application for ${csvJobTitle} - ${user?.email || 'Candidate'}`
        );
        let finalBody = generatedBody;
        if (signature && !finalBody.includes(signature)) {
          finalBody += `\n\n${signature}`;
        }
        setCsvDraft(finalBody);
        setCsvSubject(generatedSubject);
      } else {
        toast.error("Error: " + data.error);
      }
    } catch (err: any) {
      toast.error("Failed to generate draft.");
    } finally {
      setIsGeneratingCsv(false);
    }
  };

  const generateDraftForRow = async (index: number, forceRegenerate = false, skipCredit = false) => {
    const row = csvData[index];
    const statusRow = csvStatuses[index];

    // If already generated and not forcing, return it
    if (statusRow && statusRow.body && !forceRegenerate) {
      return { subject: statusRow.subject, body: statusRow.body };
    }

    let finalDraft = csvDraft;
    let finalSubject = csvSubject || `Application for ${row.title || csvJobTitle || 'Open Role'} - ${user?.email || 'Candidate'}`;
    let aiFailed = false;

    if (row.company && row.title) {
      // Deduct credit for individual CSV row AI generation if not skipped
      if (!skipCredit) {
        const hasCredit = await deductCredit('generation', `CSV row: ${row.title} at ${row.company}`);
        if (!hasCredit) {
          setCsvStatuses(prev => {
            const next = [...prev];
            next[index] = { ...next[index], status: 'error' };
            return next;
          });
          return { subject: finalSubject, body: finalDraft };
        }
      }
      try {
        const targetTitle = row.title;
        const rowTone = row.tone_style || row.toneStyle || toneStyle;
        const greetingName = row.name ? row.name : "Hiring Manager";
        const promptObj: any = {
          task: "Write a deeply personalized, human-sounding, high-conversion job application email. Every sentence must contain at least one detail from the candidate's resume. The email should read as if the candidate wrote it themselves, not an AI.",
          candidate_details: {
            resume_context: resumeText ? resumeText.substring(0, 2000) : "No resume provided."
          },
          job_details: {
            company_name: row.company || 'Not provided',
            job_title: targetTitle || 'Not provided',
            job_description: row.description || 'Not provided',
            job_type: row.job_type || row.jobType || jobType,
            experience_level: row.experience_level || row.experienceLevel || experienceLevel,
            recruiter_name: row.name || 'Not provided'
          },
          generation_preferences: {
            tone_style: rowTone,
            tone_style_instruction: `CRITICAL: You MUST write the entire email in the '${rowTone}' style. This is NON-NEGOTIABLE. Match the tone, vocabulary, sentence structure, and energy level exactly.`,
            output_format: "Strict JSON only",
            length_target: "3-5 detailed paragraphs, complete and untruncated"
          },
          resume_analysis_priority: [
            "STEP 1: Deeply analyze resume_context. Extract: name, years of experience, companies, tech stack, projects with metrics, achievements with numbers, education, certifications.",
            "STEP 2: Identify TOP 3-4 signals matching the target job_title and company domain.",
            "STEP 3: Prepare specific proof points with numbers/metrics/scale."
          ],
          instructions: [
            "Return ONLY valid JSON with keys: subject, body.",
            "Do NOT start body with 'Subject:'. Subject goes in its own JSON key.",
            "Do NOT use unescaped double quotes in body. Use single quotes instead.",
            "Ensure all newlines are properly escaped as \\n.",
            "SUBJECT LINE RULES (STRICTLY ENFORCED): Subject MUST be PLAIN TEXT ONLY. Absolutely NO markdown, NO asterisks (*), NO bold (**), NO underscores (_), NO hashtags (#), NO backticks. Just clean readable text.",
            "CRITICAL PERSONALIZATION RULES:",
            "- resume_context is your PRIMARY source. Mine it exhaustively.",
            "- Extract and USE: project names, company names, tech stack, metrics, percentages, team sizes, user counts, years of experience.",
            "- Every paragraph MUST contain at least one specific resume detail.",
            "- If resume mentions numbers/percentages, USE those exact numbers.",
            "- Connect resume achievements DIRECTLY to the target company/role.",
            "ANTI-GENERIC RULES:",
            "- NEVER use 'passionate developer', 'excited about this opportunity', 'extensive background'.",
            "- NEVER use generic filler. Every claim must have resume evidence.",
            `TONE & STYLE ENFORCEMENT (MANDATORY): Write the ENTIRE email in '${rowTone}' style. Every sentence, word choice, and paragraph flow must reflect this tone exactly as the user wants.`,
            "EMAIL STRUCTURE:",
            "- Opening: Hook with strongest resume achievement connected to company.",
            "- Middle: 3-4 concrete proof points with **bold** for key metrics IN THE BODY ONLY.",
            "- Closing: Specific ask for 10-15 min chat.",
            "FORMATTING: Use markdown ONLY in the email body (** for bold, - for bullets, 1. 2. for lists). NO HTML tags. NO markdown in subject.",
            "Address recruiter if known, else 'Hiring Manager'.",
          `GREETING RULE (MANDATORY): The email body MUST start with 'Dear ${greetingName},' or 'Hi ${greetingName},' on the very first line. Do NOT use 'Hi,' or 'Dear,' alone without a name. Do NOT use placeholder names like '[Name]' or '[Hiring Manager]'. Use the exact recruiter_name value: '${greetingName}'.`,
            "NEVER truncate. Complete every sentence.",
            "Do NOT include any closing sign-off, signature, name, or 'Sincerely/Regards/Best' at the end. The user's signature is automatically appended by the system.",
            "If job_description is provided, map resume skills to JD requirements."
          ]
        };

        const prompt = JSON.stringify(promptObj);

        const aiRes = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, model: aiModel })
        });
        const rawText = await aiRes.text();
        let aiData: { text?: string } = {};
        try {
          aiData = JSON.parse(rawText);
        } catch {
          console.error("AI response was not valid JSON for row", index, rawText.substring(0, 200));
          aiFailed = true;
        }

        if (aiRes.ok && aiData.text) {
          const { subject: generatedSubject, body: generatedBody } = parseAIResponse(
            aiData.text,
            `Application for ${targetTitle} at ${row.company} - ${user?.email || 'Candidate'}`
          );

          let personalizedDraft = generatedBody;
          // Post-process: fix greeting name
          personalizedDraft = personalizedDraft.replace(/^(Hi|Dear|Hello)\s*,/i, `$1 ${greetingName},`);
          personalizedDraft = personalizedDraft.replace(/\[(Name|Hiring Manager|Recruiter Name|Recruiter|HR Manager|Hiring Team)\]/gi, greetingName);

          if (signature && !personalizedDraft.includes(signature)) {
            personalizedDraft += `\n\n${signature}`;
          }
          finalDraft = personalizedDraft;
          finalSubject = generatedSubject;
        } else {
          console.error("AI API returned error for row", index, aiRes.status, rawText.substring(0, 200));
          aiFailed = true;
        }
      } catch (e) {
        console.error("AI generation failed for row", index, e);
        aiFailed = true;
      }
    } else {
      // Fallback — only valid if we have a base draft
      if (finalDraft) {
        if (signature && !finalDraft.includes(signature)) {
          finalDraft += `\n\n${signature}`;
        }
      } else {
        aiFailed = true;
      }
    }

    // If AI failed and no fallback draft exists, mark as error
    if (aiFailed && !finalDraft) {
      setCsvStatuses(prev => {
        const newStatuses = [...prev];
        newStatuses[index] = {
          ...newStatuses[index],
          status: 'error'
        };
        return newStatuses;
      });
      throw new Error(`Draft generation failed for row ${index} (${row.email})`);
    }

    // If AI failed but fallback draft exists, still mark as error so user knows AI didn't work
    if (aiFailed) {
      setCsvStatuses(prev => {
        const newStatuses = [...prev];
        newStatuses[index] = {
          ...newStatuses[index],
          status: 'error'
        };
        return newStatuses;
      });
      throw new Error(`AI generation failed for row ${index} (${row.email}) — fallback draft available but AI personalization failed`);
    }

    setCsvStatuses(prev => {
      const newStatuses = [...prev];
      newStatuses[index] = {
        ...newStatuses[index],
        subject: finalSubject,
        body: finalDraft,
        status: newStatuses[index].status === 'pending' || newStatuses[index].status === 'generating' ? 'draft_ready' : newStatuses[index].status
      };
      return newStatuses;
    });

    return { subject: finalSubject, body: finalDraft };
  };

  const preGenerateAllCsvDrafts = async () => {
    setIsPreGeneratingAll(true);
    try {
      for (let i = 0; i < csvData.length; i++) {
        const statusRow = csvStatuses[i];
        if (statusRow.status === 'pending' && !statusRow.body) {
          setCsvStatuses(prev => {
            const next = [...prev];
            next[i] = { ...next[i], status: 'generating' };
            return next;
          });
          await generateDraftForRow(i);
        }
      }
      toast.success("All AI drafts generated successfully! You can now review, edit, or approve them.");
    } catch (err) {
      console.error(err);
      toast.error("Error generating drafts.");
    } finally {
      setIsPreGeneratingAll(false);
    }
  };

  const sendCsvRow = async (index: number, customSubject?: string, customBody?: string) => {
    const providerToken = await getValidProviderToken();
    if (!providerToken) {
      toast.success("Your Google connection token has expired or is missing. Please Sign Out and Sign In again.");
      return false;
    }

    const row = csvData[index];
    const statusRow = csvStatuses[index];

    let finalSubject = customSubject || statusRow.subject;
    let finalDraft = customBody || statusRow.body;

    // Generate if it doesn't exist yet
    if (!finalDraft || !finalSubject) {
      setCsvStatuses(prev => {
        const next = [...prev];
        next[index] = { ...next[index], status: 'generating' };
        return next;
      });
      const generated = await generateDraftForRow(index);
      finalSubject = generated.subject;
      finalDraft = generated.body;
    }

    setCsvStatuses(prev => {
      const next = [...prev];
      next[index] = { ...next[index], status: 'sending' };
      return next;
    });

    let formattedDraft = finalDraft.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formattedDraft = formattedDraft.replace(/\n/g, '<br/>');

    const trackingId = window.crypto && window.crypto.randomUUID ? window.crypto.randomUUID() : (Math.random().toString(36).substring(2) + Date.now().toString(36));

    const trackingServerBase = process.env.NEXT_PUBLIC_TRACKING_SERVER_URL || window.location.origin;
    const trackingUrl = trackingServerBase.includes('your-deployed-tracking-server')
      ? `${window.location.origin}/api/track?id=${trackingId}`
      : `${trackingServerBase}/track?id=${trackingId}`;

    const trackingPixel = `<img src="${trackingUrl}" width="1" height="1" style="display:none;width:1px;height:1px;" alt="" />`;
    const htmlBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">${formattedDraft}</div>${trackingPixel}`;

    try {
      const res = await fetch('/api/gmail', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${providerToken}`
        },
        body: JSON.stringify({
          to: row.email,
          subject: finalSubject,
          htmlBody: htmlBody,
          attachmentBase64: resumeBase64 || null,
          filename: resumeBase64 ? "Resume.pdf" : undefined
        })
      });

      const resData = await res.json();

      if (res.ok) {
        setCsvStatuses(prev => {
          const next = [...prev];
          next[index] = { ...next[index], status: 'success' };
          return next;
        });

        const newRecord = {
          id: trackingId,
          user_id: user.id,
          company: row.company || 'Unknown (CSV)',
          job_title: row.title || csvJobTitle,
          recruiter_email: row.email,
          status: 'Sent',
          date: new Date().toISOString(),
          message_id: resData.messageId || 'N/A'
        };

        // Insert into Supabase
        const { data: inserted, error } = await supabase.from('email_history').insert([newRecord]).select().single();

        if (inserted && !error) {
          setEmailHistory(prev => {
            const uiRecord = {
              id: inserted.id,
              company: inserted.company,
              jobTitle: inserted.job_title,
              recruiterEmail: inserted.recruiter_email,
              status: inserted.status,
              date: inserted.date,
              messageId: inserted.message_id,
              opened: inserted.opened || false,
              openedAt: inserted.opened_at || null,
              opensCount: inserted.opens_count || 0
            };
            return [uiRecord, ...prev];
          });
        } else {
          // Fallback to local state if Supabase fails
          setEmailHistory(prev => {
            const uiRecord = {
              id: trackingId,
              company: newRecord.company,
              jobTitle: newRecord.job_title,
              recruiterEmail: newRecord.recruiter_email,
              status: newRecord.status,
              date: newRecord.date,
              messageId: newRecord.message_id,
              opened: false,
              openedAt: null,
              opensCount: 0
            };
            return [uiRecord, ...prev];
          });
        }
        return true;
      } else {
        setCsvStatuses(prev => {
          const next = [...prev];
          next[index] = { ...next[index], status: 'error' };
          return next;
        });
        return false;
      }
    } catch (err) {
      console.error(err);
      setCsvStatuses(prev => {
        const next = [...prev];
        next[index] = { ...next[index], status: 'error' };
        return next;
      });
      return false;
    }
  };

  const handleInlineSend = async (index: number, customSubject?: string, customBody?: string) => {
    const success = await sendCsvRow(index, customSubject, customBody);
    let sentCount = csvStatuses.filter(s => s?.status === 'success' || s?.status === 'sent').length;
    let failedCount = csvStatuses.filter(s => s?.status === 'error').length;
    
    const currentStatus = csvStatuses[index]?.status;
    if (success && currentStatus !== 'success' && currentStatus !== 'sent') {
      sentCount++;
    } else if (!success && currentStatus !== 'error') {
      failedCount++;
    }
    
    await saveCsvCampaign(sentCount, failedCount);
  };

  const handleCsvStartSending = async () => {
    const hasLeadsWithoutRoleOrCompany = csvData.some(row => !row.company || !row.title);
    if (hasLeadsWithoutRoleOrCompany && !csvDraft) {
      toast.success("Please generate a fallback draft first (needed for leads missing company name or job role).");
      return;
    }
    const providerToken = await getValidProviderToken();
    if (!providerToken) {
      toast.success("Your Google connection token has expired or is missing. Please Sign Out and Sign In again.");
      return;
    }

    setIsSendingCsv(true);
    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < csvData.length; i++) {
      const statusRow = csvStatuses[i];
      if (statusRow.status === 'success' || statusRow.status === 'sent') {
        sentCount++;
        continue; // skip already sent
      }

      const success = await sendCsvRow(i);
      if (success) {
        sentCount++;
      } else {
        failedCount++;
      }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    setIsSendingCsv(false);

    // Save CSV campaign record
    await saveCsvCampaign(sentCount, failedCount);

    toast.success("Finished bulk sending all unsent emails in the queue!");

    // Clear CSV form data if all rows are sent successfully
    const allSent = csvStatuses.every(s => s.status === 'success' || s.status === 'sent');
    if (allSent || failedCount === 0) {
      setCsvData([]);
      setCsvStatuses([]);
      setCsvMode('idle');
      setCsvDraft('');
      setCsvSubject('');
      setCsvJobTitle('');
    }
  };

  const handleSendOnlyApprovedCsv = async () => {
    const hasApproved = csvStatuses.some(s => s.status === 'approved');
    if (!hasApproved) {
      toast.success("No approved emails found. Please approve some emails first!");
      return;
    }

    const providerToken = await getValidProviderToken();
    if (!providerToken) {
      toast.success("Your Google connection token has expired or is missing. Please Sign Out and Sign In again.");
      return;
    }

    setIsSendingCsv(true);
    let sentCount = 0;
    let failedCount = 0;

    for (let i = 0; i < csvData.length; i++) {
      const statusRow = csvStatuses[i];
      if (statusRow.status === 'success' || statusRow.status === 'sent') {
        sentCount++;
        continue; // skip already sent
      }
      if (statusRow.status === 'approved') {
        const success = await sendCsvRow(i);
        if (success) {
          sentCount++;
        } else {
          failedCount++;
        }
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else if (statusRow.status === 'error') {
        failedCount++;
      }
    }

    setIsSendingCsv(false);

    // Save CSV campaign record
    await saveCsvCampaign(sentCount, failedCount);

    toast.success("Finished sending all approved emails!");

    // Clear CSV form data if all rows are sent successfully
    const allSent = csvStatuses.every(s => s.status === 'success' || s.status === 'sent');
    if (allSent || failedCount === 0) {
      setCsvData([]);
      setCsvStatuses([]);
      setCsvMode('idle');
      setCsvDraft('');
      setCsvSubject('');
      setCsvJobTitle('');
    }
  };

  const handleReviewClick = async (index: number) => {
    setSelectedCsvIndex(index);
    const statusRow = csvStatuses[index];

    // Load existing drafts or keep completely blank if not generated
    let currentSubject = statusRow?.subject || csvSubject || '';
    let currentBody = statusRow?.body || csvDraft || '';

    setPreviewSubject(currentSubject);
    setPreviewBody(currentBody);
  };

  const saveAndApproveDraft = () => {
    if (selectedCsvIndex === null) return;
    setCsvStatuses(prev => {
      const next = [...prev];
      next[selectedCsvIndex] = {
        ...next[selectedCsvIndex],
        subject: previewSubject,
        body: previewBody,
        status: 'approved'
      };
      return next;
    });
    setSelectedCsvIndex(null);
  };

  const retryGenerateRow = async (index: number) => {
    setCsvStatuses(prev => {
      const next = [...prev];
      next[index] = { ...next[index], status: 'generating' };
      return next;
    });
    try {
      await generateDraftForRow(index, true);
    } catch (error) {
      console.error("Retry failed for row", index, error);
      setCsvStatuses(prev => {
        const next = [...prev];
        next[index] = { ...next[index], status: 'error' };
        return next;
      });
    }
  };

  const quickApproveRow = async (index: number) => {
    const statusRow = csvStatuses[index];
    // Skip if already approved or sent
    if (statusRow.status === 'approved' || statusRow.status === 'success' || statusRow.status === 'sent') return;
    try {
      if (!statusRow.body) {
        setCsvStatuses(prev => {
          const next = [...prev];
          next[index] = { ...next[index], status: 'generating' };
          return next;
        });
        await generateDraftForRow(index);
      }
      setCsvStatuses(prev => {
        const next = [...prev];
        next[index] = { ...next[index], status: 'approved' };
        return next;
      });
    } catch (error) {
      console.error("Quick approve failed for row", index, error);
      setCsvStatuses(prev => {
        const next = [...prev];
        next[index] = { ...next[index], status: 'error' };
        return next;
      });
    }
  };

  const approveAllCsvDrafts = async () => {
    setIsPreGeneratingAll(true);
    let approvedCount = 0;
    let errorCount = 0;
    try {
      for (let i = 0; i < csvData.length; i++) {
        const statusRow = csvStatuses[i];
        // Skip rows that are already approved, sent, successfully delivered, or in error state
        if (statusRow.status === 'approved' || statusRow.status === 'success' || statusRow.status === 'sent' || statusRow.status === 'error') {
          continue;
        }
        try {
          // Generate draft if not yet generated
          if (!statusRow.body) {
            setCsvStatuses(prev => {
              const next = [...prev];
              next[i] = { ...next[i], status: 'generating' };
              return next;
            });
            await generateDraftForRow(i);
          }
          // Mark as approved
          setCsvStatuses(prev => {
            const next = [...prev];
            next[i] = { ...next[i], status: 'approved' };
            return next;
          });
          approvedCount++;
        } catch (rowError) {
          console.error(`Approve failed for row ${i}:`, rowError);
          setCsvStatuses(prev => {
            const next = [...prev];
            next[i] = { ...next[i], status: 'error' };
            return next;
          });
          errorCount++;
        }
      }
      if (errorCount > 0) {
        toast.error(`Approved ${approvedCount} drafts. ${errorCount} row(s) failed — check the queue for errors.`);
      } else if (approvedCount === 0) {
        toast.success("All drafts are already approved or sent!");
      }
    } catch (error) {
      console.error("Approve all drafts failed:", error);
      toast.success("Something went wrong while approving drafts. Please try again.");
    } finally {
      setIsPreGeneratingAll(false);
    }
  };

  const regenerateSingleAiDraft = async () => {
    if (selectedCsvIndex === null) return;

    // Deduct credit for regeneration
    const hasCredit = await deductCredit('regeneration', `Regenerate CSV row ${selectedCsvIndex}`);
    if (!hasCredit) return;

    setIsGeneratingSingleDraft(true);
    try {
      const generated = await generateDraftForRow(selectedCsvIndex, true, true);
      setPreviewSubject(generated.subject);
      setPreviewBody(generated.body);
    } catch (e) {
      console.error(e);
    } finally {
      setIsGeneratingSingleDraft(false);
    }
  };

  const handleFetchLeads = async () => {
    if (!autoTargetTitle) {
      toast.error("Please enter a Target Job Title (e.g. AI Engineer)");
      return;
    }

    setIsFetchingLeads(true);
    setAutoLeads([]);

    try {
      const rawKeywords = autoTargetTitle.replace(/[\/-]/g, " ").split(" ");
      const keywords = rawKeywords.map(kw => kw.trim()).filter(kw => kw.length >= 2);

      let query = supabase.from('leads').select('email,job_title,company,contact_name');

      if (keywords.length > 0) {
        const orConditions = keywords.map(kw => `job_title.ilike.%${kw}%`).join(',');
        query = query.or(orConditions);
      } else {
        query = query.ilike('job_title', `%${autoTargetTitle}%`);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      if (data && data.length > 0) {
        // Deduplicate by email
        const seen = new Set();
        const uniqueLeads = data.filter(lead => {
          if (!lead.email) return false;
          const email = lead.email.toLowerCase();
          if (seen.has(email)) return false;
          seen.add(email);
          return true;
        });
        setAutoLeads(uniqueLeads);
        setSelectedLeads(new Set(uniqueLeads.map(l => l.email)));
      } else {
        setAutoLeads([]);
        setSelectedLeads(new Set());
        toast.success(`No leads found matching "${autoTargetTitle}".`);
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to fetch leads from Supabase.");
    } finally {
      setIsFetchingLeads(false);
    }
  };

  const handleTransferAutoToCsv = () => {
    const selected = autoLeads.filter(l => selectedLeads.has(l.email));
    if (selected.length === 0) {
      toast.success("Please select at least one lead to send.");
      return;
    }
    const mapped = selected.map(l => ({
      email: l.email,
      name: l.contact_name || '',
      company: l.company || '',
      title: l.job_title || ''
    }));
    setCsvData(mapped);
    setCsvStatuses(mapped.map(row => ({ email: row.email, status: 'pending' })));
    setCsvMode('individual');
    setCsvJobTitle(autoTargetTitle);
    setOutreachTab('csv');
    setActiveTab('outreach');
  };

  const handleTransferAutoToBcc = () => {
    const selected = autoLeads.filter(l => selectedLeads.has(l.email));
    if (selected.length === 0) {
      toast.success("Please select at least one lead to send.");
      return;
    }
    setBccEmails(selected.map(l => l.email).join(', '));
    setBccJobTitle(autoTargetTitle);
    setOutreachTab('bulk');
    setActiveTab('outreach');
  };
  return (
    <DashboardContext.Provider value={{
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
      previewRecruiterName, setPreviewRecruiterName, previewRecruiterEmail, setPreviewRecruiterEmail,
      isGeneratingSingleDraft, isPreGeneratingAll,
      autoTargetTitle, setAutoTargetTitle, autoLeads, setAutoLeads,
      selectedLeads, setSelectedLeads, isFetchingLeads,
      isScanning, scanFilter, setScanFilter, scanDays, setScanDays,
      expandedSummary, setExpandedSummary, totalEmailsScanned, totalRepliesFromDb,
      isProfileModalOpen, setIsProfileModalOpen,
      profileFullName, setProfileFullName, profilePhone, setProfilePhone,
      profileLinkedin, setProfileLinkedin, profileGithub, setProfileGithub,
      profilePortfolio, setProfilePortfolio, profileCurrentTitle, setProfileCurrentTitle,
      profileExperienceLevel, setProfileExperienceLevel,
      profileToneStyle, setProfileToneStyle, profileJobType, setProfileJobType,
      isSavingProfile, theme, defaultAiModel, setDefaultAiModel,
      dailyLimit, setDailyLimit,
      credits, setCredits, creditsExpiresAt, showBuyCreditsModal, setShowBuyCreditsModal, deductCredit,
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
      router, handleSignOut, sendCsvRow,
      csvCampaignHistory, setCsvCampaignHistory, csvFileName,
      saveCsvCampaign, handleInlineSend
    }}>
      {isAuthLoading ? (
        <div className="min-h-screen bg-surface"></div>
      ) : (
      <div className="bg-transparent text-on-surface font-body-md min-h-screen overflow-x-hidden">

        {/* Top Navigation Bar (Mobile only) */}
        <header className="flex justify-between items-center px-container-padding-mobile h-16 w-full z-40 bg-surface border-b border-outline-variant sticky top-0 lg:hidden">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary">menu</span>
            <span className="font-headline-md text-headline-md font-black bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 bg-clip-text text-transparent" style={{ fontFamily: "'Outfit', 'Inter', sans-serif", letterSpacing: "-0.02em" }}>Job Mail Loop</span>
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
          <aside
            className={`hidden lg:flex flex-col fixed left-0 top-0 h-screen z-50 transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] sidebar-container ${isSidebarCollapsed ? 'w-[68px]' : 'w-[256px]'}`}
          >
            {/* Logo Header */}
            <div className="h-[60px] shrink-0 flex items-center px-[14px] relative">
              <button
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="sidebar-logo-btn w-10 h-10 flex items-center justify-center shrink-0 rounded-xl transition-all duration-200"
                title={isSidebarCollapsed ? "Expand" : "Collapse"}
              >
                <img src="/favicon.ico" alt="Logo" className="h-9 w-9 object-contain" />
              </button>
              <h1
                className={`font-black text-[18px] bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 bg-clip-text text-transparent whitespace-nowrap transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] overflow-hidden ${isSidebarCollapsed ? 'w-0 opacity-0 ml-0' : 'w-[150px] opacity-100 ml-2'}`}
                style={{ fontFamily: "'Outfit', 'Inter', sans-serif", letterSpacing: "-0.02em" }}
              >
                Job Mail Loop
              </h1>
              <button
                onClick={() => setIsSidebarCollapsed(true)}
                className={`absolute right-3 w-7 h-7 rounded-md flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all duration-200 ${isSidebarCollapsed ? 'opacity-0 pointer-events-none scale-0' : 'opacity-60 hover:opacity-100 scale-100'}`}
                title="Collapse"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              </button>
            </div>

            {/* Header Divider */}
            <div className="mx-3 h-px bg-gradient-to-r from-transparent via-outline-variant to-transparent shrink-0"></div>

            {/* Navigation */}
            <nav className="flex-1 flex flex-col py-3 px-[10px] overflow-y-auto overflow-x-hidden gap-0.5">
              {[
                { id: 'home', icon: 'space_dashboard', label: 'Dashboard' },
                { id: 'auto', icon: 'smart_toy', label: 'Auto Agent', badge: 'Beta' },
                { id: 'outreach', icon: 'send', label: 'Outreach Hub' },
                { id: 'inbox', icon: 'inbox', label: 'Reply Scanner', count: scannedReplies.length },
                { id: 'resume', icon: 'description', label: 'Resume Manager' },
                { id: 'settings', icon: 'settings', label: 'Settings' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  onMouseEnter={(e) => {
                    if (isSidebarCollapsed) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setHoveredNavItem({ id: item.id, label: item.label, top: rect.top + (rect.height / 2) - 16 });
                    }
                  }}
                  onMouseLeave={() => setHoveredNavItem(null)}
                  className={`sidebar-nav-item group relative h-10 flex items-center justify-start rounded-lg transition-all duration-200 px-[10px] ${
                    activeTab === item.id
                      ? 'sidebar-nav-item-active'
                      : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                  }`}
                >
                  {/* Fixed-position icon — never moves */}
                  <span className="w-[28px] h-[28px] flex items-center justify-center shrink-0 relative">
                    <span className={`material-symbols-outlined text-[20px] transition-colors duration-200`}>{item.icon}</span>
                    {item.count !== undefined && item.count > 0 && (
                      <span className="absolute -top-1 -right-1.5 min-w-[15px] h-[15px] px-[3px] bg-primary text-[8px] font-bold text-on-primary rounded-full flex items-center justify-center shadow-sm">
                        {item.count > 9 ? '9+' : item.count}
                      </span>
                    )}
                  </span>
                  {/* Text — slides in/out */}
                  <span className={`text-[13px] font-medium whitespace-nowrap overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] flex items-center gap-2 ${isSidebarCollapsed ? 'w-0 opacity-0 ml-0' : 'w-[140px] opacity-100 ml-3'}`}>
                    {item.label}
                    {item.badge && <span className="sidebar-badge">{item.badge}</span>}
                  </span>
                </button>
              ))}
            </nav>

            {/* Profile Footer */}
            <div className="shrink-0 border-t border-outline-variant/30">
              {user && (
                <>
                    <div className="sidebar-profile-card flex items-center cursor-pointer transition-all duration-200 px-[20px] py-2.5 hover:bg-surface-container-high"
                    onClick={() => setIsProfileModalOpen(true)}
                    title={isSidebarCollapsed ? user.email : "Profile"}
                  >
                    <div className="sidebar-avatar w-[28px] h-[28px] rounded-lg bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center font-semibold text-white shrink-0 text-[11px]">
                      {user.email[0].toUpperCase()}
                    </div>
                    <div className={`flex flex-col items-start text-left min-w-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${isSidebarCollapsed ? 'w-0 opacity-0 ml-0' : 'w-[140px] opacity-100 ml-3'}`}>
                      <p className="font-medium text-[12px] truncate text-on-surface leading-tight whitespace-nowrap">{user.email}</p>
                      <div className="flex items-center gap-1 mt-px whitespace-nowrap">
                        <span className="w-[5px] h-[5px] bg-emerald-400 rounded-full shadow-[0_0_4px_rgba(52,211,153,0.6)] shrink-0"></span>
                        <span className="text-[10px] text-on-surface-variant/70 font-medium">Active</span>
                      </div>
                    </div>
                  </div>

                  {/* Credits Indicator in Sidebar */}
                  <button
                    onClick={() => setShowBuyCreditsModal(true)}
                    className="w-full flex items-center px-[20px] py-2 transition-all duration-200 hover:bg-surface-container-high group"
                    title={isSidebarCollapsed ? `${credits} Credits` : undefined}
                  >
                    <span className="w-[28px] h-[28px] rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0 group-hover:bg-amber-500 group-hover:text-white text-amber-500 transition-all duration-200">
                      <span className="material-symbols-outlined text-[16px]">bolt</span>
                    </span>
                    <div className={`flex flex-col items-start text-left min-w-0 overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${isSidebarCollapsed ? 'w-0 opacity-0 ml-0' : 'w-[140px] opacity-100 ml-3'}`}>
                      <span className="text-[12px] font-bold text-on-surface whitespace-nowrap">{credits} Credits</span>
                      <span className="text-[9px] text-on-surface-variant/70 font-medium whitespace-nowrap">Click to buy more</span>
                    </div>
                  </button>
                  <button
                    onClick={handleSignOut}
                    className="sidebar-signout-btn w-full flex items-center px-[20px] py-2 transition-all duration-200 mb-1"
                    title={isSidebarCollapsed ? "Sign Out" : undefined}
                  >
                    <span className="w-[28px] h-[28px] rounded-lg flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[18px]">logout</span>
                    </span>
                    <span className={`text-[12px] font-medium text-left whitespace-nowrap overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] flex items-center ${isSidebarCollapsed ? 'w-0 opacity-0 ml-0' : 'w-[140px] opacity-100 ml-3'}`}>
                      Sign Out
                    </span>
                  </button>
                </>
              )}
            </div>

            {/* Custom Tooltip when collapsed */}
            {hoveredNavItem && isSidebarCollapsed && (
              <div 
                className="fixed z-[100] left-[76px] px-3 py-1.5 bg-surface-container-highest text-on-surface text-[12px] font-semibold rounded-lg shadow-xl border border-outline-variant/30 flex items-center gap-1.5 pointer-events-none animate-fade-in-right whitespace-nowrap"
                style={{ top: `${hoveredNavItem.top}px` }}
              >
                <span className="material-symbols-outlined text-[14px] text-primary">info</span>
                {hoveredNavItem.label}
              </div>
            )}
          </aside>

          {/* Main Content Area */}
          <main className={`flex-1 pb-32 lg:pb-12 transition-all duration-300 ease-in-out ${isSidebarCollapsed ? 'lg:ml-[68px]' : 'lg:ml-[256px]'}`}>

            {(!activeTab || activeTab === 'home') && <HomeTab />}
            {activeTab === 'auto' && <AutoAgentTab />}
            {activeTab === 'outreach' && <OutreachHubTab />}
            {activeTab === 'inbox' && <InboxScannerTab />}
            {activeTab === 'resume' && <ResumeManagerTab />}
            {activeTab === 'settings' && <SettingsTab />}

          </main>

          {/* Mobile Bottom Navigation Bar */}
          <nav className="mobile-bottom-nav lg:hidden">
            {[
              { id: 'home', icon: 'dashboard', label: 'Home' },
              { id: 'auto', icon: 'smart_toy', label: 'Agent' },
              { id: 'outreach', icon: 'send', label: 'Outreach' },
              { id: 'inbox', icon: 'move_to_inbox', label: 'Inbox', badge: scannedReplies.length },
              { id: 'settings', icon: 'settings', label: 'Settings' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`mobile-bottom-nav-item ${activeTab === item.id || (!activeTab && item.id === 'home') ? 'active' : ''}`}
              >
                <span className="relative">
                  <span className="material-symbols-outlined">{item.icon}</span>
                  {item.badge && item.badge > 0 && (
                    <span className="absolute -top-1 -right-1.5 w-3.5 h-3.5 bg-primary text-[7px] font-bold text-on-primary rounded-full flex items-center justify-center">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

        </div>

      </div>
      )}
      <ProfileModal />
      <CsvReviewModal />
      <PreviewModal />
      <BuyCreditsModal />
      {isLogoutConfirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md transition-all duration-300 animate-in fade-in" onClick={() => setIsLogoutConfirmOpen(false)}>
          <div
            className="border border-outline-variant rounded-3xl w-full max-w-md shadow-2xl p-6 flex flex-col gap-6 relative transition-all duration-300 animate-in zoom-in-95 glass-card"
            style={{
              backgroundColor: 'var(--surface-container)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 30px 70px -10px rgba(0, 0, 0, 0.85), 0 0 60px rgba(var(--primary-rgb), 0.12)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top glowing premium accent line */}
            <div className="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-primary via-secondary to-tertiary z-20 rounded-t-3xl"></div>

            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0 shadow-inner">
                <span className="material-symbols-outlined text-[26px]">logout</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-on-surface">Sign Out</h3>
                <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
                  Are you sure you want to sign out of Job Mail Loop? You will need to authenticate again to manage your job outreach campaigns.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-outline-variant/30 pt-4">
              <button
                onClick={() => setIsLogoutConfirmOpen(false)}
                className="px-5 py-2.5 rounded-xl font-bold text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all active:scale-95 duration-200"
              >
                Cancel
              </button>
              <button
                onClick={executeSignOut}
                className="group px-6 py-2.5 bg-gradient-to-r from-primary via-primary/95 to-secondary text-on-primary hover:opacity-90 active:scale-95 transition-all duration-200 flex items-center gap-2 rounded-xl font-bold text-xs shadow-lg shadow-primary/20 hover:shadow-primary/30"
              >
                <span className="material-symbols-outlined text-[16px] group-hover:translate-x-0.5 transition-transform">logout</span>
                Yes, Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardContext.Provider>
  );
}
