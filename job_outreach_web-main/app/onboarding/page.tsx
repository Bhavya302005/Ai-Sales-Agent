'use client';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

const STEPS = [
  { id: 'welcome', title: 'Welcome', icon: 'waving_hand' },
  { id: 'resume', title: 'Resume', icon: 'upload_file' },
  { id: 'profile', title: 'Profile', icon: 'person' },
  { id: 'preferences', title: 'Preferences', icon: 'tune' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [slideDir, setSlideDir] = useState<'next' | 'prev'>('next');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Profile fields
  const [fullName, setFullName] = useState('');
  const [currentTitle, setCurrentTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [jobType, setJobType] = useState('Full-time');
  const [toneStyle, setToneStyle] = useState('Direct & Execution-focused');
  const [resumeText, setResumeText] = useState('');
  const [resumeBase64, setResumeBase64] = useState('');
  const [resumeFileName, setResumeFileName] = useState('');

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        router.push('/');
        return;
      }
      setUser(session.user);

      // Check if already onboarded
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('onboarding_completed')
        .eq('user_id', session.user.id)
        .single();

      if (profile?.onboarding_completed) {
        router.push('/dashboard');
      }
    };
    checkUser();
  }, [router]);

  const goNext = () => {
    if (step < STEPS.length - 1) {
      setSlideDir('next');
      setStep(s => s + 1);
    }
  };

  const goBack = () => {
    if (step > 0) {
      setSlideDir('prev');
      setStep(s => s - 1);
    }
  };

  // Simple regex-based field extraction from resume text (no AI)
  const extractFieldsFromText = (text: string) => {
    const fields: Record<string, string> = {};

    // Extract LinkedIn URL
    const linkedinMatch = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[^\s,)}\]]+/i);
    if (linkedinMatch) fields.linkedin_url = linkedinMatch[0].replace(/[.,;:]+$/, '');

    // Extract GitHub URL
    const githubMatch = text.match(/https?:\/\/(?:www\.)?github\.com\/[^\s,)}\]]+/i);
    if (githubMatch) fields.github_url = githubMatch[0].replace(/[.,;:]+$/, '');

    // Extract phone number (Indian & international formats)
    const phoneMatch = text.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3,5}\)?[-.\s]?\d{3,5}[-.\s]?\d{3,5}/);
    if (phoneMatch) {
      const cleaned = phoneMatch[0].trim();
      // Only accept if it looks like a real phone number (7+ digits)
      if (cleaned.replace(/\D/g, '').length >= 7) {
        fields.phone = cleaned;
      }
    }

    // Extract portfolio/personal website (any URL that's not LinkedIn/GitHub/email)
    const urlMatches = text.match(/https?:\/\/[^\s,)}\]]+/gi) || [];
    for (const url of urlMatches) {
      const cleanUrl = url.replace(/[.,;:]+$/, '');
      if (
        !cleanUrl.includes('linkedin.com') &&
        !cleanUrl.includes('github.com') &&
        !cleanUrl.includes('mailto:') &&
        !cleanUrl.includes('fonts.google') &&
        !cleanUrl.includes('googleapis.com')
      ) {
        fields.portfolio_url = cleanUrl;
        break;
      }
    }

    // Extract name: typically the first non-empty, non-URL, non-email line
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    for (const line of lines.slice(0, 5)) {
      // Skip lines that are URLs, emails, phone numbers, or too long
      if (
        line.match(/^https?:\/\//i) ||
        line.includes('@') ||
        line.match(/^\+?\d[\d\s\-().]{6,}$/) ||
        line.length > 60 ||
        line.toLowerCase().includes('resume') ||
        line.toLowerCase().includes('curriculum')
      ) continue;
      // Name should be mostly letters and spaces, 2-50 chars
      if (line.match(/^[A-Za-z\s.'-]{2,50}$/) && line.split(/\s+/).length <= 5) {
        fields.full_name = line;
        break;
      }
    }

    return fields;
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResumeFileName(file.name);
    setIsExtracting(true);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target?.result as string;
      setResumeBase64(base64Data);

      try {
        // Get plain text from resume PDF
        const res = await fetch('/api/resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Data }),
        });

        const data = await res.json();
        if (res.ok && data.text) {
          setResumeText(data.text);

          // Extract fields using simple regex (no AI)
          const extracted = extractFieldsFromText(data.text);
          if (extracted.full_name) setFullName(extracted.full_name);
          if (extracted.phone) setPhone(extracted.phone);
          if (extracted.linkedin_url) setLinkedinUrl(extracted.linkedin_url);
          if (extracted.github_url) setGithubUrl(extracted.github_url);
          if (extracted.portfolio_url) setPortfolioUrl(extracted.portfolio_url);

          toast.success('Resume processed! Please review your details.');

          // Auto advance to profile review step
          setTimeout(() => {
            setSlideDir('next');
            setStep(2);
          }, 600);
        } else {
          toast.error('Error parsing resume: ' + (data.error || 'Unknown error'));
        }
      } catch (err: any) {
        toast.error('Failed to process resume.');
        console.error(err);
      } finally {
        setIsExtracting(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleComplete = async () => {
    if (!fullName.trim()) {
      toast.error('Please enter your full name to continue.');
      return;
    }
    if (!user) return;

    setIsSaving(true);

    // Build signature
    const lines = ['Regards,', fullName || 'Your Name'];
    const details = [currentTitle, phone].filter(Boolean).join(' | ');
    if (details) lines.push(details);
    if (linkedinUrl) lines.push(linkedinUrl);
    if (githubUrl) lines.push(githubUrl);
    if (portfolioUrl) lines.push(portfolioUrl);
    const signature = lines.join('\n');

    try {
      const { error } = await supabase.from('user_profiles').upsert({
        user_id: user.id,
        full_name: fullName,
        current_title: currentTitle,
        phone: phone,
        linkedin_url: linkedinUrl,
        github_url: githubUrl,
        portfolio_url: portfolioUrl,
        experience_level: experienceLevel,
        default_tone_style: toneStyle,
        default_job_type: jobType,
        resume_text: resumeText,
        resume_base64: resumeBase64,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

      if (error) throw error;

      // Save settings to localStorage
      localStorage.setItem('email_signature', signature);
      localStorage.setItem('default_ai_model', 'gemini');

      toast.success('Profile setup complete! Welcome to Job Mail Loop 🚀');

      // Short delay for toast to show, then redirect
      setTimeout(() => router.push('/dashboard'), 600);
    } catch (err: any) {
      toast.error('Error saving profile: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const progressPct = ((step + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient background orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-secondary/5 blur-[100px] pointer-events-none" />

      <div className="w-full max-w-2xl relative z-10">
        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2">
              <button
                onClick={() => { if (i < step) { setSlideDir('prev'); setStep(i); } }}
                className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-all duration-500 ${
                  i === step
                    ? 'bg-gradient-to-br from-primary to-secondary text-on-primary shadow-lg shadow-primary/25 scale-110'
                    : i < step
                    ? 'bg-primary/15 text-primary border border-primary/25 cursor-pointer hover:bg-primary/25'
                    : 'bg-surface-container-high text-on-surface-variant border border-outline-variant'
                }`}
              >
                {i < step ? (
                  <span className="material-symbols-outlined text-[18px]">check</span>
                ) : (
                  <span className="material-symbols-outlined text-[18px]">{s.icon}</span>
                )}
              </button>
              {i < STEPS.length - 1 && (
                <div className={`w-12 h-0.5 rounded-full transition-all duration-500 ${
                  i < step ? 'bg-primary' : 'bg-outline-variant'
                }`} />
              )}
            </div>
          ))}
        </div>

        {/* Progress bar */}
        <div className="w-full h-1 bg-outline-variant/30 rounded-full mb-6 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary to-secondary rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Card */}
        <div
          className="glass-card rounded-3xl border border-outline-variant overflow-hidden"
          style={{
            backgroundColor: 'var(--surface-container)',
            boxShadow: '0 25px 60px -12px rgba(0, 0, 0, 0.4), 0 0 40px rgba(var(--primary-rgb), 0.08)',
          }}
        >
          {/* Top accent */}
          <div className="h-1 bg-gradient-to-r from-primary via-secondary to-tertiary" />

          <div className="p-8 md:p-10">
            {/* STEP 0: Welcome */}
            {step === 0 && (
              <div className="text-center space-y-6 animate-slide-up">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mx-auto shadow-lg shadow-primary/20">
                  <span className="material-symbols-outlined text-[40px] text-on-primary">rocket_launch</span>
                </div>
                <div>
                  <h1 className="text-2xl md:text-3xl font-black text-on-surface tracking-tight">
                    Welcome to <span className="bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 bg-clip-text text-transparent">Job Mail Loop</span>
                  </h1>
                  <p className="text-on-surface-variant mt-3 text-sm leading-relaxed max-w-md mx-auto">
                    Let's set up your profile in under 2 minutes. Upload your resume and we will auto-fill your details for you.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4">
                  {[
                    { icon: 'smart_toy', title: 'AI-Powered Emails', desc: 'Personalized outreach in seconds' },
                    { icon: 'speed', title: 'Bulk Campaigns', desc: 'Send to 100+ recruiters at once' },
                    { icon: 'inbox', title: 'Reply Scanner', desc: 'Auto-detect interview invites' },
                  ].map((f, i) => (
                    <div key={i} className="p-4 rounded-xl bg-surface-container-low border border-outline-variant/40 text-center space-y-2 hover:border-primary/30 transition-all duration-300">
                      <span className="material-symbols-outlined text-[24px] text-primary">{f.icon}</span>
                      <h4 className="text-xs font-bold text-on-surface">{f.title}</h4>
                      <p className="text-[10px] text-on-surface-variant">{f.desc}</p>
                    </div>
                  ))}
                </div>

                <button
                  onClick={goNext}
                  className="mt-6 px-8 py-3 bg-gradient-to-r from-primary to-secondary text-on-primary font-bold text-sm rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:opacity-95 active:scale-95 transition-all flex items-center gap-2 mx-auto"
                >
                  Let's Get Started
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </button>
              </div>
            )}

            {/* STEP 1: Resume Upload */}
            {step === 1 && (
              <div className="space-y-6 animate-slide-up">
                <div className="text-center">
                  <h2 className="text-xl md:text-2xl font-bold text-on-surface">Upload Your Resume</h2>
                  <p className="text-on-surface-variant text-sm mt-2">
                    We will extract your details and auto-fill your profile. You can review and edit everything in the next step.
                  </p>
                </div>

                {/* Upload area */}
                <div
                  onClick={() => !isExtracting && fileInputRef.current?.click()}
                  className={`relative p-8 rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer group ${
                    resumeBase64
                      ? 'border-emerald-500/40 bg-emerald-500/5 hover:border-emerald-500/60'
                      : 'border-outline-variant hover:border-primary/50 bg-surface-container-low hover:bg-primary/5'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={handleResumeUpload}
                    disabled={isExtracting}
                  />

                  <div className="flex flex-col items-center text-center space-y-4">
                    {isExtracting ? (
                      <>
                        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                          <div className="w-8 h-8 rounded-full border-3 border-primary border-t-transparent animate-spin" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface">Uploading and processing resume...</p>
                          <p className="text-xs text-on-surface-variant mt-1">Please wait a moment</p>
                        </div>
                      </>
                    ) : resumeBase64 ? (
                      <>
                        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                          <span className="material-symbols-outlined text-[32px] text-emerald-500">check_circle</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface">Resume Processed Successfully!</p>
                          <p className="text-xs text-emerald-500 font-semibold mt-1">{resumeFileName}</p>
                          <p className="text-xs text-on-surface-variant mt-2">All fields have been auto-filled. Click to upload a different resume.</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
                          <span className="material-symbols-outlined text-[32px] text-primary">cloud_upload</span>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-on-surface">Drop your resume PDF here</p>
                          <p className="text-xs text-on-surface-variant mt-1">or click to browse • PDF files up to 5 MB</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-between items-center pt-4">
                  <button onClick={goBack} className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all active:scale-95">
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                      Back
                    </span>
                  </button>
                  <div className="flex gap-3">
                    <button
                      onClick={goNext}
                      className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all active:scale-95"
                    >
                      Skip
                    </button>
                    <button
                      onClick={goNext}
                      disabled={isExtracting}
                      className="px-6 py-2.5 bg-gradient-to-r from-primary to-secondary text-on-primary font-bold text-sm rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/35 hover:opacity-95 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                      Next
                      <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Review/Edit Profile */}
            {step === 2 && (
              <div className="space-y-6 animate-slide-up">
                <div className="text-center">
                  <h2 className="text-xl md:text-2xl font-bold text-on-surface">Review Your Profile</h2>
                  <p className="text-on-surface-variant text-sm mt-2">
                    {resumeBase64
                      ? 'These fields were auto-filled from your resume. Edit anything you want.'
                      : 'Fill in your details below. These will be used to personalize your outreach emails.'}
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Row 1: Name + Title */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1.5">
                        Full Name <span className="text-error">*</span>
                      </label>
                      <div className="relative group">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary">person</span>
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full bg-surface-dim text-on-surface border border-outline-variant hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-300"
                          placeholder="e.g. Rahul Sharma"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1.5">Current / Target Title</label>
                      <div className="relative group">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary">work</span>
                        <input
                          type="text"
                          value={currentTitle}
                          onChange={(e) => setCurrentTitle(e.target.value)}
                          className="w-full bg-surface-dim text-on-surface border border-outline-variant hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-300"
                          placeholder="e.g. AI Engineer"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Phone + LinkedIn */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1.5">Phone Number</label>
                      <div className="relative group">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary">call</span>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="w-full bg-surface-dim text-on-surface border border-outline-variant hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-300"
                          placeholder="+91 93282 98587"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1.5">LinkedIn URL</label>
                      <div className="relative group">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary">link</span>
                        <input
                          type="url"
                          value={linkedinUrl}
                          onChange={(e) => setLinkedinUrl(e.target.value)}
                          className="w-full bg-surface-dim text-on-surface border border-outline-variant hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-300"
                          placeholder="https://linkedin.com/in/..."
                        />
                      </div>
                    </div>
                  </div>

                  {/* Row 3: GitHub + Portfolio */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1.5">GitHub URL</label>
                      <div className="relative group">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary">code</span>
                        <input
                          type="url"
                          value={githubUrl}
                          onChange={(e) => setGithubUrl(e.target.value)}
                          className="w-full bg-surface-dim text-on-surface border border-outline-variant hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-300"
                          placeholder="https://github.com/..."
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1.5">Portfolio URL</label>
                      <div className="relative group">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary">language</span>
                        <input
                          type="url"
                          value={portfolioUrl}
                          onChange={(e) => setPortfolioUrl(e.target.value)}
                          className="w-full bg-surface-dim text-on-surface border border-outline-variant hover:border-primary/50 focus:border-primary focus:ring-1 focus:ring-primary pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all duration-300"
                          placeholder="https://myportfolio.com"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-between items-center pt-4">
                  <button onClick={goBack} className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all active:scale-95">
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                      Back
                    </span>
                  </button>
                  <button
                    onClick={goNext}
                    disabled={!fullName.trim()}
                    className="px-6 py-2.5 bg-gradient-to-r from-primary to-secondary text-on-primary font-bold text-sm rounded-xl shadow-lg shadow-primary/20 hover:shadow-primary/35 hover:opacity-95 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    Next
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: AI Preferences — Premium Card-Based Selection */}
            {step === 3 && (
              <div className="space-y-7 animate-slide-up">
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/8 border border-primary/15 text-primary text-[10px] font-bold uppercase tracking-widest mb-3">
                    <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                    Almost Done
                  </div>
                  <h2 className="text-xl md:text-2xl font-bold text-on-surface">Customize Your AI</h2>
                  <p className="text-on-surface-variant text-sm mt-2 max-w-md mx-auto">
                    Tell us about yourself so our AI can craft the perfect outreach emails. You can change these anytime.
                  </p>
                </div>

                {/* ── Experience Level ── */}
                <div className="space-y-3">
                  <div className="pref-section-title">
                    <span className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[14px] text-primary">trending_up</span>
                      Experience Level
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {[
                      { value: 'Fresher', label: 'Fresher', sub: '0-1 yr', icon: 'school', color: 'bg-emerald-500/10 text-emerald-500' },
                      { value: 'Junior', label: 'Junior', sub: '1-3 yrs', icon: 'rocket_launch', color: 'bg-sky-500/10 text-sky-500' },
                      { value: 'Mid-Level', label: 'Mid-Level', sub: '3-5 yrs', icon: 'workspace_premium', color: 'bg-violet-500/10 text-violet-500' },
                      { value: 'Senior', label: 'Senior', sub: '5-8 yrs', icon: 'military_tech', color: 'bg-amber-500/10 text-amber-500' },
                      { value: 'Lead', label: 'Lead', sub: '8+ yrs', icon: 'shield_person', color: 'bg-rose-500/10 text-rose-500' },
                      { value: 'Executive', label: 'Executive', sub: 'Director+', icon: 'diamond', color: 'bg-indigo-500/10 text-indigo-500' },
                    ].map((opt, i) => (
                      <div
                        key={opt.value}
                        onClick={() => setExperienceLevel(opt.value)}
                        className={`pref-card pref-card-reveal ${experienceLevel === opt.value ? 'selected' : ''}`}
                        style={{ animationDelay: `${i * 60}ms` }}
                      >
                        <div className="pref-card-check">
                          <span className="material-symbols-outlined text-[14px] text-on-primary" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>check</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`pref-card-icon ${opt.color}`}>
                            <span className="material-symbols-outlined text-[20px]">{opt.icon}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-bold text-on-surface leading-tight">{opt.label}</p>
                            <p className="text-[10px] text-on-surface-variant mt-0.5">{opt.sub}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Job Type ── */}
                <div className="space-y-3">
                  <div className="pref-section-title">
                    <span className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[14px] text-primary">work</span>
                      Preferred Job Type
                    </span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {[
                      { value: 'Full-time', icon: 'business_center', emoji: '💼' },
                      { value: 'Part-time', icon: 'schedule', emoji: '⏰' },
                      { value: 'Contract', icon: 'handshake', emoji: '🤝' },
                      { value: 'Internship', icon: 'school', emoji: '🎓' },
                      { value: 'Freelance', icon: 'laptop_mac', emoji: '💻' },
                    ].map((opt) => (
                      <div
                        key={opt.value}
                        onClick={() => setJobType(opt.value)}
                        className={`pref-card text-center !p-3 ${jobType === opt.value ? 'selected' : ''}`}
                      >
                        <div className="pref-card-check !top-1.5 !right-1.5 !w-[18px] !h-[18px]">
                          <span className="material-symbols-outlined text-[11px] text-on-primary" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>check</span>
                        </div>
                        <div className="text-xl mb-1.5">{opt.emoji}</div>
                        <p className="text-[11px] font-bold text-on-surface leading-tight">{opt.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Tone Style ── */}
                <div className="space-y-3">
                  <div className="pref-section-title">
                    <span className="text-[10px] font-extrabold text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[14px] text-primary">psychology</span>
                      Email Tone & Style
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {[
                      { value: 'Direct & Execution-focused', icon: 'bolt', desc: 'Get straight to the point with results and impact', gradient: 'from-orange-500/10 to-amber-500/5', iconColor: 'text-orange-500 bg-orange-500/10' },
                      { value: 'Warm & Conversational', icon: 'favorite', desc: 'Friendly and personable, builds genuine rapport', gradient: 'from-rose-500/10 to-pink-500/5', iconColor: 'text-rose-500 bg-rose-500/10' },
                      { value: 'Highly Technical', icon: 'terminal', desc: 'Deep technical detail, specs and architecture focus', gradient: 'from-cyan-500/10 to-sky-500/5', iconColor: 'text-cyan-500 bg-cyan-500/10' },
                      { value: 'Visionary & Strategic', icon: 'visibility', desc: 'Big picture thinking, leadership and vision-driven', gradient: 'from-violet-500/10 to-purple-500/5', iconColor: 'text-violet-500 bg-violet-500/10' },
                      { value: 'Creative & Enthusiastic', icon: 'palette', desc: 'Energetic and imaginative, showcases creative flair', gradient: 'from-emerald-500/10 to-teal-500/5', iconColor: 'text-emerald-500 bg-emerald-500/10' },
                    ].map((opt, i) => (
                      <div
                        key={opt.value}
                        onClick={() => setToneStyle(opt.value)}
                        className={`pref-card pref-card-reveal ${toneStyle === opt.value ? 'selected' : ''}`}
                        style={{ animationDelay: `${i * 80}ms` }}
                      >
                        <div className="pref-card-check">
                          <span className="material-symbols-outlined text-[14px] text-on-primary" style={{ fontVariationSettings: "'FILL' 1, 'wght' 600" }}>check</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`pref-card-icon ${opt.iconColor}`}>
                            <span className="material-symbols-outlined text-[20px]">{opt.icon}</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-bold text-on-surface leading-tight">{opt.value}</p>
                            <p className="text-[10px] text-on-surface-variant mt-0.5 leading-snug">{opt.desc}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Profile Completion Summary ── */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-surface-container-low to-surface-container border border-outline-variant/40 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[14px] text-primary">verified</span>
                      Profile Ready
                    </h4>
                    {/* Completion percentage */}
                    <div className="flex items-center gap-2">
                      <div className="relative w-9 h-9">
                        <svg className="w-full h-full -rotate-90" viewBox="0 0 56 56">
                          <circle cx="28" cy="28" r="25" fill="none" stroke="var(--outline-variant)" strokeWidth="3" opacity="0.3" />
                          <circle
                            cx="28" cy="28" r="25" fill="none"
                            stroke="url(#completionGrad)"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeDasharray="157"
                            strokeDashoffset={157 - (157 * (
                              [fullName, currentTitle, experienceLevel, jobType, toneStyle, resumeBase64].filter(Boolean).length / 6
                            ))}
                            className="profile-ring"
                          />
                          <defs>
                            <linearGradient id="completionGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                              <stop offset="0%" stopColor="var(--primary)" />
                              <stop offset="100%" stopColor="var(--secondary)" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-primary">
                          {Math.round(([fullName, currentTitle, experienceLevel, jobType, toneStyle, resumeBase64].filter(Boolean).length / 6) * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-md shadow-indigo-500/20">
                      {fullName ? fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-on-surface truncate">{fullName || 'Your Name'}</p>
                      <p className="text-xs text-on-surface-variant truncate">
                        {[currentTitle, experienceLevel, jobType].filter(Boolean).join(' • ') || 'Complete the fields above'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {[
                      resumeBase64 && { label: 'Resume', icon: '✅' },
                      linkedinUrl && { label: 'LinkedIn', icon: '🔗' },
                      githubUrl && { label: 'GitHub', icon: '💻' },
                      portfolioUrl && { label: 'Portfolio', icon: '🌐' },
                      phone && { label: 'Phone', icon: '📱' },
                      experienceLevel && { label: experienceLevel, icon: '📊' },
                      toneStyle && { label: toneStyle.split(' ')[0], icon: '🎯' },
                    ].filter(Boolean).map((badge: any, i) => (
                      <span key={i} className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-emerald-500/8 text-emerald-600 dark:text-emerald-400 border border-emerald-500/15">
                        {badge.icon} {badge.label}
                      </span>
                    ))}
                    {!fullName && (
                      <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-surface-container-highest text-on-surface-variant">
                        Fill in your name to continue
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-between items-center pt-2">
                  <button onClick={goBack} className="px-5 py-2.5 rounded-xl text-sm font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all active:scale-95">
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                      Back
                    </span>
                  </button>
                  <button
                    onClick={handleComplete}
                    disabled={isSaving || !fullName.trim()}
                    className="group px-8 py-3 bg-gradient-to-r from-primary to-secondary text-on-primary font-bold text-sm rounded-xl shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:opacity-95 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <span className="w-4 h-4 rounded-full border-2 border-on-primary border-t-transparent animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[18px] group-hover:scale-110 transition-transform" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                        Launch Dashboard
                        <span className="material-symbols-outlined text-[16px] group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Step label */}
        <p className="text-center text-[11px] text-on-surface-variant font-mono mt-4">
          Step {step + 1} of {STEPS.length} — {STEPS[step].title}
        </p>
      </div>
    </div>
  );
}
