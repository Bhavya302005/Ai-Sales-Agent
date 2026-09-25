'use client';
import { useDashboard } from './DashboardContext';

export default function PreviewModal() {
  const {
    showPreview, setShowPreview,
    outreachTab,
    bccDraft, bccSubject, bccEmails,
    selectedCsvIndex, previewBody, previewSubject,
    csvDraft, csvSubject, csvData,
    draft, subject,
    recruiterName, recruiterEmail,
    previewRecruiterName, previewRecruiterEmail,
    handleBccSend, handleCsvStartSending, handleSendEmail,
    isSendingBcc, isSendingCsv, isSending
  } = useDashboard();

  if (!showPreview) return null;

  const isBulk = outreachTab === 'bulk';
  const isCsv = outreachTab === 'csv';
  const isAutoAgent = outreachTab === 'auto_agent';

  // Retrieve draft content
  const displayDraft = isBulk ? bccDraft : (isCsv ? (selectedCsvIndex !== null ? previewBody : csvDraft) : (isAutoAgent ? previewBody : draft));

  // Retrieve subject
  const displaySubject = isBulk ? bccSubject : (isCsv ? (selectedCsvIndex !== null ? previewSubject : csvSubject) : (isAutoAgent ? previewSubject : subject));

  // Recipient Name
  const displayRecruiterName = isBulk
    ? "Multiple Recipients (BCC)"
    : (isCsv ? (selectedCsvIndex !== null ? (csvData[selectedCsvIndex]?.name || 'Candidate') : "CSV Leads (Individual Bulk)") : (isAutoAgent ? previewRecruiterName : recruiterName));

  // Recipient Email
  const displayRecruiterEmail = isBulk
    ? `${bccEmails ? bccEmails.split(',').filter(Boolean).length : 0} BCC Recipients`
    : (isCsv ? (selectedCsvIndex !== null ? csvData[selectedCsvIndex]?.email : `${csvData ? csvData.length : 0} Leads`) : (isAutoAgent ? previewRecruiterEmail : recruiterEmail));

  // Action triggers
  const handleModalSend = () => {
    setShowPreview(false);
    if (isBulk) {
      handleBccSend();
    } else if (isCsv) {
      handleCsvStartSending();
    } else {
      handleSendEmail();
    }
  };

  const modalIsSending = isBulk ? isSendingBcc : (isCsv ? isSendingCsv : isSending);
  const modalSendText = isBulk ? "Send via BCC" : (isCsv ? `Send Individually` : "Send Email");

  const avatarLetter = isBulk ? 'B' : (isCsv ? 'C' : (recruiterName ? recruiterName.substring(0, 1).toUpperCase() : 'R'));
  const avatarBg = isBulk ? 'bg-purple-100 text-purple-600' : (isCsv ? 'bg-amber-100 text-amber-600' : 'bg-indigo-100 text-indigo-600');

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-all duration-300 animate-in fade-in"
      onClick={() => setShowPreview(false)}
    >
      {/* Modal Card */}
      <div
        className="bg-surface-container border border-outline-variant rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden glass-card animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant bg-surface-container-high">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-2xl">visibility</span>
            <h3 className="font-headline-md text-lg font-bold text-on-surface">Email Draft Preview</h3>
          </div>
          <button
            onClick={() => setShowPreview(false)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Email Client Layout (Gmail-style) */}
        <div className="flex-1 overflow-y-auto p-6 bg-surface-dim">
          {displayDraft ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-md overflow-hidden font-sans">
              {/* Email Metadata */}
              <div className="bg-gray-50 border-b border-gray-200 px-6 py-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${avatarBg}`}>
                    {avatarLetter}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                      {displayRecruiterName || 'Recruiter'}
                      {displayRecruiterEmail && <span className="text-xs text-gray-400 font-normal">&lt;{displayRecruiterEmail}&gt;</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {isBulk ? 'To: BCC Recipients List' : (isCsv ? 'To: Individual CSV Leads' : 'To: Me (Job Application Outreach)')}
                    </p>
                  </div>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold px-2 py-0.5 bg-gray-200 text-gray-600 rounded">Subject:</span>
                  <p className="text-base font-semibold text-gray-900">{displaySubject || '(No subject)'}</p>
                </div>
              </div>

              {/* Email Body */}
              <div
                className="px-8 py-8 text-[14.5px] leading-[1.65] text-[#2c3e50] font-sans bg-white min-h-[250px]"
                style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}
                dangerouslySetInnerHTML={{
                  __html: (() => {
                    // Normalize all newlines first
                    const normalized = displayDraft
                      .replace(/\r\n/g, '\n')
                      .replace(/\r/g, '\n');

                    // Escape HTML entities to be safe
                    const escaped = normalized
                      .replace(/&/g, '&amp;')
                      .replace(/</g, '&lt;')
                      .replace(/>/g, '&gt;');

                    // Split by double newlines (paragraphs)
                    const paragraphs = escaped.split(/\n{2,}/);

                    return paragraphs.map((p: string) => {
                      let content = p
                        // Bold
                        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                        .replace(/__(.+?)__/g, '<strong>$1</strong>')
                        // Italic
                        .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
                        // Links
                        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color:#4f46e5;text-decoration:underline;" target="_blank">$1</a>')
                        // Single line breaks inside a paragraph
                        .replace(/\n/g, '<br/>');

                      // Check if paragraph is a list
                      if (content.trim().startsWith('- ') || content.trim().startsWith('* ')) {
                        // Split into items
                        const items = content.split(/\n?[\-\*]\s+/).filter(Boolean);
                        return items.map((item: string) =>
                          `<div style="display:flex;gap:8px;margin:6px 0 6px 12px;color:#2c3e50;">` +
                          `<span style="color:#4f46e5;font-weight:bold;">•</span>` +
                          `<span>${item}</span>` +
                          `</div>`
                        ).join('');
                      }

                      // Regular paragraph
                      return `<p style="margin: 0 0 16px 0; padding: 0; color:#2c3e50;">${content}</p>`;
                    }).join('');
                  })()
                }}
              />

              {/* Gmail-style Attachment Container */}
              <div className="border-t border-gray-100 bg-[#f8f9fa] px-8 py-6 flex flex-col gap-3.5 font-sans">
                {/* One attachment • Scanned by Gmail (with info icon) */}
                <div className="flex items-center gap-1.5 text-xs text-gray-500 font-sans select-none">
                  <span className="font-bold text-gray-800 text-[12px]">One attachment</span>
                  <span className="text-[12px] text-gray-400">•</span>
                  <span className="text-[12px]">Scanned by Gmail</span>
                  <span className="material-symbols-outlined text-[14px] text-gray-400 cursor-help" title="Gmail scanned this attachment for viruses.">info</span>
                </div>

                {/* Attachment Card */}
                <div className="group/attachment relative flex flex-col w-[172px] h-[120px] rounded border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden bg-white">
                  {/* Top Thumbnail Box */}
                  <div className="h-[80px] bg-[#f1f3f4] flex items-center justify-center border-b border-gray-200/50">
                    {/* Large Soft PDF Doc Icon */}
                    <div className="flex flex-col items-center justify-center text-gray-300 select-none">
                      <span className="material-symbols-outlined text-4xl leading-none">description</span>
                      <span className="text-[9px] font-black tracking-wider mt-1 uppercase text-gray-400/80">PDF</span>
                    </div>
                  </div>

                  {/* Bottom Filename Bar */}
                  <div className="h-[40px] bg-[#f5f5f5] flex items-center px-3.5 relative overflow-hidden">
                    {/* Small Red PDF Square Icon */}
                    <div className="w-4 h-4 rounded bg-[#ea4335] text-white flex items-center justify-center font-bold text-[7px] shrink-0 mr-2 select-none font-sans shadow-sm">
                      PDF
                    </div>

                    {/* Filename Text */}
                    <span className="text-xs font-semibold text-gray-700 truncate pr-4 select-none">
                      Resume.pdf
                    </span>

                    {/* Red dog-ear folded corner with grey flap */}
                    <svg className="absolute bottom-0 right-0 w-[14px] h-[14px]" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                      {/* Red fold base */}
                      <path d="M0 14 L14 0 L14 14 Z" fill="#ea4335" />
                      {/* Grey flap fold */}
                      <path d="M0 14 L14 0 L0 0 Z" fill="#c1c1c1" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-on-surface-variant">
              <span className="material-symbols-outlined text-5xl mb-3 text-outline">draft</span>
              <p className="text-sm">Please generate or type a draft in the editor first.</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-outline-variant bg-surface-container-high flex justify-between items-center gap-3">
          <p className="text-xs text-on-surface-variant flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">info</span>
            Press ESC or click outside to close preview
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowPreview(false)}
              className="bg-surface-dim hover:bg-surface-container-highest border border-outline-variant text-on-surface px-5 py-2.5 rounded-xl font-bold transition-all text-sm active:scale-95"
            >
              Close Preview
            </button>
            {selectedCsvIndex === null && !isAutoAgent && (
              <button
                onClick={handleModalSend}
                disabled={modalIsSending || !displayDraft}
                className="bg-primary hover:opacity-90 text-surface-container-lowest px-5 py-2.5 rounded-xl font-bold flex items-center gap-1.5 transition-all text-sm disabled:opacity-50 active:scale-95"
              >
                <span className="material-symbols-outlined text-lg">send</span>
                {modalIsSending ? "Sending..." : modalSendText}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
