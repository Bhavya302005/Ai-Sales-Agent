'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { useDashboard } from '../DashboardContext';
import { supabase } from '../../../lib/supabase/client';

// ─── Types ───────────────────────────────────────────────────────────
interface JobMatchResult {
  id: number;
  score: number;
  tier: 'high' | 'medium' | 'low' | 'disqualified';
  disqualifyReason: string | null;
  breakdown: {
    skills?: { score: number; matched: string[]; details: string; weight: number };
    title?: { score: number; bestMatch: string; details: string; weight: number };
    exp?: { score: number; details: string; weight: number };
    loc?: { score: number; details: string; weight: number; hardFail?: boolean };
    visa?: { score: number; details: string; weight: number; hardFail?: boolean };
    emp?: { score: number; details: string; weight: number };
  };
  parsedJob: {
    title: string;
    location: string;
    workMode: string;
    skills: string[];
    salaryMin: number | null;
    salaryMax: number | null;
    company: string | null;
    raw_name: string;
    post_url: string | null;
    post_email: string | null;
    job_link: string | null;
    poster_profile_url: string | null;
    empType: string[];
    visa: { allows: string[]; blocks: string[] };
    expRange: { min: number; max: number } | null;
  };
  // Draft/send states added at runtime
  draftStatus?: 'idle' | 'generating' | 'generated' | 'approved' | 'sending' | 'sent' | 'already_sent' | 'error';
  draftSubject?: string;
  draftBody?: string;
  selected?: boolean;
}

interface UserPreferences {
  userId: string;
  desiredTitles: string[];
  skills: string[];
  experienceYears: number;
  locationPrefs: string[];
  workModes: string[];
  visaStatus: string;
  empTypes: string[];
  minSalary: number;
  maxPostAgeDays: number;
}

const EDGE_FUNCTION_URL = 'https://gyzpuzolcmjqzgksutzr.supabase.co/functions/v1/job-matcher';
const JOB_MATCHER_ANON_KEY = process.env.NEXT_PUBLIC_JOB_MATCHER_ANON_KEY || '';

const DEFAULT_PREFS: UserPreferences = {
  userId: '',
  desiredTitles: [],
  skills: [],
  experienceYears: 3,
  locationPrefs: [],
  workModes: ['remote'],
  visaStatus: 'h1b',
  empTypes: ['fulltime'],
  minSalary: 0,
  maxPostAgeDays: 30,
};

const VISA_OPTIONS = [
  { value: 'h1b', label: 'H-1B' },
  { value: 'opt', label: 'OPT' },
  { value: 'cpt', label: 'CPT' },
  { value: 'citizen', label: 'US Citizen' },
  { value: 'gc', label: 'Green Card' },
  { value: 'tn', label: 'TN Visa' },
  { value: 'any', label: 'Any / Not Applicable' },
];

const WORK_MODE_OPTIONS = [
  { value: 'remote', label: 'Remote', icon: 'home' },
  { value: 'hybrid', label: 'Hybrid', icon: 'apartment' },
  { value: 'onsite', label: 'Onsite', icon: 'location_on' },
];

const EMP_TYPE_OPTIONS = [
  { value: 'fulltime', label: 'Full-time' },
  { value: 'parttime', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'c2c', label: 'C2C' },
  { value: 'w2', label: 'W2' },
  { value: 'c2h', label: 'Contract-to-Hire' },
  { value: 'intern', label: 'Internship' },
];

const TIER_CONFIG = {
  high: { emoji: '🟢', label: 'High Match', bgClass: 'bg-emerald-500/10', textClass: 'text-emerald-500', borderClass: 'border-emerald-500/30', dotClass: 'bg-emerald-500' },
  medium: { emoji: '🟡', label: 'Medium Match', bgClass: 'bg-amber-500/10', textClass: 'text-amber-500', borderClass: 'border-amber-500/30', dotClass: 'bg-amber-500' },
  low: { emoji: '🔴', label: 'Low Match', bgClass: 'bg-red-500/10', textClass: 'text-red-500', borderClass: 'border-red-500/30', dotClass: 'bg-red-500' },
  disqualified: { emoji: '⛔', label: 'Disqualified', bgClass: 'bg-gray-500/10', textClass: 'text-gray-500', borderClass: 'border-gray-500/30', dotClass: 'bg-gray-500' },
};

// Status badge config
const STATUS_CONFIG: Record<string, { label: string; icon: string; classes: string }> = {
  idle: { label: 'Pending', icon: 'hourglass_empty', classes: 'bg-surface-container-high text-on-surface-variant' },
  generating: { label: 'Generating...', icon: 'auto_awesome', classes: 'bg-amber-500/15 text-amber-500' },
  generated: { label: 'Draft Ready', icon: 'edit_note', classes: 'bg-blue-500/15 text-blue-500' },
  approved: { label: 'Approved', icon: 'check_circle', classes: 'bg-emerald-500/15 text-emerald-500' },
  sending: { label: 'Sending...', icon: 'send', classes: 'bg-purple-500/15 text-purple-500' },
  sent: { label: 'Sent ✓', icon: 'mark_email_read', classes: 'bg-emerald-500/15 text-emerald-500' },
  already_sent: { label: 'Already Sent', icon: 'mark_email_read', classes: 'bg-violet-500/15 text-violet-400' },
  error: { label: 'Error', icon: 'error', classes: 'bg-red-500/15 text-red-500' },
};

// ─── Robust AI JSON Parser (same as page.tsx) ───────────────────────
const parseAIResponse = (rawText: string, defaultSubject: string) => {
  let cleanText = rawText.trim();
  const match = cleanText.match(/\{[\s\S]*\}/);
  if (match) cleanText = match[0];

  const repairJSON = (str: string): string => {
    let inString = false;
    let escaped = false;
    let result = '';
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      if (inString) {
        if (escaped) {
          if ('"\\/' .includes(char) || 'bfnrtu'.includes(char)) { result += char; }
          else { if (result.endsWith('\\')) result = result.slice(0, -1) + '\\\\'; result += char; }
          escaped = false;
        } else if (char === '\\') { escaped = true; result += char; }
        else if (char === '"') { inString = false; result += char; }
        else if (char === '\n') result += '\\n';
        else if (char === '\r') result += '\\r';
        else if (char === '\t') result += '\\t';
        else result += char;
      } else {
        if (char === '"') inString = true;
        result += char;
      }
    }
    if (inString) { if (escaped) result = result.slice(0, -1); result += '"'; }
    let ob = 0, cb = 0;
    for (const c of result) { if (c === '{') ob++; if (c === '}') cb++; }
    while (ob > cb) { result += '}'; cb++; }
    return result;
  };

  try {
    const parsed = JSON.parse(repairJSON(cleanText));
    // Strip markdown from subject — subject must always be plain text
    let subject = (parsed.subject || parsed.Subject || defaultSubject)
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
    return {
      subject,
      body: parsed.body || parsed.Body || parsed.email_body || cleanText,
    };
  } catch {
    const subjectMatch = cleanText.match(/subject["\s:]+([^\n"]+)/i);
    let subject = subjectMatch?.[1]?.trim() || defaultSubject;
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
    const bodyMatch = cleanText.match(/body["\s:]+([\s\S]+)/i);
    return {
      subject,
      body: bodyMatch?.[1]?.replace(/^["']|["']$/g, '').trim() || cleanText,
    };
  }
};

// ─── Tag Input Component ─────────────────────────────────────────────
function TagInput({ tags, setTags, placeholder, icon }: { tags: string[]; setTags: (t: string[]) => void; placeholder: string; icon: string }) {
  const [input, setInput] = useState('');
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      if (!tags.includes(input.trim().toLowerCase())) setTags([...tags, input.trim().toLowerCase()]);
      setInput('');
    }
    if (e.key === 'Backspace' && !input && tags.length > 0) setTags(tags.slice(0, -1));
  };
  return (
    <div className="flex flex-wrap items-center gap-2 w-full min-h-[48px] px-3 py-2 rounded-lg bg-surface-container-lowest border border-outline-variant focus-within:border-primary focus-within:shadow-[0_0_0_3px_rgba(var(--primary-rgb),0.12)] transition-all">
      <span className="material-symbols-outlined text-on-surface-variant text-[20px] shrink-0">{icon}</span>
      {tags.map((t, i) => (
        <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-primary/20 animate-fade-in-right">
          {t}
          <button onClick={() => setTags(tags.filter((_, j) => j !== i))} className="hover:text-error transition-colors ml-0.5">
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </span>
      ))}
      <input
        type="text"
        className="flex-1 min-w-[120px] bg-transparent border-none text-on-surface text-sm focus:ring-0 outline-none placeholder:text-outline"
        placeholder={tags.length === 0 ? placeholder : 'Add more...'}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

// ─── Score Bar Component ─────────────────────────────────────────────
function ScoreBar({ label, score, icon }: { label: string; score: number; icon: string }) {
  const pct = Math.round(score * 100);
  const barColor = pct >= 70 ? 'bg-emerald-500' : pct >= 45 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-3">
      <span className="material-symbols-outlined text-on-surface-variant text-[14px]">{icon}</span>
      <span className="text-[11px] text-on-surface-variant w-12 shrink-0 capitalize">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
        <div className={`h-full rounded-full ${barColor} transition-all duration-700 ease-out`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[11px] font-bold text-on-surface w-8 text-right">{pct}%</span>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────
export default function AutoAgentTab() {
  const ctx = useDashboard();
  const {
    user, resumeText, resumeBase64, signature, aiModel,
    getValidProviderToken, emailHistory, setEmailHistory, profileCurrentTitle,
    profileExperienceLevel, profileToneStyle, profileJobType,
  } = ctx;

  // Preferences
  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('jobMatchPrefs');
      if (saved) { try { return { ...DEFAULT_PREFS, ...JSON.parse(saved) }; } catch {} }
    }
    return DEFAULT_PREFS;
  });

  // Results & UI state — restored from sessionStorage to survive tab switches
  const [results, setResults] = useState<JobMatchResult[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('autoAgentResults');
      if (saved) { try { return JSON.parse(saved); } catch {} }
    }
    return [];
  });
  const [isSearching, setIsSearching] = useState(false);
  const [stats, setStats] = useState<{ high: number; medium: number; low: number; disqualified: number } | null>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('autoAgentStats');
      if (saved) { try { return JSON.parse(saved); } catch {} }
    }
    return null;
  });
  const [filterTier, setFilterTier] = useState<string>('all');
  const [showPrefsPanel, setShowPrefsPanel] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('autoAgentResults');
      if (saved) { try { return JSON.parse(saved).length === 0; } catch {} }
    }
    return true;
  });
  const [lastSearchTime, setLastSearchTime] = useState<string | null>(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('autoAgentLastSearch');
    return null;
  });
  const [visibleCount, setVisibleCount] = useState(20);

  // Draft generation & sending state
  const [isGeneratingDrafts, setIsGeneratingDrafts] = useState(false);
  const [isSendingAll, setIsSendingAll] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
  const [sendProgress, setSendProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 });
  const [expandedCard, setExpandedCard] = useState<number | null>(null);
  const [expandedDraftCard, setExpandedDraftCard] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState<number | null>(null);
  const abortRef = useRef(false);

  // Set userId from auth user
  useEffect(() => {
    if (user?.id && !prefs.userId) setPrefs(p => ({ ...p, userId: user.id }));
  }, [user]);

  // Save prefs to localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem('jobMatchPrefs', JSON.stringify(prefs));
  }, [prefs]);

  // Persist results & stats to sessionStorage on change
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('autoAgentResults', JSON.stringify(results));
    }
  }, [results]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (stats) sessionStorage.setItem('autoAgentStats', JSON.stringify(stats));
    }
  }, [stats]);

  useEffect(() => {
    if (typeof window !== 'undefined' && lastSearchTime) {
      sessionStorage.setItem('autoAgentLastSearch', lastSearchTime);
    }
  }, [lastSearchTime]);

  const updatePref = useCallback(<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPrefs(p => ({ ...p, [key]: value }));
  }, []);

  const toggleWorkMode = (mode: string) => {
    setPrefs(p => ({ ...p, workModes: p.workModes.includes(mode) ? p.workModes.filter(m => m !== mode) : [...p.workModes, mode] }));
  };

  const toggleEmpType = (type: string) => {
    setPrefs(p => ({ ...p, empTypes: p.empTypes.includes(type) ? p.empTypes.filter(t => t !== type) : [...p.empTypes, type] }));
  };

  // ─── Update single result helper ─────────────────────────────────
  const updateResult = useCallback((index: number, updates: Partial<JobMatchResult>) => {
    setResults(prev => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  }, []);

  // ─── Select/Deselect helpers ─────────────────────────────────────
  const emailableResults = results.filter(r => r.tier !== 'disqualified' && r.parsedJob.post_email && r.draftStatus !== 'already_sent');
  const selectedCount = results.filter(r => r.selected).length;

  const toggleSelect = (index: number) => {
    // Don't allow selecting sent, already_sent, or currently-sending jobs
    if (results[index].draftStatus === 'sent' || results[index].draftStatus === 'already_sent' || results[index].draftStatus === 'sending') return;
    updateResult(index, { selected: !results[index].selected });
  };

  const selectAllEmailable = () => {
    setResults(prev => prev.map(r =>
      (r.tier !== 'disqualified' && r.parsedJob.post_email && r.draftStatus !== 'sent' && r.draftStatus !== 'already_sent' && r.draftStatus !== 'sending') ? { ...r, selected: true } : r
    ));
  };

  const deselectAll = () => {
    setResults(prev => prev.map(r => ({ ...r, selected: false })));
  };

  // ─── Search Handler ──────────────────────────────────────────────
  const handleSearch = async () => {
    if (prefs.desiredTitles.length === 0 && prefs.skills.length === 0) {
      toast.error('Please add at least one desired title or skill');
      return;
    }
    setIsSearching(true);
    setResults([]);
    setStats(null);
    setVisibleCount(20);

    try {
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(JOB_MATCHER_ANON_KEY ? { 'Authorization': `Bearer ${JOB_MATCHER_ANON_KEY}` } : {}),
        },
        body: JSON.stringify({
          userProfile: { ...prefs, userId: prefs.userId || user?.id || 'anonymous' },
          plan: 'paid',
          limit: 200,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Edge function returned an error');

      // Build a set of recruiter emails that were already sent
      const sentEmails = new Set(
        emailHistory
          .filter((h: any) => h.recruiterEmail)
          .map((h: any) => h.recruiterEmail.toLowerCase().trim())
      );

      const matchResults: JobMatchResult[] = (data.results || []).map((r: any) => {
        const postEmail = r.parsedJob?.post_email?.toLowerCase().trim();
        const wasSent = postEmail && sentEmails.has(postEmail);
        return {
          ...r,
          draftStatus: wasSent ? ('already_sent' as const) : ('idle' as const),
          draftSubject: '',
          draftBody: '',
          selected: false,
        };
      });

      setResults(matchResults);
      const s = { high: 0, medium: 0, low: 0, disqualified: 0 };
      matchResults.forEach(r => { s[r.tier]++; });
      setStats(s);
      setLastSearchTime(new Date().toLocaleString());

      if (matchResults.length === 0) {
        toast('No matching jobs found. Try broadening your preferences.', { icon: '🔍' });
      } else {
        toast.success(`Found ${matchResults.length} job matches!`);
        setShowPrefsPanel(false);
      }
    } catch (err: any) {
      console.error('Job match error:', err);
      toast.error(err.message || 'Failed to search jobs');
    } finally {
      setIsSearching(false);
    }
  };

  // ─── Generate Draft for Single Result ────────────────────────────
  const generateDraft = async (index: number) => {
    const result = results[index];
    if (!result.parsedJob.post_email) {
      toast.error('No email found for this job post');
      return;
    }

    // Prevent regenerating if already generated/approved/sent
    if (result.draftStatus === 'generating') return;

    updateResult(index, { draftStatus: 'generating' });

    try {
      const greetingName = result.parsedJob.raw_name || 'Hiring Manager';
      const promptObj = {
        task: "Write a deeply personalized, human-sounding, high-conversion job application email. Every sentence must contain at least one detail from the candidate's resume.",
        candidate_details: { resume_context: resumeText ? resumeText.substring(0, 2000) : "No resume provided." },
        job_details: {
          company: result.parsedJob.company || 'Unknown',
          job_title: result.parsedJob.title || prefs.desiredTitles[0] || 'the role',
          job_type: result.parsedJob.empType?.[0] || profileJobType || 'fulltime',
          job_description: result.parsedJob.skills?.join(', ') || 'Not provided',
          experience_level: profileExperienceLevel || 'mid',
          location: result.parsedJob.location || '',
          posted_by: greetingName,
        },
        generation_preferences: {
          tone_style: profileToneStyle || 'professional',
          tone_style_instruction: `CRITICAL: You MUST write the entire email in the '${profileToneStyle || 'professional'}' style. This is NON-NEGOTIABLE. The tone, vocabulary, sentence structure, and energy level must ALL match this style perfectly.`,
          output_format: "Strict JSON only",
          length_target: "3-5 detailed paragraphs, complete and untruncated",
        },
        instructions: [
          "Return ONLY valid JSON with keys: subject, body.",
          "Do NOT start body with 'Subject:'. Subject goes in its own JSON key.",
          "Do NOT use unescaped double quotes in body. Use single quotes instead.",
          "Ensure all newlines are properly escaped as \\n.",
          `GREETING RULE (MANDATORY): The email body MUST start with 'Hi ${greetingName},' or 'Dear ${greetingName},' on the very first line. Do NOT use 'Hi,' or 'Dear,' alone without a name. Do NOT use placeholder names like '[Name]'. Use the exact value: '${greetingName}'.`,
          "SUBJECT LINE RULES (STRICTLY ENFORCED): Subject MUST be PLAIN TEXT ONLY. Absolutely NO markdown, NO asterisks (*), NO bold (**), NO underscores (_), NO hashtags (#), NO backticks, NO brackets. Just clean readable text. Subject must include a specific skill/achievement from resume.",
          "CRITICAL: Mine the resume_context exhaustively. Use specific project names, metrics, tech stack.",
          "Every paragraph MUST contain at least one resume detail.",
          "NEVER use generic filler like 'passionate developer' or 'excited about this opportunity'.",
          `TONE & STYLE ENFORCEMENT (MANDATORY): Write the ENTIRE email in '${profileToneStyle || 'professional'}' style. Every sentence, word choice, and paragraph flow must reflect this tone exactly as the user wants.`,
          "Opening: Hook with strongest resume achievement.",
          "Middle: 3-4 concrete proof points with **bold** for key metrics IN THE BODY ONLY.",
          "Closing: Specific ask for 10-15 min chat.",
          "FORMATTING: Use markdown ONLY in the email body (** for bold, - for bullets). NO HTML tags. The subject line must have ZERO markdown.",
          "NEVER truncate. Complete every sentence.",
          "Do NOT include any closing sign-off, signature, name, or 'Sincerely/Regards/Best' at the end.",
        ]
      };

      const aiRes = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: JSON.stringify(promptObj), model: aiModel }),
      });

      const rawText = await aiRes.text();
      let aiData: { text?: string } = {};
      try { aiData = JSON.parse(rawText); } catch { throw new Error('AI response not valid JSON'); }

      if (aiRes.ok && aiData.text) {
        const { subject, body } = parseAIResponse(
          aiData.text,
          `Application for ${result.parsedJob.title} - ${user?.email || 'Candidate'}`
        );
        let finalBody = body;
        // Post-process: fix greeting if AI missed or used placeholder name
        finalBody = finalBody.replace(/^(Hi|Dear|Hello)\s*,/i, `$1 ${greetingName},`);
        finalBody = finalBody.replace(/\[(Name|Hiring Manager|Recruiter Name|Recruiter|HR Manager)\]/gi, greetingName);

        if (signature && !finalBody.includes(signature)) finalBody += `\n\n${signature}`;

        updateResult(index, { draftStatus: 'generated', draftSubject: subject, draftBody: finalBody });
      } else {
        throw new Error('AI returned error');
      }
    } catch (err) {
      console.error('Draft generation failed:', err);
      updateResult(index, { draftStatus: 'error' });
      toast.error(`Draft failed for ${result.parsedJob.title || 'job'}`);
    }
  };

  // ─── Generate Drafts for All Selected ────────────────────────────
  const handleGenerateAll = async () => {
    const selected = results.map((r, i) => ({ r, i })).filter(
      ({ r }) => r.selected && r.parsedJob.post_email && r.draftStatus !== 'generated' && r.draftStatus !== 'approved' && r.draftStatus !== 'sent' && r.draftStatus !== 'already_sent'
    );

    if (selected.length === 0) {
      toast.error('No eligible selected results to generate drafts for');
      return;
    }

    setIsGeneratingDrafts(true);
    setGenerationProgress({ current: 0, total: selected.length });
    abortRef.current = false;

    for (let idx = 0; idx < selected.length; idx++) {
      if (abortRef.current) break;
      setGenerationProgress({ current: idx + 1, total: selected.length });
      await generateDraft(selected[idx].i);
      // Small delay to avoid rate limiting
      if (idx < selected.length - 1) await new Promise(r => setTimeout(r, 800));
    }

    setIsGeneratingDrafts(false);
    if (!abortRef.current) toast.success(`Draft generation complete!`);
  };

  // ─── Send Single Email ───────────────────────────────────────────
  const sendEmail = async (index: number): Promise<boolean> => {
    const result = results[index];

    // Edge case: no email address
    if (!result.parsedJob.post_email) {
      toast.error('No email found for this job post');
      return false;
    }

    // Edge case: validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(result.parsedJob.post_email)) {
      toast.error(`Invalid email address: ${result.parsedJob.post_email}`);
      updateResult(index, { draftStatus: 'error' });
      return false;
    }

    // Edge case: no draft body
    if (!result.draftBody || !result.draftBody.trim()) {
      toast.error('No draft body found. Please generate a draft first.');
      return false;
    }

    // Edge case: prevent double-send
    if (result.draftStatus === 'sent') {
      toast('Email already sent for this job.', { icon: '⚠️' });
      return false;
    }
    if (result.draftStatus === 'sending') {
      toast('Email is already being sent...', { icon: '⏳' });
      return false;
    }

    updateResult(index, { draftStatus: 'sending' });

    try {
      const providerToken = await getValidProviderToken();
      if (!providerToken) {
        toast.error('Gmail token expired. Please Sign Out and Sign In again.');
        updateResult(index, { draftStatus: 'error' });
        return false;
      }

      let formattedDraft = result.draftBody.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      formattedDraft = formattedDraft.replace(/\n/g, '<br/>');

      const trackingId = window.crypto?.randomUUID?.() || (Math.random().toString(36).substring(2) + Date.now().toString(36));
      const trackingServerBase = process.env.NEXT_PUBLIC_TRACKING_SERVER_URL || window.location.origin;
      const trackingUrl = trackingServerBase.includes('your-deployed-tracking-server')
        ? `${window.location.origin}/api/track?id=${trackingId}`
        : `${trackingServerBase}/track?id=${trackingId}`;
      const trackingPixel = `<img src="${trackingUrl}" width="1" height="1" style="display:none;width:1px;height:1px;" alt="" />`;
      const htmlBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">${formattedDraft}</div>${trackingPixel}`;

      // Edge case: fallback subject if empty
      const finalSubject = (result.draftSubject && result.draftSubject.trim())
        ? result.draftSubject
        : `Application for ${result.parsedJob.title || 'Open Role'}${result.parsedJob.company ? ` at ${result.parsedJob.company}` : ''}`;

      const res = await fetch('/api/gmail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${providerToken}` },
        body: JSON.stringify({
          to: result.parsedJob.post_email,
          subject: finalSubject,
          htmlBody,
          attachmentBase64: resumeBase64 || null,
          filename: resumeBase64 ? "Resume.pdf" : undefined,
        }),
      });

      const resData = await res.json();

      if (res.ok) {
        updateResult(index, { draftStatus: 'sent', selected: false });

        // Save to email_history
        const newRecord = {
          id: trackingId,
          user_id: user.id,
          company: result.parsedJob.company || 'LinkedIn (Auto Agent)',
          job_title: result.parsedJob.title || 'Job Match',
          recruiter_email: result.parsedJob.post_email,
          status: 'Sent',
          date: new Date().toISOString(),
          message_id: resData.messageId || 'N/A',
        };

        const { data: inserted, error } = await supabase.from('email_history').insert([newRecord]).select().single();
        if (inserted && !error) {
          setEmailHistory((prev: any[]) => [{
            id: inserted.id, company: inserted.company, jobTitle: inserted.job_title,
            recruiterEmail: inserted.recruiter_email, status: inserted.status,
            date: inserted.date, messageId: inserted.message_id,
            opened: false, openedAt: null, opensCount: 0,
          }, ...prev]);
        } else {
          // Fallback to local state if Supabase insert fails
          setEmailHistory((prev: any[]) => [{
            id: trackingId, company: newRecord.company, jobTitle: newRecord.job_title,
            recruiterEmail: newRecord.recruiter_email, status: newRecord.status,
            date: newRecord.date, messageId: newRecord.message_id,
            opened: false, openedAt: null, opensCount: 0,
          }, ...prev]);
        }

        return true;
      } else {
        const errMsg = resData?.error || `Gmail API error (${res.status})`;
        toast.error(`Send failed: ${errMsg}`);
        updateResult(index, { draftStatus: 'error' });
        return false;
      }
    } catch (err) {
      console.error('Send failed:', err);
      toast.error('Network error while sending email. Please check your connection.');
      updateResult(index, { draftStatus: 'error' });
      return false;
    }
  };

  // ─── Send All Approved ───────────────────────────────────────────
  const handleSendAllApproved = async () => {
    const approved = results.map((r, i) => ({ r, i })).filter(
      ({ r }) => (r.draftStatus === 'approved' || r.draftStatus === 'generated') && r.parsedJob.post_email && r.draftBody
    );

    if (approved.length === 0) {
      toast.error('No approved drafts to send');
      return;
    }

    setIsSendingAll(true);
    setSendProgress({ current: 0, total: approved.length, success: 0, failed: 0 });

    let success = 0, failed = 0;
    for (let idx = 0; idx < approved.length; idx++) {
      if (abortRef.current) break;
      const ok = await sendEmail(approved[idx].i);
      if (ok) success++; else failed++;
      setSendProgress({ current: idx + 1, total: approved.length, success, failed });
      if (idx < approved.length - 1) await new Promise(r => setTimeout(r, 1200));
    }

    setIsSendingAll(false);
    toast.success(`Sent ${success}/${approved.length} emails${failed > 0 ? ` (${failed} failed)` : ''}`);
  };

  // ─── Approve / Quick-Approve ─────────────────────────────────────
  const approveResult = (index: number) => updateResult(index, { draftStatus: 'approved' });
  const approveAllGenerated = () => {
    setResults(prev => prev.map(r =>
      r.draftStatus === 'generated' ? { ...r, draftStatus: 'approved' as const } : r
    ));
    toast.success('All generated drafts approved!');
  };

  // Filter results
  const filteredResults = filterTier === 'all'
    ? results.filter(r => r.tier !== 'disqualified')
    : results.filter(r => r.tier === filterTier);

  // Counts for action bar
  const generatedCount = results.filter(r => r.draftStatus === 'generated' || r.draftStatus === 'approved').length;
  const sentCount = results.filter(r => r.draftStatus === 'sent').length;

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-8 pt-6 pb-12 space-y-5">

      {/* ═══ Hero Banner ═══ */}
      <div className="relative overflow-hidden rounded-2xl border border-outline-variant bg-gradient-to-br from-primary/8 via-surface-container to-secondary/8 p-6 md:p-8 card-elevated backdrop-blur-md">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-secondary/5 rounded-full blur-[80px] pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-outline-variant flex items-center justify-center shadow-lg">
              <span className="material-symbols-outlined text-primary text-[28px]">smart_toy</span>
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl md:text-2xl font-bold text-on-surface">Auto Agent</h1>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-primary/15 text-primary border border-primary/20">Live</span>
              </div>
              <p className="text-sm text-on-surface-variant mt-1">
                Find → Generate Drafts → Send — all automated
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {lastSearchTime && (
              <span className="text-xs text-on-surface-variant flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">schedule</span>
                {lastSearchTime}
              </span>
            )}
            <div className="badge-glow badge-glow-online">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span>Online</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ Preferences Panel (Collapsible) ═══ */}
      <div className="bg-surface-container border border-outline-variant rounded-xl overflow-hidden card-elevated backdrop-blur-md">
        <button onClick={() => setShowPrefsPanel(!showPrefsPanel)} className="w-full flex items-center justify-between p-5 hover:bg-surface-container-highest/30 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-outline-variant flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[20px]">tune</span>
            </div>
            <div className="text-left">
              <h2 className="font-semibold text-on-surface">Job Preferences</h2>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {prefs.desiredTitles.length > 0
                  ? `${prefs.desiredTitles.join(', ')} • ${prefs.skills.length} skills • ${prefs.visaStatus.toUpperCase()}`
                  : 'Configure your job search criteria'
                }
              </p>
            </div>
          </div>
          <span className="material-symbols-outlined text-on-surface-variant transition-transform duration-300" style={{ transform: showPrefsPanel ? 'rotate(180deg)' : 'rotate(0)' }}>expand_more</span>
        </button>

        {showPrefsPanel && (
          <div className="px-5 pb-6 space-y-6 border-t border-outline-variant/50 pt-5 animate-slide-up">

            {/* ── Section 1: What You're Looking For ── */}
            <div className="space-y-4">
              <div className="pref-section-title">
                <span className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] text-primary">target</span>
                  What You're Looking For
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="flex items-center gap-1.5 text-[10px] font-extrabold text-on-surface-variant uppercase tracking-widest mb-2">
                    <span className="material-symbols-outlined text-[13px] text-primary/70">badge</span> Desired Job Titles
                  </label>
                  <TagInput tags={prefs.desiredTitles} setTags={t => updatePref('desiredTitles', t)} placeholder="e.g. ML Engineer, AI Engineer" icon="work" />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-[10px] font-extrabold text-on-surface-variant uppercase tracking-widest mb-2">
                    <span className="material-symbols-outlined text-[13px] text-primary/70">code</span> Your Skills
                  </label>
                  <TagInput tags={prefs.skills} setTags={t => updatePref('skills', t)} placeholder="e.g. python, react, pytorch" icon="terminal" />
                </div>
              </div>
            </div>

            {/* ── Section 2: Work Preferences ── */}
            <div className="space-y-4">
              <div className="pref-section-title">
                <span className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] text-primary">apartment</span>
                  Work Preferences
                </span>
              </div>

              {/* Work Mode — Interactive cards */}
              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-extrabold text-on-surface-variant uppercase tracking-widest mb-2.5">
                  <span className="material-symbols-outlined text-[13px] text-primary/70">home</span> Work Mode
                </label>
                <div className="grid grid-cols-3 gap-2.5">
                  {WORK_MODE_OPTIONS.map(w => {
                    const isActive = prefs.workModes.includes(w.value);
                    return (
                      <div
                        key={w.value}
                        onClick={() => toggleWorkMode(w.value)}
                        className={`pref-card text-center !p-4 ${isActive ? 'selected' : ''}`}
                      >
                        <div className="pref-card-check !top-2 !right-2 !w-[18px] !h-[18px]">
                          <span className="material-symbols-outlined text-[11px] text-on-primary" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>check</span>
                        </div>
                        <div className={`w-10 h-10 rounded-xl mx-auto mb-2 flex items-center justify-center transition-all ${
                          isActive ? 'bg-primary/15 text-primary' : 'bg-surface-container-high text-on-surface-variant'
                        }`}>
                          <span className="material-symbols-outlined text-[22px]" style={isActive ? { fontVariationSettings: "'FILL' 1, 'wght' 500" } : {}}>{w.icon}</span>
                        </div>
                        <p className={`text-xs font-bold ${isActive ? 'text-primary' : 'text-on-surface'}`}>{w.label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Employment Type — Pill toggles */}
              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-extrabold text-on-surface-variant uppercase tracking-widest mb-2.5">
                  <span className="material-symbols-outlined text-[13px] text-primary/70">contract</span> Employment Type
                </label>
                <div className="flex gap-2 flex-wrap">
                  {EMP_TYPE_OPTIONS.map(e => {
                    const isActive = prefs.empTypes.includes(e.value);
                    return (
                      <button
                        key={e.value}
                        onClick={() => toggleEmpType(e.value)}
                        className={`relative px-4 py-2.5 rounded-xl text-xs font-bold border-[1.5px] transition-all duration-300 ${
                          isActive
                            ? 'bg-primary/10 text-primary border-primary/30 shadow-[0_0_0_3px_rgba(var(--primary-rgb),0.08)]'
                            : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant hover:border-primary/20 hover:bg-primary/5'
                        }`}
                      >
                        {isActive && (
                          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-sm">
                            <span className="material-symbols-outlined text-[10px] text-on-primary" style={{ fontVariationSettings: "'FILL' 1, 'wght' 700" }}>check</span>
                          </span>
                        )}
                        {e.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Section 3: Requirements ── */}
            <div className="space-y-4">
              <div className="pref-section-title">
                <span className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px] text-primary">checklist</span>
                  Requirements & Filters
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* Experience Years */}
                <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/60 space-y-2">
                  <label className="flex items-center gap-1.5 text-[10px] font-extrabold text-on-surface-variant uppercase tracking-widest">
                    <span className="material-symbols-outlined text-[13px] text-primary/70">trending_up</span> Experience
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="relative group flex-1">
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary">stairs</span>
                      <input
                        type="number" min={0} max={30}
                        className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface text-sm font-semibold focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none"
                        value={prefs.experienceYears}
                        onChange={e => updatePref('experienceYears', parseInt(e.target.value) || 0)}
                      />
                    </div>
                    <span className="text-xs text-on-surface-variant font-medium whitespace-nowrap">years</span>
                  </div>
                </div>

                {/* Visa Status */}
                <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/60 space-y-2">
                  <label className="flex items-center gap-1.5 text-[10px] font-extrabold text-on-surface-variant uppercase tracking-widest">
                    <span className="material-symbols-outlined text-[13px] text-primary/70">public</span> Visa Status
                  </label>
                  <div className="relative group">
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary">id_card</span>
                    <select
                      className="w-full pl-9 pr-8 py-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface text-sm font-semibold focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none appearance-none cursor-pointer"
                      value={prefs.visaStatus}
                      onChange={e => updatePref('visaStatus', e.target.value)}
                    >
                      {VISA_OPTIONS.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                    </select>
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">expand_more</span>
                  </div>
                </div>

                {/* Min Salary */}
                <div className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/60 space-y-2">
                  <label className="flex items-center gap-1.5 text-[10px] font-extrabold text-on-surface-variant uppercase tracking-widest">
                    <span className="material-symbols-outlined text-[13px] text-primary/70">payments</span> Min Salary
                  </label>
                  <div className="relative group">
                    <span className="text-on-surface-variant text-sm font-bold absolute left-3 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary">$</span>
                    <input
                      type="number" min={0} step={5000}
                      className="w-full pl-8 pr-4 py-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface text-sm font-semibold focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none"
                      value={prefs.minSalary}
                      onChange={e => updatePref('minSalary', parseInt(e.target.value) || 0)}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              {/* Location Preferences */}
              <div>
                <label className="flex items-center gap-1.5 text-[10px] font-extrabold text-on-surface-variant uppercase tracking-widest mb-2">
                  <span className="material-symbols-outlined text-[13px] text-primary/70">location_on</span> Preferred Locations
                </label>
                <TagInput tags={prefs.locationPrefs} setTags={t => updatePref('locationPrefs', t)} placeholder="e.g. San Francisco, New York, Remote" icon="map" />
              </div>

              {/* Post Age */}
              <div className="max-w-xs">
                <label className="flex items-center gap-1.5 text-[10px] font-extrabold text-on-surface-variant uppercase tracking-widest mb-2">
                  <span className="material-symbols-outlined text-[13px] text-primary/70">calendar_today</span> Max Post Age
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative group flex-1">
                    <span className="material-symbols-outlined text-[16px] text-on-surface-variant absolute left-3 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary">schedule</span>
                    <input
                      type="number" min={1} max={90}
                      className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant text-on-surface text-sm font-semibold focus:border-primary focus:ring-1 focus:ring-primary transition-all outline-none"
                      value={prefs.maxPostAgeDays}
                      onChange={e => updatePref('maxPostAgeDays', parseInt(e.target.value) || 30)}
                    />
                  </div>
                  <span className="text-xs text-on-surface-variant font-medium whitespace-nowrap">days old</span>
                </div>
              </div>
            </div>

            {/* ── CTA Button ── */}
            <div className="pt-1">
              <button
                onClick={handleSearch}
                disabled={isSearching}
                className="group w-full md:w-auto px-10 py-4 rounded-xl ai-gradient-btn flex items-center justify-center gap-3 text-base disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
              >
                {/* Shimmer overlay on hover */}
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 pointer-events-none" />
                {isSearching ? (
                  <>
                    <div className="spinner" style={{ borderTopColor: '#0b0f10' }} />
                    <span>Scanning LinkedIn Posts...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[22px] group-hover:scale-110 transition-transform" style={{ fontVariationSettings: "'FILL' 1" }}>auto_awesome</span>
                    <span className="font-bold">Find Matching Jobs</span>
                    <span className="material-symbols-outlined text-[18px] group-hover:translate-x-1 transition-transform">arrow_forward</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ═══ Stats Bar ═══ */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in-right">
          {([
            { key: 'high', label: 'High Match', icon: 'rocket_launch', count: stats.high, cls: 'text-emerald-500' },
            { key: 'medium', label: 'Medium', icon: 'thumb_up', count: stats.medium, cls: 'text-amber-500' },
            { key: 'low', label: 'Low', icon: 'thumb_down', count: stats.low, cls: 'text-red-500' },
            { key: 'disqualified', label: 'Disqualified', icon: 'block', count: stats.disqualified, cls: 'text-gray-500' },
          ] as const).map(s => (
            <button key={s.key} onClick={() => setFilterTier(filterTier === s.key ? 'all' : s.key)}
              className={`p-4 rounded-xl border transition-all text-left backdrop-blur-md cursor-pointer ${filterTier === s.key ? 'border-primary/40 shadow-lg bg-primary/5 card-interactive' : 'border-outline-variant bg-surface-container hover:border-primary/20'}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`material-symbols-outlined ${s.cls} text-[20px]`}>{s.icon}</span>
                {filterTier === s.key && <span className="text-[10px] font-bold text-primary uppercase">Active</span>}
              </div>
              <p className="text-2xl font-bold text-on-surface">{s.count}</p>
              <p className="text-xs text-on-surface-variant">{s.label}</p>
            </button>
          ))}
        </div>
      )}

      {/* ═══ Action Bar (Generate / Send All) ═══ */}
      {results.length > 0 && (
        <div className="sticky top-0 z-20 bg-surface-container/95 backdrop-blur-xl border border-outline-variant rounded-xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xl">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <button onClick={selectAllEmailable} className="text-xs text-primary hover:underline font-medium">Select All ({emailableResults.length})</button>
              <span className="text-outline">|</span>
              <button onClick={deselectAll} className="text-xs text-on-surface-variant hover:underline font-medium">Deselect</button>
            </div>
            <span className="text-xs text-on-surface-variant">
              {selectedCount} selected • {generatedCount} drafted • {sentCount} sent
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Generate All Drafts */}
            <button
              onClick={isGeneratingDrafts ? () => { abortRef.current = true; } : handleGenerateAll}
              disabled={isSendingAll || selectedCount === 0}
              className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all border ${
                isGeneratingDrafts
                  ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                  : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {isGeneratingDrafts ? (
                <>
                  <div className="spinner" style={{ width: 14, height: 14 }} />
                  Generating {generationProgress.current}/{generationProgress.total}...
                  <span className="text-[10px] opacity-70 ml-1">(click to stop)</span>
                </>
              ) : (
                <><span className="material-symbols-outlined text-[16px]">auto_awesome</span> Generate Drafts</>
              )}
            </button>

            {/* Approve All */}
            {generatedCount > 0 && (
              <button onClick={approveAllGenerated} className="px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20 transition-all">
                <span className="material-symbols-outlined text-[16px]">done_all</span> Approve All
              </button>
            )}

            {/* Send All */}
            <button
              onClick={isSendingAll ? () => { abortRef.current = true; } : handleSendAllApproved}
              disabled={isGeneratingDrafts || generatedCount === 0}
              className={`px-4 py-2.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all border ${
                isSendingAll
                  ? 'bg-purple-500/15 text-purple-500 border-purple-500/30'
                  : 'ai-gradient-btn'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {isSendingAll ? (
                <>
                  <div className="spinner" style={{ width: 14, height: 14 }} />
                  Sending {sendProgress.current}/{sendProgress.total}...
                  <span className="text-[10px] opacity-70 ml-1">(click to stop)</span>
                </>
              ) : (
                <><span className="material-symbols-outlined text-[16px]">send</span> Send All</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ═══ Results List ═══ */}
      {filteredResults.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">leaderboard</span>
              <h2 className="font-semibold text-on-surface text-sm">
                {filterTier === 'all' ? 'All Results' : TIER_CONFIG[filterTier as keyof typeof TIER_CONFIG]?.label}
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">{filteredResults.length}</span>
            </div>
            {filterTier !== 'all' && (
              <button onClick={() => setFilterTier('all')} className="text-xs text-on-surface-variant hover:text-primary flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">close</span> Clear
              </button>
            )}
          </div>

          <div className="space-y-2">
            {filteredResults.slice(0, visibleCount).map((result, idx) => {
              const globalIdx = results.indexOf(result);
              const tier = TIER_CONFIG[result.tier];
              const job = result.parsedJob;
              const status = STATUS_CONFIG[result.draftStatus || 'idle'];
              const isExpanded = expandedCard === globalIdx;
              const isDraftExpanded = expandedDraftCard === globalIdx;
              const isEditing = editingDraft === globalIdx;

              return (
                <div key={`${result.id}-${idx}`}
                  className={`bg-surface-container border rounded-xl overflow-hidden transition-all duration-200 hover:shadow-md backdrop-blur-md ${
                    result.tier === 'high' ? 'border-l-[3px] border-l-emerald-500' : result.tier === 'medium' ? 'border-l-[3px] border-l-amber-500' : result.tier === 'low' ? 'border-l-[3px] border-l-red-500' : ''
                  } ${
                    result.selected ? 'border-primary/40 shadow-[0_0_12px_rgba(var(--primary-rgb),0.1)]' : 'border-outline-variant'
                  } ${(result.draftStatus === 'sent' || result.draftStatus === 'already_sent') ? 'opacity-70' : ''}`}
                >
                  {/* Compact Row */}
                  <div className="flex items-center gap-3 p-3 md:p-4">
                    {/* Checkbox */}
                    {job.post_email && (
                      result.draftStatus === 'sent' ? (
                        <span className="material-symbols-outlined text-emerald-500 text-[18px] shrink-0" title="Email sent this session">check_circle</span>
                      ) : result.draftStatus === 'already_sent' ? (
                        <span className="material-symbols-outlined text-violet-400 text-[18px] shrink-0" title="Email was already sent previously">mark_email_read</span>
                      ) : (
                        <input
                          type="checkbox"
                          checked={result.selected || false}
                          onChange={() => toggleSelect(globalIdx)}
                          disabled={result.draftStatus === 'sending'}
                          className={`rounded border-outline-variant bg-surface-container text-primary focus:ring-primary/20 shrink-0 ${result.draftStatus === 'sending' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        />
                      )
                    )}
                    {!job.post_email && <div className="w-4" />}

                    {/* Score Dot */}
                    <div className={`w-3 h-3 rounded-full ${tier.dotClass} shrink-0`} title={`${result.score}/100`} />

                    {/* Job Info */}
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedCard(isExpanded ? null : globalIdx)}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-on-surface text-sm truncate max-w-[280px]">
                          {job.title || 'Untitled'}
                        </h3>
                        {job.company && (
                          <span className="text-[11px] text-on-surface-variant">at {job.company}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {job.location && <span className="text-[10px] text-on-surface-variant">{job.location}</span>}
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                          job.workMode === 'remote' ? 'bg-emerald-500/10 text-emerald-500' :
                          job.workMode === 'hybrid' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'
                        }`}>{job.workMode}</span>
                        {result.breakdown?.skills?.matched?.slice(0, 3).map((s, i) => (
                          <span key={i} className="px-1.5 py-0.5 rounded bg-primary/8 text-primary text-[9px] font-medium">✓{s}</span>
                        ))}
                      </div>
                    </div>

                    {/* Score Badge */}
                    <div className={`px-2.5 py-1 rounded-full ${tier.bgClass} border ${tier.borderClass} flex items-center gap-1 shrink-0`}>
                      <span className="text-[11px]">{tier.emoji}</span>
                      <span className={`text-xs font-bold ${tier.textClass}`}>{result.score}</span>
                    </div>

                    {/* Status Badge */}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        if (result.draftStatus === 'generated' || result.draftStatus === 'approved' || result.draftStatus === 'sent' || result.draftStatus === 'generating') {
                          setExpandedDraftCard(isDraftExpanded ? null : globalIdx);
                          if (!isDraftExpanded) setExpandedCard(null); // Close breakdown if opening draft
                        }
                      }}
                      className={`px-2 py-1 rounded-md text-[10px] font-semibold flex items-center gap-1 shrink-0 ${status.classes} ${(result.draftStatus === 'generated' || result.draftStatus === 'approved' || result.draftStatus === 'sent') ? 'cursor-pointer hover:opacity-80 transition-opacity' : 'cursor-default'}`}
                    >
                      <span className="material-symbols-outlined text-[12px]">{status.icon}</span>
                      {status.label}
                    </button>

                    {/* Quick Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {job.post_email && result.draftStatus === 'idle' && (
                        <button onClick={() => generateDraft(globalIdx)} title="Generate Draft"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-all">
                          <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                        </button>
                      )}
                      {(result.draftStatus === 'generated') && (
                        <button onClick={() => approveResult(globalIdx)} title="Approve"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-emerald-500 hover:bg-emerald-500/10 transition-all">
                          <span className="material-symbols-outlined text-[18px]">check_circle</span>
                        </button>
                      )}
                      {(result.draftStatus === 'generated' || result.draftStatus === 'approved') && (
                        <button onClick={() => sendEmail(globalIdx)} title="Send Now"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-primary hover:bg-primary/10 transition-all">
                          <span className="material-symbols-outlined text-[18px]">send</span>
                        </button>
                      )}
                      {job.job_link && job.job_link.toLowerCase() !== 'n/a' && (
                        <a href={job.job_link} target="_blank" rel="noopener noreferrer" title="Apply Link"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-blue-500 hover:bg-blue-500/10 transition-all">
                          <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                        </a>
                      )}
                      <button onClick={(e) => {
                          e.stopPropagation();
                          setExpandedCard(isExpanded ? null : globalIdx);
                          if (!isExpanded) setExpandedDraftCard(null); // Close draft if opening breakdown
                        }} title="Expand"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-all">
                        <span className="material-symbols-outlined text-[18px] transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)' }}>expand_more</span>
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="border-t border-outline-variant/50 p-4 space-y-4 animate-fade-in-right bg-surface-container-low/30">
                      {/* Score Breakdown */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Score Breakdown</h4>
                          {result.breakdown?.skills && <ScoreBar label="Skills" score={result.breakdown.skills.score} icon="code" />}
                          {result.breakdown?.title && <ScoreBar label="Title" score={result.breakdown.title.score} icon="badge" />}
                          {result.breakdown?.exp && <ScoreBar label="Exp" score={result.breakdown.exp.score} icon="trending_up" />}
                          {result.breakdown?.loc && <ScoreBar label="Location" score={result.breakdown.loc.score} icon="location_on" />}
                          {result.breakdown?.visa && <ScoreBar label="Visa" score={result.breakdown.visa.score} icon="public" />}
                          {result.breakdown?.emp && <ScoreBar label="Emp Type" score={result.breakdown.emp.score} icon="work" />}
                        </div>
                        <div className="space-y-2">
                          <h4 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Job Details</h4>
                          {job.salaryMin && (
                            <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[14px]">payments</span>
                              ${(job.salaryMin / 1000).toFixed(0)}k{job.salaryMax ? ` - $${(job.salaryMax / 1000).toFixed(0)}k` : '+'}
                            </p>
                          )}
                          {job.expRange && (
                            <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[14px]">schedule</span>
                              {job.expRange.min}-{job.expRange.max} years experience
                            </p>
                          )}
                          {job.post_email && (
                            <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[14px]">mail</span>
                              {job.post_email}
                            </p>
                          )}
                          {job.raw_name && (
                            <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[14px]">person</span>
                              Posted by {job.raw_name}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {result.breakdown?.skills?.matched?.map((s, i) => (
                              <span key={i} className="px-2 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-semibold">✓ {s}</span>
                            ))}
                          </div>
                          {result.disqualifyReason && (
                            <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/8 border border-red-500/15 flex items-start gap-2">
                              <span className="material-symbols-outlined text-red-500 text-[14px] mt-0.5">block</span>
                              <p className="text-[11px] text-red-500">{result.disqualifyReason}</p>
                            </div>
                          )}
                          {/* Links */}
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {job.job_link && job.job_link.toLowerCase() !== 'n/a' && (
                              <a href={job.job_link} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-[11px] font-semibold hover:bg-primary/20 border border-primary/15 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">open_in_new</span> Apply
                              </a>
                            )}
                            {job.post_url && job.post_url.toLowerCase() !== 'n/a' && (
                              <a href={job.post_url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-500 text-[11px] font-semibold hover:bg-blue-500/20 border border-blue-500/15 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">link</span> Post
                              </a>
                            )}
                            {job.poster_profile_url && job.poster_profile_url.toLowerCase() !== 'n/a' && (
                              <a href={job.poster_profile_url} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-surface-container-high text-on-surface-variant text-[11px] font-semibold hover:bg-primary/10 border border-outline-variant flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">person</span> Profile
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Expanded Draft */}
                  {isDraftExpanded && (result.draftStatus === 'generated' || result.draftStatus === 'approved' || result.draftStatus === 'sent') && result.draftBody && (
                    <div className="border-t border-outline-variant/50 p-4 animate-fade-in-right bg-surface-container-low/30">
                      <div className="">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[14px]">edit_note</span> Email Draft
                            </h4>
                            <div className="flex items-center gap-3">
                              <button 
                                onClick={() => {
                                  ctx.setOutreachTab('auto_agent');
                                  ctx.setPreviewBody(result.draftBody || '');
                                  ctx.setPreviewSubject(result.draftSubject || '');
                                  ctx.setPreviewRecruiterName(result.parsedJob.raw_name || result.parsedJob.company || 'Candidate');
                                  ctx.setPreviewRecruiterEmail(result.parsedJob.post_email || '');
                                  ctx.setShowPreview(true);
                                }} 
                                className="text-[11px] text-primary hover:underline font-medium flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[14px]">visibility</span>
                                Preview
                              </button>
                              
                              {result.draftStatus !== 'sent' && (
                                <button 
                                  onClick={() => setEditingDraft(isEditing ? null : globalIdx)} 
                                  className="text-[11px] text-primary hover:underline font-medium flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-[14px]">{isEditing ? 'close' : 'edit'}</span>
                                  {isEditing ? 'Close Edit' : 'Edit'}
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-3">
                            <p className="text-[11px] font-semibold text-on-surface mb-2">Subject: {result.draftSubject}</p>
                            {isEditing ? (
                              <>
                                <input
                                  className="w-full mb-2 px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-on-surface text-xs focus:border-primary outline-none"
                                  value={result.draftSubject}
                                  onChange={e => updateResult(globalIdx, { draftSubject: e.target.value })}
                                  placeholder="Subject"
                                />
                                <textarea
                                  className="w-full px-3 py-2 rounded-lg bg-surface-container border border-outline-variant text-on-surface text-xs focus:border-primary outline-none resize-y min-h-[120px]"
                                  value={result.draftBody}
                                  onChange={e => updateResult(globalIdx, { draftBody: e.target.value })}
                                  rows={6}
                                />
                              </>
                            ) : (
                              <div className="text-xs text-on-surface-variant whitespace-pre-wrap max-h-[200px] overflow-y-auto select-text leading-relaxed">
                                {result.draftBody}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Load More */}
          {visibleCount < filteredResults.length && (
            <div className="flex justify-center mt-6">
              <button onClick={() => setVisibleCount(prev => prev + 20)}
                className="px-8 py-3 rounded-xl border border-outline-variant bg-surface-container text-on-surface font-semibold text-sm hover:border-primary/40 hover:bg-primary/5 transition-all flex items-center gap-2 backdrop-blur-md shadow-sm">
                <span className="material-symbols-outlined text-[18px]">expand_more</span>
                Load More ({filteredResults.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ═══ Empty State ═══ */}
      {!isSearching && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-outline-variant flex items-center justify-center mb-6 animate-float-subtle animate-glow-pulse">
            <span className="material-symbols-outlined text-primary text-[40px]">travel_explore</span>
          </div>
          <h3 className="text-lg font-semibold text-on-surface mb-2">Ready to Find Your Dream Job</h3>
          <p className="text-sm text-on-surface-variant max-w-md">
            Set your preferences and hit <strong>"Find Matching Jobs"</strong> → Generate Drafts → Send!
          </p>
        </div>
      )}

      {/* ═══ Loading State ═══ */}
      {isSearching && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="relative w-20 h-20 mb-6">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20 animate-ping" />
            <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-primary animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary text-[32px]">auto_awesome</span>
            </div>
          </div>
          <h3 className="text-lg font-semibold text-on-surface mb-2">AI Agent is Working...</h3>
          <p className="text-sm text-on-surface-variant">Scanning posts, parsing jobs, scoring matches</p>
        </div>
      )}
    </div>
  );
}
