'use client';
import { useMemo } from 'react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { useDashboard } from '../DashboardContext';

export default function HomeTab() {
  const ctx = useDashboard();
  const {
    user, emailHistory, bccHistory, scannedReplies, getDynamicChartData,
    setActiveTab, setOutreachTab, totalRepliesFromDb,
    profileFullName, isSidebarCollapsed, credits, setShowBuyCreditsModal
  } = ctx;

  // Memoize chart data — previously called 4x per render
  const chartData = useMemo(() => getDynamicChartData(), [emailHistory, bccHistory, scannedReplies]);

  // Memoize computed stats
  const stats = useMemo(() => {
    const totalSingleSent = emailHistory.length;
    const totalBccSent = bccHistory.reduce((sum: number, h: any) => sum + (h.recipientCount || 0), 0);
    const totalSent = totalSingleSent + totalBccSent;
    const totalOpened = emailHistory.filter((h: any) => h.opened || (h.opensCount && h.opensCount > 0) || h.status === 'Opened').length;
    const totalInterviews = scannedReplies.filter((r: any) => (r.category || r.classification || '').toLowerCase().includes('interview')).length;

    // Real week-over-week trend calculation
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const thisWeekSent = emailHistory.filter((h: any) => h.date && new Date(h.date) >= oneWeekAgo).length;
    const lastWeekSent = emailHistory.filter((h: any) => h.date && new Date(h.date) >= twoWeeksAgo && new Date(h.date) < oneWeekAgo).length;
    const sentTrend = lastWeekSent > 0 ? Math.round(((thisWeekSent - lastWeekSent) / lastWeekSent) * 100) : thisWeekSent > 0 ? 100 : 0;

    const thisWeekReplies = scannedReplies.filter((r: any) => r.date && new Date(r.date) >= oneWeekAgo).length;
    const lastWeekReplies = scannedReplies.filter((r: any) => r.date && new Date(r.date) >= twoWeeksAgo && new Date(r.date) < oneWeekAgo).length;
    const replyTrend = lastWeekReplies > 0 ? Math.round(((thisWeekReplies - lastWeekReplies) / lastWeekReplies) * 100) : thisWeekReplies > 0 ? 100 : 0;

    const openedPct = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
    const repliedPct = totalSent > 0 ? Math.round((totalRepliesFromDb / totalSent) * 100) : 0;
    const interviewPct = totalSent > 0 ? Math.round((totalInterviews / totalSent) * 100) : 0;

    return {
      totalSent, totalOpened, totalInterviews, sentTrend, replyTrend,
      openedPct, repliedPct, interviewPct
    };
  }, [emailHistory, bccHistory, scannedReplies, totalRepliesFromDb]);

  // Chart summary stats (memoized)
  const chartSummary = useMemo(() => ({
    sent: chartData.reduce((acc: number, curr: any) => acc + curr.sentCount, 0),
    opened: chartData.reduce((acc: number, curr: any) => acc + curr.openedCount, 0),
    replies: chartData.reduce((acc: number, curr: any) => acc + curr.replyCount, 0),
  }), [chartData]);

  // Build real activity log from actual data
  const realActivityLog = useMemo(() => {
    const activities: any[] = [];

    // Add recent emails
    emailHistory.slice(0, 10).forEach((h: any) => {
      activities.push({
        type: 'sent',
        event: 'Outreach Email Sent',
        desc: `${h.company ? `Application to ${h.company}` : 'Email sent'} for ${h.jobTitle || 'position'} → ${h.recruiterEmail || 'recruiter'}`,
        time: h.date,
        icon: 'send',
        color: 'text-primary bg-primary/10 border-primary/20',
      });

      if (h.opened || (h.opensCount && h.opensCount > 0)) {
        activities.push({
          type: 'opened',
          event: 'Email Opened!',
          desc: `${h.recruiterEmail || 'Recruiter'} opened your application for ${h.jobTitle || 'the position'}${h.opensCount > 1 ? ` (${h.opensCount}x)` : ''}`,
          time: h.openedAt || h.date,
          icon: 'visibility',
          color: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
        });
      }
    });

    // Add recent replies
    scannedReplies.slice(0, 5).forEach((r: any) => {
      const isInterview = (r.category || '').toLowerCase().includes('interview');
      activities.push({
        type: isInterview ? 'interview' : 'reply',
        event: isInterview ? 'Interview Invitation!' : 'Reply Received',
        desc: `${r.senderName || r.senderEmail || 'Recruiter'}: ${r.subject || 'Response'}`,
        time: r.date,
        icon: isInterview ? 'event_available' : 'reply',
        color: isInterview
          ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
          : 'text-sky-500 bg-sky-500/10 border-sky-500/20',
      });
    });

    // Sort by date (most recent first) and take top 5
    return activities
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 5);
  }, [emailHistory, scannedReplies]);

  // Time of day greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  const displayName = profileFullName?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  const formatTimeAgo = (date: string) => {
    if (!date) return '';
    const diff = Date.now() - new Date(date).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      const summaryData = [
        ["Metric", "Value"],
        ["Total Emails Sent", stats.totalSent],
        ["Total Opens", stats.totalOpened],
        ["Total Replies", totalRepliesFromDb],
        ["Reply Rate", `${stats.repliedPct}%`],
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

      const singleData = [["Date", "Company", "Job Title", "Recruiter Email", "Opens"]];
      emailHistory.forEach((h: any) => {
        singleData.push([
          h.date ? new Date(h.date).toLocaleDateString() : 'N/A',
          h.company || '', h.jobTitle || '', h.recruiterEmail || '',
          h.opensCount || (h.opened ? 1 : 0)
        ]);
      });
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(singleData), "Emails");

      XLSX.writeFile(wb, "Job_Mail_Loop_Report.xlsx");
      toast.success("Excel Report downloaded!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate report.");
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-container-padding-mobile lg:px-container-padding-desktop pt-stack-lg space-y-6 animate-fade-in-right">

      {/* Personalized Welcome Header */}
      <div className="relative overflow-hidden rounded-2xl border border-outline-variant/60 bg-gradient-to-br from-primary/5 via-secondary/5 to-primary/3 p-6 card-elevated">
        <div className="absolute top-0 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-secondary/5 rounded-full blur-2xl pointer-events-none" />
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-on-primary shrink-0 shadow-lg shadow-primary/20">
              <span className="material-symbols-outlined text-[26px]">waving_hand</span>
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-on-surface tracking-tight">
                {greeting}, <span className="bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 bg-clip-text text-transparent">{displayName}</span>
              </h2>
              <p className="text-[13px] text-on-surface-variant mt-0.5">Your outreach command center — live monitoring recruiter engagement.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5 shrink-0">
            <div className="badge-glow badge-glow-online">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Engine Online</span>
            </div>
            <div className="badge-glow badge-glow-syncing">
              <span className="material-symbols-outlined text-[14px]">verified_user</span>
              <span>Gmail Sync</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Action Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { icon: 'edit_note', label: 'New Outreach', desc: 'Write a personalized email', action: () => { setActiveTab('outreach'); setOutreachTab('single'); }, gradient: 'from-indigo-500 to-violet-500' },
          { icon: 'upload_file', label: 'CSV Campaign', desc: 'Bulk send to recruiters', action: () => { setActiveTab('outreach'); setOutreachTab('csv'); }, gradient: 'from-violet-500 to-purple-500' },
          { icon: 'radar', label: 'Scan Replies', desc: 'Check for recruiter responses', action: () => setActiveTab('inbox'), gradient: 'from-emerald-500 to-teal-500' },
        ].map((qa, i) => (
          <button
            key={i}
            onClick={qa.action}
            className="p-4 rounded-xl border border-outline-variant/40 bg-surface-container hover:bg-surface-container-high transition-all duration-300 text-left group cursor-pointer hover:border-primary/30 hover:shadow-md active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${qa.gradient} flex items-center justify-center text-white shrink-0 shadow-md group-hover:scale-105 transition-transform`}>
                <span className="material-symbols-outlined text-[20px]">{qa.icon}</span>
              </div>
              <div>
                <h4 className="text-[13px] font-semibold text-on-surface group-hover:text-primary transition-colors">{qa.label}</h4>
                <p className="text-[11px] text-on-surface-variant mt-0.5">{qa.desc}</p>
              </div>
            </div>
          </button>
        ))}
      </section>

      {/* Stats Overview Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Emails Sent */}
        <div className="bg-surface-container border border-outline-variant p-5 rounded-2xl glass-card stat-card-indigo hover:shadow-lg hover:border-primary/30 transition-all duration-300 group cursor-pointer">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide">Emails Sent</p>
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary group-hover:text-on-primary text-primary transition-all duration-300 shadow-inner">
              <span className="material-symbols-outlined text-[22px]">send</span>
            </div>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-on-surface">{stats.totalSent}</h2>
          <div className={`flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full w-max text-[10px] font-bold ${stats.sentTrend >= 0 ? 'text-emerald-500 bg-emerald-500/10 border border-emerald-500/25' : 'text-rose-500 bg-rose-500/10 border border-rose-500/25'}`}>
            <span className="material-symbols-outlined text-[14px]">{stats.sentTrend >= 0 ? 'trending_up' : 'trending_down'}</span>
            <span>{stats.sentTrend >= 0 ? '+' : ''}{stats.sentTrend}% vs last week</span>
          </div>
        </div>

        {/* Opens */}
        <div className="bg-surface-container border border-outline-variant p-5 rounded-2xl glass-card stat-card-violet hover:shadow-lg hover:border-purple-500/30 transition-all duration-300 group cursor-pointer">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide">Opens</p>
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500 group-hover:bg-purple-500 group-hover:text-white transition-all duration-300 shadow-inner">
              <span className="material-symbols-outlined text-[22px]">visibility</span>
            </div>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-on-surface">{stats.totalOpened}</h2>
          <div className="flex items-center gap-1 mt-2 text-purple-500 bg-purple-500/10 px-2 py-0.5 rounded-full border border-purple-500/25 w-max">
            <span className="text-[10px] font-bold">{stats.openedPct}% open rate</span>
          </div>
        </div>

        {/* Replies */}
        <div className="bg-surface-container border border-outline-variant p-5 rounded-2xl glass-card stat-card-emerald hover:shadow-lg hover:border-emerald-500/30 transition-all duration-300 group cursor-pointer">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide">Replies</p>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 group-hover:bg-emerald-500 group-hover:text-white transition-all duration-300 shadow-inner">
              <span className="material-symbols-outlined text-[22px]">forum</span>
            </div>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-on-surface">{totalRepliesFromDb}</h2>
          <div className={`flex items-center gap-1 mt-2 px-2 py-0.5 rounded-full w-max text-[10px] font-bold ${stats.replyTrend >= 0 ? 'text-emerald-500 bg-emerald-500/10 border border-emerald-500/25' : 'text-rose-500 bg-rose-500/10 border border-rose-500/25'}`}>
            <span className="material-symbols-outlined text-[14px]">{stats.replyTrend >= 0 ? 'trending_up' : 'trending_down'}</span>
            <span>{stats.replyTrend >= 0 ? '+' : ''}{stats.replyTrend}% vs last week</span>
          </div>
        </div>

        {/* Interviews */}
        <div className="bg-surface-container border border-outline-variant p-5 rounded-2xl glass-card stat-card-amber hover:shadow-lg hover:border-amber-500/30 transition-all duration-300 group cursor-pointer"
          onClick={() => setActiveTab('inbox')}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide">Interviews</p>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-all duration-300 shadow-inner">
              <span className="material-symbols-outlined text-[22px]">event_available</span>
            </div>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-on-surface">{stats.totalInterviews}</h2>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">Active Pipeline</span>
          </div>
        </div>

        {/* Credits Balance */}
        <div className="bg-surface-container border border-outline-variant p-5 rounded-2xl glass-card hover:shadow-lg hover:border-amber-500/30 transition-all duration-300 group cursor-pointer"
          onClick={() => setShowBuyCreditsModal(true)}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] text-on-surface-variant font-semibold uppercase tracking-wide">AI Credits</p>
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 group-hover:bg-amber-500 group-hover:text-white transition-all duration-300 shadow-inner">
              <span className="material-symbols-outlined text-[22px]">bolt</span>
            </div>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-on-surface">{credits}</h2>
          <div className="mt-2">
            <div className="w-full h-1.5 bg-surface-container-lowest rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000 ease-out"
                style={{
                  width: `${Math.min(Math.max((credits / 50) * 100, 3), 100)}%`,
                  background: credits > 20 ? 'linear-gradient(to right, #f59e0b, #f97316)' : credits > 5 ? 'linear-gradient(to right, #f97316, #ef4444)' : 'linear-gradient(to right, #ef4444, #dc2626)',
                }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className={`text-[10px] font-bold ${credits > 20 ? 'text-amber-500' : credits > 5 ? 'text-orange-500' : 'text-red-500'}`}>
                {credits > 20 ? 'Healthy' : credits > 5 ? 'Running Low' : credits > 0 ? 'Critical!' : 'Empty!'}
              </span>
              <span className="text-[10px] font-bold text-primary hover:underline">Buy More →</span>
            </div>
          </div>
        </div>
      </section>

      {/* Conversion Funnel */}
      <section className="bg-surface-container border border-outline-variant p-6 rounded-2xl glass-card space-y-5">
        <div>
          <h3 className="text-[15px] text-on-surface font-semibold tracking-tight">Conversion Funnel</h3>
          <p className="text-[12px] text-on-surface-variant mt-0.5">Track your outreach pipeline efficiency</p>
        </div>
        <div className="flex flex-col gap-3">
          {[
            { label: 'Sent', count: stats.totalSent, pct: 100, text: 'Emails', gradient: 'linear-gradient(to right, #3b82f6, #a855f7)' },
            { label: 'Opened', count: stats.totalOpened, pct: stats.openedPct, text: 'Opens', gradient: 'linear-gradient(to right, #d946ef, #a855f7)' },
            { label: 'Replied', count: totalRepliesFromDb, pct: stats.repliedPct, text: 'Replies', gradient: 'linear-gradient(to right, #10b981, #14b8a6)' },
            { label: 'Interview', count: stats.totalInterviews, pct: stats.interviewPct, text: 'Invites', gradient: 'linear-gradient(to right, #f59e0b, #f97316)' },
          ].map((stage, i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="w-20 md:w-24 text-right">
                <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider">{stage.label}</span>
              </div>
              <div className="flex-1 bg-surface-container-lowest rounded-full h-8 overflow-hidden flex items-center relative border border-outline-variant/50">
                <div
                  className="h-full rounded-full transition-all duration-1000 ease-out animate-bar-grow"
                  style={{ width: `${Math.max(stage.pct, 3)}%`, background: stage.gradient }}
                />
                <span className="absolute left-4 text-xs font-bold text-white drop-shadow-md z-10">{stage.count} {stage.text}</span>
                <span className="absolute right-4 text-xs font-bold text-on-surface-variant z-10">{stage.pct}%</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Outreach Performance Chart */}
      <section className="bg-surface-container border border-outline-variant p-6 rounded-2xl glass-card space-y-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h3 className="text-[14px] text-on-surface font-semibold tracking-tight">Outreach Performance</h3>
            <p className="text-[11px] text-on-surface-variant mt-0.5">Daily volume tracking — Last 7 Days</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleExportExcel}
              className="text-[10px] font-bold text-on-primary bg-primary hover:bg-primary/90 transition-colors px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-md active:scale-95"
              title="Download Excel Report"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              Export
            </button>
            <span className="text-[11px] font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
              {chartSummary.sent} Sent
            </span>
            <span className="text-[11px] font-bold text-purple-500 bg-purple-500/10 border border-purple-500/25 px-2.5 py-1 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse"></span>
              {chartSummary.opened} Opened
            </span>
            <span className="text-[11px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              {chartSummary.replies} Replies
            </span>
          </div>
        </div>

        <div className="relative pt-6 px-4 bg-surface-container-lowest/40 rounded-xl border border-outline-variant/60">
          {/* Grid lines */}
          <div className="absolute inset-x-0 top-0 bottom-12 flex flex-col justify-between py-6 pointer-events-none px-4 opacity-20">
            <div className="border-b border-on-surface-variant/40 w-full" />
            <div className="border-b border-on-surface-variant/40 w-full" />
            <div className="border-b border-on-surface-variant/40 w-full" />
            <div className="border-b border-on-surface-variant/40 w-full" />
          </div>

          {/* Bars */}
          <div className="relative h-44 flex items-end justify-between px-2 gap-4 md:gap-8 select-none z-10">
            {chartData.map((bar: any, index: number) => (
              <div key={index} className="flex-1 h-full flex flex-col justify-end items-center group relative cursor-pointer">
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2.5 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-1 group-hover:translate-y-0 pointer-events-none z-20 bg-on-surface text-surface-container-lowest text-[10px] font-bold py-1.5 px-3 rounded-lg shadow-xl flex flex-col items-center border border-outline-variant/20">
                  <span className="whitespace-nowrap text-primary">{bar.sentCount} Sent</span>
                  <span className="whitespace-nowrap text-purple-400 mt-0.5">{bar.openedCount} Opened</span>
                  <span className="whitespace-nowrap text-emerald-400 mt-0.5">{bar.replyCount} Replies</span>
                  <span className="text-[8px] text-on-surface-variant/80 font-mono mt-1">{bar.dateStr}</span>
                  <div className="w-2 h-2 bg-on-surface rotate-45 -mb-1.5 mt-0.5" />
                </div>

                {/* Three bars side by side */}
                <div className="flex items-end gap-1.5 w-full justify-center h-full pb-1">
                  {/* Sent */}
                  <div className="flex-1 flex flex-col justify-end items-center h-full relative">
                    {bar.sentCount > 0 && (
                      <div
                        className="w-2.5 md:w-4 rounded-t-sm transition-all duration-500 ease-out shadow-[0_0_8px_rgba(59,130,246,0.35)] animate-bar-grow"
                        style={{ height: bar.sentHeight, background: 'linear-gradient(to top, #3b82f6, #a855f7)' }}
                      />
                    )}
                  </div>
                  {/* Opened */}
                  <div className="flex-1 flex flex-col justify-end items-center h-full relative">
                    {bar.openedCount > 0 && (
                      <div
                        className="w-2.5 md:w-4 rounded-t-sm transition-all duration-500 ease-out shadow-[0_0_8px_rgba(217,70,239,0.35)] animate-bar-grow"
                        style={{ height: bar.openedHeight, background: 'linear-gradient(to top, #d946ef, #a855f7)', animationDelay: '100ms' }}
                      />
                    )}
                  </div>
                  {/* Reply */}
                  <div className="flex-1 flex flex-col justify-end items-center h-full relative">
                    {bar.replyCount > 0 && (
                      <div
                        className="w-2.5 md:w-4 rounded-t-sm transition-all duration-500 ease-out shadow-[0_0_8px_rgba(16,185,129,0.35)] animate-bar-grow"
                        style={{ height: bar.replyHeight, background: 'linear-gradient(to top, #10b981, #14b8a6)', animationDelay: '200ms' }}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* X-axis */}
          <div className="flex justify-between items-center px-2 py-3.5 border-t border-outline-variant/60 mt-3 text-[11px] text-on-surface-variant font-bold">
            {chartData.map((bar: any, index: number) => (
              <span key={index} className="flex-1 text-center font-mono">{bar.day}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Recent Activity Log — REAL DATA */}
      <section className="bg-surface-container border border-outline-variant p-6 rounded-2xl glass-card space-y-5">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[24px]">history</span>
            <h3 className="text-[15px] text-on-surface font-semibold tracking-tight">Recent Activity</h3>
          </div>
          <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20 uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        </div>

        <div className="space-y-3">
          {realActivityLog.length > 0 ? realActivityLog.map((item: any, index: number) => (
            <div key={index} className={`flex gap-4 p-3.5 rounded-xl bg-surface-container-low hover:bg-surface-container-high/40 transition-all duration-200 border border-outline-variant/40 group cursor-pointer hover:translate-x-1 animate-slide-up stagger-${Math.min(index + 1, 6)}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 group-hover:scale-105 transition-transform ${item.color}`}>
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start gap-2">
                  <h4 className="font-medium text-on-surface truncate group-hover:text-primary transition-colors text-[13px]">{item.event}</h4>
                  <span className="text-[10px] text-on-surface-variant whitespace-nowrap font-mono">{formatTimeAgo(item.time)}</span>
                </div>
                <p className="text-on-surface-variant truncate mt-0.5 text-[11px]">{item.desc}</p>
              </div>
            </div>
          )) : (
            <div className="text-center py-8 text-on-surface-variant">
              <span className="material-symbols-outlined text-[40px] opacity-30 mb-2 block">inbox</span>
              <p className="text-sm font-medium">No activity yet</p>
              <p className="text-xs mt-1">Start sending outreach emails to see your activity here</p>
              <button
                onClick={() => setActiveTab('outreach')}
                className="mt-4 px-4 py-2 bg-primary/10 text-primary font-bold text-xs rounded-lg hover:bg-primary/20 transition-colors border border-primary/20"
              >
                Send Your First Email
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
