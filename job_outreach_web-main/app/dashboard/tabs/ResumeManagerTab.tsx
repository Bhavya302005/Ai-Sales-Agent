'use client';
import { useDashboard } from '../DashboardContext';

export default function ResumeManagerTab() {
  const ctx = useDashboard();
  const {
    resumeText, resumeBase64, isUploadingResume, handleResumeUpload
  } = ctx;

  return (
    <div className="max-w-2xl mx-auto py-stack-lg space-y-6 px-container-padding-mobile lg:px-container-padding-desktop animate-fade-in-right">

      {/* Header */}
      <section className="text-center flex flex-col items-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/15 to-secondary/15 flex items-center justify-center mb-3 border border-outline-variant">
          <span className="material-symbols-outlined text-primary text-[30px]">description</span>
        </div>
        <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold">Resume Manager</h2>
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-1.5 max-w-md">
          Manage and optimize your resumes for AI-powered job applications.
        </p>
      </section>

      {/* Upload Area */}
      <section className="relative">
        <div className="border-2 border-dashed border-primary/40 rounded-2xl p-8 flex flex-col items-center justify-center text-center bg-surface-container-low transition-all duration-300 hover:bg-surface-container hover:border-primary/60 hover:shadow-[0_0_30px_rgba(var(--primary-rgb),0.08)] cursor-pointer relative card-elevated group">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-secondary/15 flex items-center justify-center mb-4 animate-float-subtle border border-outline-variant group-hover:scale-105 transition-transform">
            <span className="material-symbols-outlined text-primary text-4xl">description</span>
          </div>
          <p className="font-body-md text-body-md text-on-surface mb-4 font-semibold">
            {resumeBase64 ? 'Upload a new resume to update your profile' : 'Upload your latest PDF resume here'}
          </p>
          <label className="ai-gradient-btn px-6 py-3 rounded-full cursor-pointer hover:opacity-90 transition-opacity active:scale-95">
            {resumeBase64 ? 'Replace Resume' : 'Browse Files'}
            <input type="file" accept=".pdf" className="hidden" onChange={handleResumeUpload} disabled={isUploadingResume} />
          </label>
        </div>
      </section>

      {/* Uploading State */}
      {isUploadingResume && (
        <div className="bg-surface-container/50 border border-secondary-container/30 p-5 rounded-xl flex items-center gap-4 relative overflow-hidden glass-card">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center border border-primary/20">
            <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          </div>
          <div className="flex-1 relative z-10">
            <h4 className="font-body-md text-body-md text-on-surface font-bold flex items-center gap-2">
              Parsing PDF...
              <span className="inline-block w-1.5 h-1.5 bg-primary rounded-full animate-ping" />
            </h4>
            <p className="text-xs text-on-surface-variant mt-0.5">Extracting text for AI context</p>
          </div>
        </div>
      )}

      {/* Resume Text Preview */}
      {resumeText && !isUploadingResume && (
        <section className="space-y-3 animate-slide-up">
          <div className="flex justify-between items-center px-1">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">description</span>
              <h3 className="text-sm font-bold text-on-surface">Resume Content</h3>
            </div>
            <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 flex items-center gap-1">
              <span className="material-symbols-outlined text-[12px]">check_circle</span>
              Parsed
            </span>
          </div>
          <div className="bg-surface-container-low border border-outline-variant p-4 rounded-xl max-h-[300px] overflow-y-auto card-elevated custom-scrollbar">
            <p className="text-xs text-on-surface-variant font-mono whitespace-pre-wrap leading-relaxed select-text">{resumeText}</p>
          </div>
        </section>
      )}
    </div>
  );
}
