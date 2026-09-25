'use client';
import { useDashboard } from './DashboardContext';

export default function CsvReviewModal() {
  const {
    selectedCsvIndex, setSelectedCsvIndex,
    previewSubject, setPreviewSubject,
    previewBody, setPreviewBody,
    saveAndApproveDraft,
    csvData,
    csvStatuses,
    setCsvStatuses,
    isGeneratingSingleDraft,
    regenerateSingleAiDraft,
    setShowPreview,
    sendCsvRow,
    saveCsvCampaign,
    handleInlineSend
  } = useDashboard();

  if (selectedCsvIndex === null) return null;
  
  const row = csvData[selectedCsvIndex];

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div 
        className="bg-surface-container border border-outline-variant rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col"
        style={{ maxHeight: '90vh' }}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-high flex justify-between items-center">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-2xl animate-pulse">auto_awesome</span>
              <h3 className="text-lg font-bold text-on-surface">Review & Personalize AI Email</h3>
            </div>
            <p className="text-xs text-on-surface-variant">
              Recruiter: <span className="text-on-surface font-semibold">{row?.name || 'Recruiter'}</span> • <span className="text-on-surface font-semibold">{row?.email}</span> at <span className="text-on-surface font-semibold">{row?.company || 'Company'}</span>
            </p>
          </div>
          <button 
            onClick={() => setSelectedCsvIndex(null)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container-highest transition-colors active:scale-95"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Editor Workspace */}
        <div className="flex-1 p-6 overflow-y-auto flex flex-col gap-5 min-h-[350px]">
          {isGeneratingSingleDraft ? (
            <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant gap-3 animate-pulse">
              <div className="spinner animate-spin rounded-full h-10 w-10 border-4 border-primary border-t-transparent"></div>
              <p className="text-sm font-semibold">AI is drafting a highly customized application for {row?.company}...</p>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-5">
              {/* Left: Input Editor */}
              <div className="flex-1 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-on-surface font-bold text-xs uppercase tracking-wider">Subject Line</label>
                  <input
                    type="text"
                    className="bg-surface-dim border border-outline-variant rounded-lg p-3 text-on-surface font-bold focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all text-sm"
                    value={previewSubject}
                    onChange={e => setPreviewSubject(e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5 flex-1">
                  <label className="text-on-surface font-bold text-xs uppercase tracking-wider">Email Body</label>
                  <textarea
                    className="bg-surface-dim border border-outline-variant rounded-lg p-3 text-on-surface outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all font-mono text-sm leading-relaxed flex-1 min-h-[300px]"
                    value={previewBody}
                    onChange={e => setPreviewBody(e.target.value)}
                  />
                </div>
              </div>

              {/* Right: Live Preview & Details */}
              <div className="w-full md:w-[320px] bg-surface-container-low border border-outline-variant rounded-xl p-4 flex flex-col gap-4">
                <span className="text-xs font-bold text-primary uppercase tracking-wider">Recruiter Details</span>
                <div className="flex flex-col gap-2.5 text-xs text-on-surface-variant">
                  <div className="flex justify-between border-b border-outline-variant/30 pb-1.5">
                    <span>Name</span>
                    <span className="font-semibold text-on-surface">{row?.name || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between border-b border-outline-variant/30 pb-1.5">
                    <span>Company</span>
                    <span className="font-semibold text-on-surface">{row?.company || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between border-b border-outline-variant/30 pb-1.5">
                    <span>Target Role</span>
                    <span className="font-semibold text-on-surface">{row?.title || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between pb-1.5">
                    <span>Email</span>
                    <span className="font-semibold text-on-surface">{row?.email}</span>
                  </div>
                </div>

                <div className="border-t border-outline-variant/30 pt-4 flex flex-col gap-2">
                  <button
                    onClick={regenerateSingleAiDraft}
                    className="w-full bg-surface-dim border border-outline-variant text-on-surface hover:bg-surface-container-highest py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">refresh</span>
                    Regenerate AI Draft
                    <span className="text-[9px] font-bold bg-amber-500/15 text-amber-500 px-1.5 py-0.5 rounded-full border border-amber-500/20 ml-1">⚡ 1 Credit</span>
                  </button>
                  <p className="text-[10px] text-on-surface-variant text-center leading-normal">
                    This uses the extracted context from your resume and targeting job description.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-outline-variant bg-surface-container-high flex justify-between items-center">
          <div className="flex gap-3">
            <button
              onClick={() => setSelectedCsvIndex(null)}
              className="px-4 py-2 border border-outline-variant text-on-surface hover:bg-surface-container-highest rounded-lg font-bold text-xs transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => setShowPreview(true)}
              className="px-4 py-2 bg-surface-dim border border-outline-variant text-on-surface hover:bg-surface-container-highest rounded-lg font-bold text-xs transition-all flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">visibility</span>
              Preview Draft
            </button>
          </div>
          <div className="flex gap-3">
            <button
              onClick={saveAndApproveDraft}
              disabled={isGeneratingSingleDraft}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs transition-all flex items-center gap-1 shadow-md"
            >
              <span className="material-symbols-outlined text-[16px]">check</span>
              Save & Approve
            </button>
            <button
              onClick={async () => {
                if (selectedCsvIndex === null) return;
                // Save draft locally first
                setCsvStatuses((prev: any[]) => {
                  const next = [...prev];
                  next[selectedCsvIndex] = {
                    ...next[selectedCsvIndex],
                    subject: previewSubject,
                    body: previewBody
                  };
                  return next;
                });
                await handleInlineSend(selectedCsvIndex, previewSubject, previewBody);
                setSelectedCsvIndex(null);
              }}
              disabled={isGeneratingSingleDraft}
              className="px-4 py-2 bg-primary text-on-primary hover:opacity-90 rounded-lg font-bold text-xs transition-all flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">send</span>
              Approve & Send Now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
