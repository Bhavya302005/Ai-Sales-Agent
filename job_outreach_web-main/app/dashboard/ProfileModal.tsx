'use client';
import { useDashboard } from './DashboardContext';

export default function ProfileModal() {
  const ctx = useDashboard();
  const {
    isProfileModalOpen, setIsProfileModalOpen,
    profileFullName, setProfileFullName, profilePhone, setProfilePhone,
    profileLinkedin, setProfileLinkedin, profileGithub, setProfileGithub,
    profilePortfolio, setProfilePortfolio, profileCurrentTitle, setProfileCurrentTitle,
    profileExperienceLevel, setProfileExperienceLevel,
    profileToneStyle, setProfileToneStyle, profileJobType, setProfileJobType,
    isSavingProfile, handleSaveProfile, resumeText, handleResumeUpload, isUploadingResume
  } = ctx;

  if (!isProfileModalOpen) return null;

  return (

        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div 
            className="border border-outline-variant rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col md:flex-row max-h-[95vh] md:max-h-[90vh] overflow-hidden relative transition-all duration-300"
            style={{ 
              backgroundColor: 'var(--surface-container)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              boxShadow: '0 30px 70px -10px rgba(0, 0, 0, 0.85), 0 0 60px rgba(128, 131, 255, 0.12)',
            }}
          >
            {/* Top glowing premium accent line */}
            <div className="absolute top-0 left-0 right-0 h-[4px] bg-gradient-to-r from-primary via-secondary to-tertiary z-20"></div>

            {/* Left Column: Sidebar / Profile Completeness Preview */}
            <div 
              className="w-full md:w-80 border-b md:border-b-0 md:border-r border-outline-variant p-6 flex flex-col justify-between items-center relative z-10 shrink-0 select-none"
              style={{ backgroundColor: 'var(--surface-container-low)' }}
            >
              {/* Decorative subtle background grid/gradient */}
              <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none rounded-l-3xl"></div>
              
              <div className="w-full flex flex-col items-center mt-4">
                {/* Shimmering Circular Avatar with Initials */}
                <div className="relative group mb-4">
                  <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-primary via-secondary to-tertiary opacity-75 blur-md group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-pulse"></div>
                  <div className="relative w-24 h-24 rounded-full bg-surface-dim border-2 border-outline-variant flex items-center justify-center text-primary shadow-xl overflow-hidden">
                    <span className="material-symbols-outlined absolute -bottom-1 text-[84px] text-primary select-none pointer-events-none">account_circle</span>
                    <span className="text-3xl font-extrabold tracking-wider bg-gradient-to-tr from-primary via-secondary to-tertiary bg-clip-text text-transparent drop-shadow-sm select-none relative z-10">
                      {(() => {
                        const name = (profileFullName || '').trim();
                        if (!name) return "?";
                        const parts = name.split(/\s+/);
                        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
                        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
                      })()}
                    </span>
                  </div>
                </div>

                <h3 className="text-base font-bold text-on-surface truncate max-w-full px-2" title={profileFullName || 'Guest Candidate'}>
                  {profileFullName.trim() || 'Guest Candidate'}
                </h3>
                <p className="text-xs text-on-surface-variant font-medium truncate max-w-full mt-1.5 px-2 flex items-center gap-1.5" title={profileCurrentTitle || 'AI Outreach Ready'}>
                  <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
                  {profileCurrentTitle.trim() || 'AI Outreach Ready'}
                </p>
              </div>

              {/* Dynamic Profile Completeness Progress (Futuristic Circular SVG) */}
              {(() => {
                const completeness = (() => {
                  let score = 0;
                  if ((profileFullName || '').trim()) score += 20;
                  if ((profileCurrentTitle || '').trim()) score += 15;
                  if ((profilePhone || '').trim()) score += 10;
                  if ((profileLinkedin || '').trim()) score += 10;
                  if ((profileGithub || '').trim()) score += 10;
                  if ((profilePortfolio || '').trim()) score += 10;
                  if (resumeText) score += 15;
                  if (profileExperienceLevel) score += 5;
                  if (profileToneStyle) score += 5;
                  return score;
                })();

                const radius = 32;
                const circumference = 2 * Math.PI * radius;
                const strokeDashoffset = circumference - (completeness / 100) * circumference;

                return (
                  <div 
                    className="w-full my-6 rounded-2xl p-4 border border-outline-variant flex flex-col items-center"
                    style={{ backgroundColor: 'var(--surface-container-high)' }}
                  >
                    <div className="relative w-20 h-20 flex items-center justify-center">
                      {/* SVG Ring */}
                      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 80 80">
                        {/* Background Ring */}
                        <circle
                          cx="40"
                          cy="40"
                          r={radius}
                          className="stroke-outline-variant/20"
                          strokeWidth="5"
                          fill="transparent"
                        />
                        {/* Glowing Active Ring */}
                        <circle
                          cx="40"
                          cy="40"
                          r={radius}
                          className="stroke-primary transition-all duration-500 ease-out"
                          strokeWidth="5.5"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                          fill="transparent"
                          style={{
                            filter: 'drop-shadow(0px 0px 4px rgba(128, 131, 255, 0.45))'
                          }}
                        />
                      </svg>
                      {/* Central Percentage */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-base font-extrabold text-on-surface tracking-tight leading-none">{completeness}%</span>
                        <span className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider mt-0.5">Setup</span>
                      </div>
                    </div>

                    <div className="mt-4 w-full space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-semibold">
                        <span className="text-on-surface-variant">Setup Milestones</span>
                        <span className="text-primary font-bold">{completeness === 100 ? 'Perfect' : `${completeness}/100`}</span>
                      </div>
                      
                      {/* Milestone check list items */}
                      <div className="space-y-1.5 pt-1.5 border-t border-outline-variant w-full text-left">
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className={`material-symbols-outlined text-[13px] font-bold ${profileFullName.trim() ? 'text-emerald-400' : 'text-on-surface-variant'}`}>
                            {profileFullName.trim() ? 'check_circle' : 'radio_button_unchecked'}
                          </span>
                          <span className={profileFullName.trim() ? 'text-on-surface font-medium' : 'text-on-surface-variant'}>Identity Setup</span>
                        </div>
                        
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className={`material-symbols-outlined text-[13px] font-bold ${(profileLinkedin.trim() || profileGithub.trim() || profilePortfolio.trim()) ? 'text-emerald-400' : 'text-on-surface-variant'}`}>
                            {(profileLinkedin.trim() || profileGithub.trim() || profilePortfolio.trim()) ? 'check_circle' : 'radio_button_unchecked'}
                          </span>
                          <span className={(profileLinkedin.trim() || profileGithub.trim() || profilePortfolio.trim()) ? 'text-on-surface font-medium' : 'text-on-surface-variant'}>Digital Handles Linked</span>
                        </div>

                        <div className="flex items-center gap-2 text-[11px]">
                          <span className={`material-symbols-outlined text-[13px] font-bold ${resumeText ? 'text-emerald-400' : 'text-on-surface-variant'}`}>
                            {resumeText ? 'check_circle' : 'radio_button_unchecked'}
                          </span>
                          <span className={resumeText ? 'text-on-surface font-medium' : 'text-on-surface-variant'}>AI Resume Intel</span>
                        </div>

                        <div className="flex items-center gap-2 text-[11px]">
                          <span className={`material-symbols-outlined text-[13px] font-bold ${(profileExperienceLevel && profileToneStyle) ? 'text-emerald-400' : 'text-on-surface-variant'}`}>
                            {(profileExperienceLevel && profileToneStyle) ? 'check_circle' : 'radio_button_unchecked'}
                          </span>
                          <span className={(profileExperienceLevel && profileToneStyle) ? 'text-on-surface font-medium' : 'text-on-surface-variant'}>Outreach Parameters</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Verified security/sync badge */}
              <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant font-mono bg-surface-container-high border border-outline-variant px-3 py-1 rounded-full mt-auto">
                <span className="material-symbols-outlined text-[11px] text-emerald-400 font-bold">verified_user</span>
                <span>Supabase Secure Sync</span>
              </div>
            </div>

            {/* Right Column: Main Form Pane */}
            <div 
              className="flex-1 flex flex-col max-h-[90vh] overflow-hidden"
              style={{ backgroundColor: 'var(--surface-container)' }}
            >
              
              {/* Header section inside form */}
              <div 
                className="p-6 border-b border-outline-variant flex justify-between items-center relative z-10"
                style={{ backgroundColor: 'var(--surface-container)' }}
              >
                <div>
                  <h2 className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-on-surface via-on-surface/90 to-on-surface-variant bg-clip-text text-transparent">
                    Outreach Candidate Profile
                  </h2>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    Customize your professional parameters to train our AI email outreach assistant.
                  </p>
                </div>
                <button 
                  onClick={() => setIsProfileModalOpen(false)} 
                  className="w-8 h-8 rounded-full hover:bg-surface-container-highest flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-all active:scale-90 border border-outline-variant"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              {/* Scrollable form body */}
              <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
                
                {/* Section 1: Profile Identity */}
                <div className="space-y-3.5">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-widest flex items-center gap-1.5 border-b border-outline-variant pb-1.5 bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent w-fit">
                    <span className="material-symbols-outlined text-[14px] text-primary">badge</span>
                    1. Candidate Identity
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1.5">Full Name <span className="text-error font-bold">*</span></label>
                      <div className="relative group">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary select-none">person</span>
                        <input 
                          type="text" 
                          value={profileFullName || ''} 
                          onChange={(e) => setProfileFullName(e.target.value)}
                          className="w-full bg-surface-dim text-on-surface border border-outline-variant hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_15px_rgba(128,131,255,0.25)] pl-10 pr-4 py-2.5 rounded-xl text-xs outline-none transition-all placeholder:text-on-surface-variant duration-300 shadow-sm"
                          placeholder="e.g. John Doe"
                        />
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1.5">Current/Target Title</label>
                      <div className="relative group">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary select-none">work</span>
                        <input 
                          type="text" 
                          value={profileCurrentTitle || ''} 
                          onChange={(e) => setProfileCurrentTitle(e.target.value)}
                          className="w-full bg-surface-dim text-on-surface border border-outline-variant hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_15px_rgba(128,131,255,0.25)] pl-10 pr-4 py-2.5 rounded-xl text-xs outline-none transition-all placeholder:text-on-surface-variant duration-300 shadow-sm"
                          placeholder="e.g. AI Engineer"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: Online Handles */}
                <div className="space-y-3.5 pt-1">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-widest flex items-center gap-1.5 border-b border-outline-variant pb-1.5 bg-gradient-to-r from-secondary to-tertiary bg-clip-text text-transparent w-fit">
                    <span className="material-symbols-outlined text-[14px] text-secondary">link</span>
                    2. Digital Presence & Social Handles
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1.5">Phone Number</label>
                      <div className="relative group">
                        <span className={`material-symbols-outlined text-[16px] absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors select-none ${profilePhone ? 'text-primary' : 'text-on-surface-variant group-focus-within:text-primary'}`}>call</span>
                        <input 
                          type="tel" 
                          value={profilePhone || ''} 
                          onChange={(e) => setProfilePhone(e.target.value)}
                          className="w-full bg-surface-dim text-on-surface border border-outline-variant hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_15px_rgba(128,131,255,0.25)] pl-10 pr-4 py-2.5 rounded-xl text-xs outline-none transition-all placeholder:text-on-surface-variant duration-300 shadow-sm"
                          placeholder="+91 93282 98587"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1.5">LinkedIn URL</label>
                      <div className="relative group">
                        <span className={`material-symbols-outlined text-[16px] absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors select-none ${profileLinkedin ? 'text-[#0077b5]' : 'text-on-surface-variant group-focus-within:text-primary'}`}>link</span>
                        <input 
                          type="url" 
                          value={profileLinkedin || ''} 
                          onChange={(e) => setProfileLinkedin(e.target.value)}
                          className="w-full bg-surface-dim text-on-surface border border-outline-variant hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_15px_rgba(128,131,255,0.25)] pl-10 pr-4 py-2.5 rounded-xl text-xs outline-none transition-all placeholder:text-on-surface-variant duration-300 shadow-sm"
                          placeholder="https://linkedin.com/in/..."
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1.5">GitHub URL</label>
                      <div className="relative group">
                        <span className={`material-symbols-outlined text-[16px] absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors select-none ${profileGithub ? 'text-[#a27bfe]' : 'text-on-surface-variant group-focus-within:text-primary'}`}>code</span>
                        <input 
                          type="url" 
                          value={profileGithub || ''} 
                          onChange={(e) => setProfileGithub(e.target.value)}
                          className="w-full bg-surface-dim text-on-surface border border-outline-variant hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_15px_rgba(128,131,255,0.25)] pl-10 pr-4 py-2.5 rounded-xl text-xs outline-none transition-all placeholder:text-on-surface-variant duration-300 shadow-sm"
                          placeholder="https://github.com/..."
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1.5">Portfolio URL</label>
                      <div className="relative group">
                        <span className={`material-symbols-outlined text-[16px] absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors select-none ${profilePortfolio ? 'text-[#10b981]' : 'text-on-surface-variant group-focus-within:text-primary'}`}>language</span>
                        <input 
                          type="url" 
                          value={profilePortfolio || ''} 
                          onChange={(e) => setProfilePortfolio(e.target.value)}
                          className="w-full bg-surface-dim text-on-surface border border-outline-variant hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_15px_rgba(128,131,255,0.25)] pl-10 pr-4 py-2.5 rounded-xl text-xs outline-none transition-all placeholder:text-on-surface-variant duration-300 shadow-sm"
                          placeholder="https://myportfolio.com"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 3: AI Intelligence Tuning */}
                <div className="space-y-3.5 pt-1">
                  <h4 className="text-[10px] font-extrabold uppercase tracking-widest flex items-center gap-1.5 border-b border-outline-variant pb-1.5 bg-gradient-to-r from-tertiary to-primary bg-clip-text text-transparent w-fit">
                    <span className="material-symbols-outlined text-[14px] text-tertiary">psychology</span>
                    3. AI Training Parameters & Experience
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1.5">Default Job Type</label>
                      <div className="relative group">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary select-none">work_outline</span>
                        <select
                          value={profileJobType || ''}
                          onChange={(e) => setProfileJobType(e.target.value)}
                          className="w-full bg-surface-dim text-on-surface border border-outline-variant hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_15px_rgba(128,131,255,0.25)] pl-10 pr-10 py-2.5 rounded-xl text-xs outline-none transition-all placeholder:text-on-surface-variant appearance-none cursor-pointer shadow-sm duration-300"
                        >
                          <option value="">Select Type...</option>
                          <option value="Full-time">Full-time</option>
                          <option value="Part-time">Part-time</option>
                          <option value="Contract">Contract</option>
                          <option value="Internship">Internship</option>
                          <option value="Freelance">Freelance</option>
                        </select>
                        <span className="material-symbols-outlined text-[18px] text-on-surface-variant absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none select-none">expand_more</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1.5">Default Experience Level</label>
                      <div className="relative group">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary select-none">stairs</span>
                        <select
                          value={profileExperienceLevel || ''}
                          onChange={(e) => setProfileExperienceLevel(e.target.value)}
                          className="w-full bg-surface-dim text-on-surface border border-outline-variant hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_15px_rgba(128,131,255,0.25)] pl-10 pr-10 py-2.5 rounded-xl text-xs outline-none transition-all placeholder:text-on-surface-variant appearance-none cursor-pointer shadow-sm duration-300"
                        >
                          <option value="">Select Level...</option>
                          <option value="Fresher">Fresher (0-1 year)</option>
                          <option value="Junior">Junior (1-3 years)</option>
                          <option value="Mid-Level">Mid-Level (3-5 years)</option>
                          <option value="Senior">Senior (5-8 years)</option>
                          <option value="Lead">Lead (8+ years)</option>
                          <option value="Executive">Executive / Director</option>
                        </select>
                        <span className="material-symbols-outlined text-[18px] text-on-surface-variant absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none select-none">expand_more</span>
                      </div>
                    </div>
                    
                    <div>
                      <label className="block text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider mb-1.5">Default Tone Style</label>
                      <div className="relative group">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2 transition-colors group-focus-within:text-primary select-none">psychology</span>
                        <select
                          value={profileToneStyle || ''}
                          onChange={(e) => setProfileToneStyle(e.target.value)}
                          className="w-full bg-surface-dim text-on-surface border border-outline-variant hover:border-primary focus:border-primary focus:ring-1 focus:ring-primary focus:shadow-[0_0_15px_rgba(128,131,255,0.25)] pl-10 pr-10 py-2.5 rounded-xl text-xs outline-none transition-all placeholder:text-on-surface-variant appearance-none cursor-pointer shadow-sm duration-300"
                        >
                          <option value="">Select Style...</option>
                          <option value="Direct & Execution-focused">Direct & Execution-focused</option>
                          <option value="Warm & Conversational">Warm & Conversational</option>
                          <option value="Highly Technical">Highly Technical</option>
                          <option value="Visionary & Strategic">Visionary & Strategic</option>
                          <option value="Creative & Enthusiastic">Creative & Enthusiastic</option>
                        </select>
                        <span className="material-symbols-outlined text-[18px] text-on-surface-variant absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none select-none">expand_more</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 4: Resume Document Upload */}
                <div className="space-y-3 pt-1">
                  <label className="block text-[10px] font-extrabold text-on-surface-variant uppercase tracking-wider">
                    Resume / Curriculum Vitae (PDF)
                  </label>
                  
                  <div className="p-4 rounded-2xl border-2 border-dashed border-outline-variant bg-surface-dim flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all duration-300 hover:border-primary hover:shadow-[0_0_20px_rgba(128,131,255,0.08)]">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-primary border border-primary/20 flex items-center justify-center text-primary shrink-0 relative">
                        <span className="material-symbols-outlined text-[24px]">upload_file</span>
                        {resumeText && (
                          <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-surface-container flex items-center justify-center">
                            <span className="w-1.5 h-1.5 rounded-full bg-white"></span>
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-on-surface flex items-center gap-2">
                          Upload CV or Resume
                        </p>
                        <p className="text-[10px] text-on-surface-variant font-mono mt-0.5">
                          PDF files only • Up to 5 MB
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3.5 self-end sm:self-auto">
                      {resumeText ? (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-extrabold text-[10px] shadow-sm animate-pulse">
                          <span className="material-symbols-outlined text-[13px]">check_circle</span>
                          Resume Active &amp; Synced
                        </div>
                      ) : (
                        <span className="text-[10px] font-extrabold text-on-surface-variant font-mono bg-surface-container-high px-2.5 py-1 rounded-md">Empty</span>
                      )}

                      <label className="cursor-pointer px-4.5 py-2.5 bg-gradient-to-r from-primary to-secondary hover:opacity-90 text-on-primary text-[11px] font-extrabold rounded-xl transition-all flex items-center gap-1.5 shrink-0 shadow-md shadow-primary/10 hover:shadow-primary/20 active:scale-95 duration-200">
                        <span className="material-symbols-outlined text-[15px]">cloud_upload</span>
                        {isUploadingResume ? 'Uploading...' : 'Browse File'}
                        <input type="file" accept="application/pdf" className="hidden" onChange={handleResumeUpload} disabled={isUploadingResume} />
                      </label>
                    </div>
                  </div>
                </div>

              </div>

              {/* Bottom save/cancel actions */}
              <div 
                className="p-6 border-t border-outline-variant flex justify-end items-center gap-3 relative z-10"
                style={{ backgroundColor: 'var(--surface-container)' }}
              >
                <button 
                  onClick={() => setIsProfileModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all active:scale-95 duration-200"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSaveProfile}
                  disabled={isSavingProfile || !profileFullName.trim()}
                  className="group px-6 py-2.5 bg-gradient-to-r from-primary via-primary/95 to-secondary text-on-primary hover:opacity-90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2 rounded-xl font-bold text-xs shadow-lg shadow-primary/20 hover:shadow-primary/30"
                >
                  {isSavingProfile ? (
                    <>
                      <span className="w-4 h-4 rounded-full border-2 border-on-primary border-t-transparent animate-spin"></span>
                      Saving Profile...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px] group-hover:rotate-12 transition-transform">save</span>
                      Save Profile Parameters
                    </>
                  )}
                </button>
              </div>

            </div>

          </div>
        </div>
  );
}
