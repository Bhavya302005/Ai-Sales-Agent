'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useDashboard } from '../DashboardContext';

const ITEMS_PER_BATCH = 10;

export default function InboxScannerTab() {
  const {
    scannedReplies, emailHistory,
    isScanning, scanFilter, setScanFilter, scanDays, setScanDays,
    expandedSummary, setExpandedSummary,
    handleScanReplies, totalEmailsScanned
  } = useDashboard();

  // Infinite scroll state
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_BATCH);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Filter logic
  const filterCategories = ['All', 'Interview', 'Rejection', 'Follow-up', 'Other'];

  const filteredReplies = scannedReplies.filter(reply => {
    if (scanFilter === 'All') return true;
    const cat = (reply.category || reply.classification || '').toLowerCase().trim();
    if (scanFilter === 'Interview') return cat.includes('interview');
    if (scanFilter === 'Rejection') return cat.includes('rejection');
    if (scanFilter === 'Follow-up') return cat.includes('follow') || cat.includes('information');
    if (scanFilter === 'Other') return !cat.includes('interview') && !cat.includes('rejection') && !cat.includes('follow') && !cat.includes('information');
    return true;
  });

  const visibleReplies = filteredReplies.slice(0, visibleCount);
  const hasMore = visibleCount < filteredReplies.length;

  // Reset visible count when filter changes
  useEffect(() => {
    setVisibleCount(ITEMS_PER_BATCH);
  }, [scanFilter]);

  // Infinite scroll using IntersectionObserver
  const handleObserver = useCallback((entries: IntersectionObserverEntry[]) => {
    const target = entries[0];
    if (target.isIntersecting && hasMore) {
      setVisibleCount(prev => Math.min(prev + ITEMS_PER_BATCH, filteredReplies.length));
    }
  }, [hasMore, filteredReplies.length]);

  useEffect(() => {
    const observer = new IntersectionObserver(handleObserver, {
      root: scrollContainerRef.current,
      rootMargin: '100px',
      threshold: 0.1
    });

    if (sentinelRef.current) {
      observer.observe(sentinelRef.current);
    }

    return () => observer.disconnect();
  }, [handleObserver]);

  // Stats
  const interviewCount = scannedReplies.filter(r => (r.category || r.classification || '').toLowerCase().includes('interview')).length;
  const rejectionCount = scannedReplies.filter(r => (r.category || r.classification || '').toLowerCase().includes('rejection')).length;
  const filterCounts: Record<string, number> = {
    'All': scannedReplies.length,
    'Interview': interviewCount,
    'Rejection': rejectionCount,
    'Follow-up': scannedReplies.filter(r => {
      const c = (r.category || r.classification || '').toLowerCase();
      return c.includes('follow') || c.includes('information');
    }).length,
    'Other': scannedReplies.filter(r => {
      const c = (r.category || r.classification || '').toLowerCase();
      return !c.includes('interview') && !c.includes('rejection') && !c.includes('follow') && !c.includes('information');
    }).length
  };

  const filterIcons: Record<string, string> = {
    'All': 'inbox',
    'Interview': 'event_available',
    'Rejection': 'cancel',
    'Follow-up': 'reply',
    'Other': 'more_horiz'
  };

  const getCategoryStyle = (cat: string) => {
    const c = cat.toLowerCase().trim();
    if (c.includes('interview')) return {
      bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-400', label: 'Interview', icon: 'event_available'
    };
    if (c.includes('rejection')) return {
      bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', dot: 'bg-red-400', label: 'Rejection', icon: 'cancel'
    };
    if (c.includes('follow') || c.includes('information')) return {
      bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20', dot: 'bg-blue-400', label: c.includes('information') ? 'Info Request' : 'Follow-up', icon: 'reply'
    };
    return {
      bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', dot: 'bg-purple-400', label: 'Other', icon: 'more_horiz'
    };
  };

  return (
    <div className="max-w-6xl mx-auto px-container-padding-mobile lg:px-container-padding-desktop pt-stack-lg space-y-6">

      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2">
        <div>
          <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface flex items-center gap-3">
            <span className="material-symbols-outlined text-[32px] md:text-[38px] text-primary">move_to_inbox</span>
            <span>Reply Scanner</span>
          </h1>
          <p className="text-on-surface-variant mt-1 font-body-sm">Keyword-powered classification of incoming recruiter replies.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              className="flex items-center gap-2 pl-4 pr-9 py-2.5 rounded-xl border border-outline-variant bg-surface-container text-on-surface hover:bg-surface-container-highest transition-colors font-label-md appearance-none cursor-pointer text-sm"
              value={scanDays}
              onChange={e => setScanDays(parseInt(e.target.value))}
            >
              <option value={1}>Last 24 Hours</option>
              <option value={3}>Last 3 Days</option>
              <option value={5}>Last 5 Days</option>
              <option value={7}>Last 7 Days</option>
              <option value={14}>Last 14 Days</option>
              <option value={30}>Last 30 Days</option>
            </select>
            <span className="material-symbols-outlined absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none text-[18px]">expand_more</span>
          </div>
          <button
            className="flex items-center gap-2 px-6 py-2.5 ai-gradient-btn rounded-xl active:scale-95 transition-all duration-200"
            onClick={handleScanReplies}
            disabled={isScanning}
          >
            {isScanning ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                <span>Scanning...</span>
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[20px]">radar</span>
                <span>Scan Now</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Emails Scanned */}
        <div className="bg-surface-container border border-outline-variant rounded-2xl p-5 flex items-center gap-4 glass-card stat-card-sky group hover:border-primary/30 transition-all duration-300">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <span className="material-symbols-outlined text-primary text-[24px]">mail</span>
          </div>
          <div>
            <p className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold">Emails Scanned</p>
            <p className="font-headline-md text-on-surface tabular-nums">{totalEmailsScanned}</p>
          </div>
        </div>

        {/* Replies Found */}
        <div className="bg-surface-container border border-outline-variant rounded-2xl p-5 flex items-center gap-4 glass-card stat-card-violet group hover:border-secondary/30 transition-all duration-300">
          <div className="w-12 h-12 rounded-xl bg-secondary-container/20 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <span className="material-symbols-outlined text-secondary text-[24px]">forum</span>
          </div>
          <div>
            <p className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold">Replies Found</p>
            <p className="font-headline-md text-secondary tabular-nums">{scannedReplies.length}</p>
          </div>
        </div>

        {/* Interviews */}
        <div className="bg-surface-container border border-outline-variant rounded-2xl p-5 flex items-center gap-4 glass-card stat-card-emerald group hover:border-emerald-500/30 transition-all duration-300">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
            <span className="material-symbols-outlined text-emerald-400 text-[24px]">event_available</span>
          </div>
          <div>
            <p className="text-[11px] text-on-surface-variant uppercase tracking-wider font-bold">Interviews</p>
            <p className="font-headline-md text-emerald-400 tabular-nums">{interviewCount}</p>
          </div>
        </div>
      </div>

      {/* Auto-scan indicator */}
      {isScanning && scannedReplies.length === 0 && (
        <div className="bg-surface-container border border-primary/20 rounded-2xl p-8 flex flex-col items-center justify-center gap-4 animate-pulse">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <div className="text-center">
            <p className="text-on-surface font-bold text-lg">Auto-scanning your inbox...</p>
            <p className="text-on-surface-variant text-sm mt-1">AI is classifying recruiter replies from the last {scanDays} day{scanDays > 1 ? 's' : ''}</p>
          </div>
        </div>
      )}

      {/* Filter Chips */}
      {scannedReplies.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {filterCategories.map(cat => {
            const isActive = scanFilter === cat;
            const count = filterCounts[cat] || 0;
            return (
              <button
                key={cat}
                onClick={() => setScanFilter(cat)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 border ${
                  isActive
                    ? 'bg-primary text-on-primary border-primary shadow-md shadow-primary/20'
                    : 'bg-surface-container text-on-surface-variant border-outline-variant hover:bg-surface-container-highest hover:border-primary/30'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{filterIcons[cat]}</span>
                {cat}
                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                  isActive ? 'bg-on-primary/20 text-on-primary' : 'bg-surface-container-highest text-on-surface-variant'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Email List */}
      {filteredReplies.length > 0 && (
        <div
          ref={scrollContainerRef}
          className="bg-surface-container border border-outline-variant rounded-2xl overflow-hidden glass-card"
        >
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3.5 bg-surface-container-high/60 border-b border-outline-variant/50 text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">
            <div className="col-span-3">Recruiter</div>
            <div className="col-span-2">Classification</div>
            <div className="col-span-4">Summary</div>
            <div className="col-span-2 text-center">Date</div>
            <div className="col-span-1 text-center">Action</div>
          </div>

          {/* Scrollable Email Rows */}
          <div className="divide-y divide-outline-variant/20 max-h-[600px] overflow-y-auto" ref={scrollContainerRef}>
            {visibleReplies.map((reply, i) => {
              const cat = (reply.category || reply.classification || '').toLowerCase().trim();
              const style = getCategoryStyle(cat);
              const name = reply.senderName || reply.sender_name || '';
              const email = reply.senderEmail || reply.sender_email || reply.from || '';
              const globalIndex = scannedReplies.indexOf(reply);

              return (
                <div
                  key={globalIndex}
                  className="group hover:bg-surface-container-highest/40 transition-all duration-200 px-6 py-4"
                >
                  {/* Desktop Row */}
                  <div className="hidden md:grid grid-cols-12 gap-4 items-center">
                    {/* Recruiter */}
                    <div className="col-span-3 flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-container to-secondary-container text-on-primary-container flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                        {name ? name.substring(0, 2).toUpperCase() : 'RE'}
                      </div>
                      <div className="min-w-0">
                        {name && <p className="text-xs font-bold text-on-surface truncate">{name}</p>}
                        <p className="text-[11px] text-on-surface-variant truncate">{email}</p>
                      </div>
                    </div>

                    {/* Classification */}
                    <div className="col-span-2">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg ${style.bg} ${style.text} border ${style.border} text-[11px] font-bold`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`}></span>
                        {style.label}
                      </span>
                    </div>

                    {/* AI Summary */}
                    <div className="col-span-4">
                      <div
                        className="cursor-pointer group/summary"
                        onClick={() => {
                          const next = new Set(expandedSummary);
                          if (next.has(globalIndex)) next.delete(globalIndex);
                          else next.add(globalIndex);
                          setExpandedSummary(next);
                        }}
                      >
                        <p className={`text-[12px] text-on-surface-variant italic leading-relaxed transition-all duration-200 ${expandedSummary.has(globalIndex) ? '' : 'line-clamp-2'}`}>
                          {reply.summary}
                        </p>
                        {reply.summary && reply.summary.length > 60 && (
                          <span className="text-[10px] text-primary font-semibold mt-0.5 inline-flex items-center gap-0.5 opacity-60 group-hover/summary:opacity-100 transition-opacity">
                            <span className="material-symbols-outlined text-[12px]">{expandedSummary.has(globalIndex) ? 'expand_less' : 'expand_more'}</span>
                            {expandedSummary.has(globalIndex) ? 'Show less' : 'Read more'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Date */}
                    <div className="col-span-2 text-center">
                      <span className="text-[11px] font-semibold text-on-surface-variant tabular-nums">
                        {new Date(reply.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>

                    {/* Action */}
                    <div className="col-span-1 flex items-center justify-center">
                      {(reply.messageId || reply.message_id) && (
                        <a
                          href={`https://mail.google.com/mail/u/0/#all/${reply.messageId || reply.message_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg google-gradient-border transition-all duration-200 group/link hover:scale-105 active:scale-95"
                          title="Open in Gmail"
                        >
                          <svg className="w-[16px] h-[16px] shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M5.455 4.64v14.726H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964l1.528 1.146z" fill="#4285F4" />
                            <path d="M3.927 3.493L5.455 4.64v7.09L0 6.82V5.457c0-2.023 2.309-3.178 3.927-1.964z" fill="#B00020" />
                            <path d="M5.455 4.64L12 9.548l6.545-4.908v7.09L12 16.64l-6.545-4.91V4.64z" fill="#EA4335" />
                            <path d="M20.073 3.493L18.545 4.64v7.09L24 6.82V5.457c0-2.023-2.309-3.178-3.927-1.964z" fill="#FBBC05" />
                            <path d="M18.545 4.64v14.726h3.819A1.636 1.636 0 0 0 24 19.366V5.457c0-2.023-2.309-3.178-3.927-1.964l-1.528 1.146z" fill="#34A853" />
                          </svg>
                          <span className="hidden lg:inline font-black tracking-wider text-[12px]">
                            <span className="text-[#4285F4]">G</span>
                            <span className="text-[#ea4335]">m</span>
                            <span className="text-[#fbbc05]">a</span>
                            <span className="text-[#4285F4]">i</span>
                            <span className="text-[#34a853]">l</span>
                          </span>
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Mobile Card */}
                  <div className="md:hidden flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-container to-secondary-container text-on-primary-container flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
                          {name ? name.substring(0, 2).toUpperCase() : 'RE'}
                        </div>
                        <div className="min-w-0">
                          {name && <p className="text-xs font-bold text-on-surface truncate">{name}</p>}
                          <p className="text-[11px] text-on-surface-variant truncate">{email}</p>
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg ${style.bg} ${style.text} border ${style.border} text-[10px] font-bold shrink-0`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`}></span>
                        {style.label}
                      </span>
                    </div>
                    <p className="text-[12px] text-on-surface-variant italic line-clamp-2">{reply.summary}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-on-surface-variant tabular-nums">
                        {new Date(reply.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      {(reply.messageId || reply.message_id) && (
                        <a
                          href={`https://mail.google.com/mail/u/0/#all/${reply.messageId || reply.message_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg google-gradient-border transition-all duration-200 text-[11px]"
                        >
                          <svg className="w-[14px] h-[14px] shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M5.455 4.64v14.726H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964l1.528 1.146z" fill="#4285F4" />
                            <path d="M3.927 3.493L5.455 4.64v7.09L0 6.82V5.457c0-2.023 2.309-3.178 3.927-1.964z" fill="#B00020" />
                            <path d="M5.455 4.64L12 9.548l6.545-4.908v7.09L12 16.64l-6.545-4.91V4.64z" fill="#EA4335" />
                            <path d="M20.073 3.493L18.545 4.64v7.09L24 6.82V5.457c0-2.023-2.309-3.178-3.927-1.964z" fill="#FBBC05" />
                            <path d="M18.545 4.64v14.726h3.819A1.636 1.636 0 0 0 24 19.366V5.457c0-2.023-2.309-3.178-3.927-1.964l-1.528 1.146z" fill="#34A853" />
                          </svg>
                          <span className="font-bold">Open</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Infinite scroll sentinel */}
            {hasMore && (
              <div ref={sentinelRef} className="flex items-center justify-center py-6 gap-2 text-on-surface-variant">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                <span className="text-xs font-semibold">Loading more emails...</span>
              </div>
            )}
          </div>

          {/* Bottom count indicator */}
          <div className="px-6 py-3 bg-surface-container-high/40 border-t border-outline-variant/30 flex items-center justify-between">
            <span className="text-[11px] text-on-surface-variant font-semibold">
              Showing {Math.min(visibleCount, filteredReplies.length)} of {filteredReplies.length} {scanFilter !== 'All' ? `"${scanFilter}"` : ''} replies
            </span>
            {hasMore && (
              <span className="text-[10px] text-primary font-bold flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
                Scroll for more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isScanning && scannedReplies.length === 0 && (
        <div className="bg-surface-container border border-outline-variant rounded-2xl p-12 flex flex-col items-center justify-center gap-5 text-center glass-card">
          <div className="w-20 h-20 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-[40px] opacity-50">inbox</span>
          </div>
          <div className="max-w-md">
            <h3 className="text-on-surface font-bold text-lg mb-1">No scanned replies yet</h3>
            <p className="text-on-surface-variant text-sm leading-relaxed">
              {emailHistory.length === 0
                ? 'Start by sending some outreach emails first, then come back here to scan for replies.'
                : `You have ${emailHistory.length} sent email${emailHistory.length !== 1 ? 's' : ''} in your history. Click "Scan Now" to check for recruiter replies, or wait for the auto-scan.`
              }
            </p>
          </div>
          {emailHistory.length > 0 && (
            <button
              onClick={handleScanReplies}
              disabled={isScanning}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-primary-container to-secondary-container text-on-primary-container rounded-xl font-bold active:scale-95 transition-all duration-200 shadow-md shadow-primary/10 mt-2"
            >
              <span className="material-symbols-outlined text-[20px]">radar</span>
              Scan Inbox Now
            </button>
          )}
        </div>
      )}

      {/* Filter empty state */}
      {!isScanning && scannedReplies.length > 0 && filteredReplies.length === 0 && (
        <div className="bg-surface-container border border-outline-variant rounded-2xl p-10 flex flex-col items-center justify-center gap-3 text-center">
          <span className="material-symbols-outlined text-on-surface-variant text-[36px] opacity-40">filter_alt_off</span>
          <p className="text-on-surface-variant text-sm font-semibold">No emails match the "{scanFilter}" filter</p>
          <button
            onClick={() => setScanFilter('All')}
            className="text-primary text-xs font-bold hover:underline"
          >
            Clear filter
          </button>
        </div>
      )}
    </div>
  );
}
