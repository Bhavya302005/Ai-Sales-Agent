"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { LeadSummary } from "@/lib/api";
import { CustomSelect } from "@/app/ui/custom-select";

interface LeadsExplorerProps {
  leads: LeadSummary[];
  initialQuery?: string;
  initialHasPhone?: string;
}

function formatPostDate(dateStr?: string | null): { display: string; tooltip: string } | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const dayDate = date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  let relative = "";
  if (diffMinutes < 60) {
    relative = diffMinutes <= 1 ? "Just now" : `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    relative = `${diffHours}h ago`;
  } else if (diffDays === 1) {
    relative = "Yesterday";
  } else if (diffDays < 7) {
    relative = `${diffDays}d ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    relative = `${weeks}w ago`;
  } else {
    const months = Math.floor(diffDays / 30);
    relative = `${months}mo ago`;
  }

  return {
    display: `${relative} · ${dayDate}`,
    tooltip: `Post / Discovery date: ${date.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })} at ${date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`,
  };
}

const CONTACT_OPTIONS = [
  { value: "", label: "All contacts" },
  { value: "true", label: "Verified phone only" },
  { value: "email", label: "Verified email only" },
  { value: "both", label: "Phone and email" },
];

const FIT_OPTIONS = [
  { value: "all", label: "All fit scores" },
  { value: "high", label: "High fit (60%+)" },
  { value: "medium", label: "Good fit (40–59%)" },
];

const SORT_OPTIONS = [
  { value: "score_desc", label: "Sort: Highest fit" },
  { value: "score_asc", label: "Sort: Lowest fit" },
  { value: "newest", label: "Sort: Newest discovered" },
  { value: "alpha", label: "Sort: Name (A–Z)" },
];

export function LeadsExplorer({
  leads,
  initialQuery = "",
  initialHasPhone = "",
}: LeadsExplorerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [query, setQuery] = useState(initialQuery);
  const [contactFilter, setContactFilter] = useState(initialHasPhone);
  const [fitFilter, setFitFilter] = useState("all");
  const [sortBy, setSortBy] = useState<"score_desc" | "score_asc" | "newest" | "alpha">("score_desc");

  // Filter and sort logic
  const filteredLeads = useMemo(() => {
    return leads
      .filter((lead) => {
        // Search query filter
        if (query.trim()) {
          const q = query.trim().toLowerCase();
          const matchCompany = (lead.company_name || "").toLowerCase().includes(q);
          const matchContact = (lead.contact_name || "").toLowerCase().includes(q);
          const matchNeed = (lead.normalized_need || "").toLowerCase().includes(q);
          const matchUrl = (lead.source_url || "").toLowerCase().includes(q);
          const matchPhone = (lead.best_phone || "").toLowerCase().includes(q);
          const matchEmail = (lead.best_email || "").toLowerCase().includes(q);
          if (!matchCompany && !matchContact && !matchNeed && !matchUrl && !matchPhone && !matchEmail) {
            return false;
          }
        }

        // Contact filter
        if (contactFilter === "true" || contactFilter === "phone") {
          if (!lead.best_phone) return false;
        } else if (contactFilter === "email") {
          if (!lead.best_email) return false;
        } else if (contactFilter === "both") {
          if (!lead.best_phone || !lead.best_email) return false;
        }

        // Fit filter
        if (fitFilter === "high") {
          if ((lead.score ?? 0) < 60) return false;
        } else if (fitFilter === "medium") {
          const s = lead.score ?? 0;
          if (s < 40 || s >= 60) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "score_desc") {
          return (b.score ?? 0) - (a.score ?? 0);
        }
        if (sortBy === "score_asc") {
          return (a.score ?? 0) - (b.score ?? 0);
        }
        if (sortBy === "newest") {
          const dateA = a.published_at ? new Date(a.published_at).getTime() : 0;
          const dateB = b.published_at ? new Date(b.published_at).getTime() : 0;
          return dateB - dateA;
        }
        if (sortBy === "alpha") {
          const nameA = a.contact_name || a.company_name || "";
          const nameB = b.contact_name || b.company_name || "";
          return nameA.localeCompare(nameB);
        }
        return 0;
      });
  }, [leads, query, contactFilter, fitFilter, sortBy]);

  const hasActiveFilters = Boolean(query.trim() || (contactFilter && contactFilter !== "") || fitFilter !== "all" || sortBy !== "score_desc");

  function handleFilterSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query.trim()) {
        params.set("q", query.trim());
      } else {
        params.delete("q");
      }
      if (contactFilter && contactFilter !== "all") {
        params.set("has_phone", contactFilter === "true" || contactFilter === "phone" ? "true" : contactFilter);
      } else {
        params.delete("has_phone");
      }
      router.replace(`/leads?${params.toString()}`, { scroll: false });
    });
  }

  function handleReset() {
    setQuery("");
    setContactFilter("");
    setFitFilter("all");
    setSortBy("score_desc");
    startTransition(() => {
      router.replace("/leads", { scroll: false });
    });
  }

  return (
    <div className="leads-explorer-container">
      {/* Search & Filter Toolbar with custom DESIGN.md components */}
      <form className="leads-toolbar" onSubmit={handleFilterSubmit}>
        <div className="leads-search-wrapper">
          <svg className="leads-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            className="leads-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by company, decision maker, requirement, phone..."
          />
          {query ? (
            <button
              type="button"
              className="leads-clear-input"
              onClick={() => setQuery("")}
              aria-label="Clear search"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ) : null}
        </div>

        <CustomSelect
          value={contactFilter}
          onChange={(val) => setContactFilter(val)}
          options={CONTACT_OPTIONS}
          ariaLabel="Filter by contact channel"
        />

        <CustomSelect
          value={fitFilter}
          onChange={(val) => setFitFilter(val)}
          options={FIT_OPTIONS}
          ariaLabel="Filter by fit score"
        />

        <CustomSelect
          value={sortBy}
          onChange={(val) => setSortBy(val as typeof sortBy)}
          options={SORT_OPTIONS}
          ariaLabel="Sort leads"
        />

        <button className="leads-filter-btn" type="submit">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
          </svg>
          Filter
        </button>

        {hasActiveFilters ? (
          <button className="leads-reset-btn" type="button" onClick={handleReset}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
              <path d="M3 3v5h5"></path>
            </svg>
            Reset
          </button>
        ) : null}
      </form>

      {/* Counter & Active Filter Pills without emojis */}
      <div className="leads-status-row">
        <div className="leads-count-badge">
          <strong>{filteredLeads.length}</strong>
          <span>of {leads.length} leads</span>
        </div>

        {hasActiveFilters ? (
          <div className="leads-active-pills">
            {query.trim() ? (
              <span className="leads-pill">
                Keyword: &ldquo;{query.trim()}&rdquo;
                <button type="button" onClick={() => setQuery("")} aria-label="Remove keyword filter">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            ) : null}
            {contactFilter ? (
              <span className="leads-pill">
                {contactFilter === "true" || contactFilter === "phone"
                  ? "Verified phone"
                  : contactFilter === "email"
                  ? "Verified email"
                  : "Phone & email"}
                <button type="button" onClick={() => setContactFilter("")} aria-label="Remove contact channel filter">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            ) : null}
            {fitFilter !== "all" ? (
              <span className="leads-pill">
                {fitFilter === "high" ? "High fit (60%+)" : "Good fit (40–59%)"}
                <button type="button" onClick={() => setFitFilter("all")} aria-label="Remove fit filter">
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </span>
            ) : null}
          </div>
        ) : (
          <span className="mode-badge">Ranked by evidence & fit</span>
        )}
      </div>

      {/* Leads List */}
      <section className="lead-list" aria-label="Opportunities">
        {filteredLeads.map((lead) => {
          const displayName = lead.contact_name || lead.company_name || "Decision Maker";
          const subtitle = lead.contact_name && lead.company_name ? lead.company_name : lead.lifecycle;
          const postDate = formatPostDate(lead.published_at);

          return (
            <Link className="lead-row" href={`/leads/${lead.id}`} key={lead.id}>
              <div>
                <div className="lead-meta">
                  <span className="lead-primary-name">{displayName}</span>
                  <span>·</span>
                  <span>{subtitle}</span>
                  {postDate ? (
                    <>
                      <span>·</span>
                      <span className="lead-post-date" title={postDate.tooltip} suppressHydrationWarning>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.65 }}>
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        {postDate.display}
                      </span>
                    </>
                  ) : null}
                </div>
                <h2>{lead.normalized_need}</h2>
                <p>{lead.source_url.startsWith("fixture://") ? "Sample opportunity data" : lead.source_url}</p>

                <div className="lead-contact-badges">
                  {lead.best_phone ? (
                    <span className="contact-badge phone-badge" title="Verified phone number">
                      <span className="badge-icon">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                      </span>
                      <strong>{lead.best_phone}</strong>
                      <span className="badge-action">Ready</span>
                    </span>
                  ) : (
                    <span className="contact-badge phone-pending">
                      <span className="badge-icon">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                      </span>
                      <span>Phone enriched on demand</span>
                    </span>
                  )}
                  {lead.best_email ? (
                    <span className="contact-badge email-badge" title="Verified email">
                      <span className="badge-icon">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="4" width="20" height="16" rx="2" />
                          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                        </svg>
                      </span>
                      <span>{lead.best_email}</span>
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="score-orb" aria-label={lead.score === null ? "Not scored" : `Score ${lead.score}`}>
                {lead.score ?? "—"}
                <span>fit</span>
              </div>
            </Link>
          );
        })}

        {filteredLeads.length === 0 && (
          <div className="empty-panel leads-empty-filter-state">
            <div className="empty-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <h2>No matching leads found</h2>
            <p>
              No leads match your current search & filter criteria.
              {hasActiveFilters ? " Try clearing or broadening your filters." : " Discover new leads with Exa."}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                className="leads-filter-btn"
                style={{ marginTop: "16px", display: "inline-flex" }}
                onClick={handleReset}
              >
                Clear all filters
              </button>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
