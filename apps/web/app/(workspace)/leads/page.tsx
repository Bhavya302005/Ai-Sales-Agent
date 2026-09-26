import Link from "next/link";

import { getDiscoveryStatus, getLeads, getOffering } from "@/lib/api";
import { confirmedBusinessProfile } from "@/lib/business-profile";
import { diagnosticsEnabled } from "@/lib/runtime";

import { refreshLeads } from "./actions";
import { LeadsExplorer } from "./leads-explorer";
import { RefreshLeadsButton } from "./refresh-leads-button";

type Search = Promise<{
  q?: string;
  has_phone?: string;
  provider?: string;
}>;

export default async function LeadsPage({ searchParams }: { searchParams: Search }) {
  const filters = await searchParams;
  const query = new URLSearchParams();
  if (filters.q) query.set("q", filters.q);
  if (filters.has_phone) query.set("has_phone", filters.has_phone);

  const [leads, offering, status] = await Promise.all([
    getLeads(query.toString()),
    getOffering(),
    getDiscoveryStatus(),
  ]);

  const profile = confirmedBusinessProfile(offering);
  if (!profile) {
    return (
      <>
        <header className="page-header">
          <div>
            <div className="eyebrow">Opportunity review</div>
            <h1 className="page-title">Set up your business first</h1>
          </div>
          <span className="knowledge-state blocked">Business profile required</span>
        </header>
        <section className="empty-panel">
          <h2>No leads are ready for review.</h2>
          <p>Complete business setup before discovering and qualifying matching opportunities.</p>
          <Link className="primary-button action-link" href="/onboarding">
            Complete business setup
          </Link>
        </section>
      </>
    );
  }

  // Profile updates must never hide or discard leads found by earlier approved
  // versions. All tenant leads remain visible across profile versions.
  // Deduplicate by source_url/id so re-evaluated leads show the latest active score without removing any previous leads.
  const nonFixtureLeads = leads.filter((lead) => !lead.source_url.startsWith("fixture://"));
  const candidateLeads = nonFixtureLeads.length > 0 ? nonFixtureLeads : leads;

  const leadsByOpportunity = new Map<string, (typeof leads)[number]>();
  for (const lead of candidateLeads) {
    const key = lead.source_url || lead.id;
    const existing = leadsByOpportunity.get(key);
    if (!existing || lead.product_version_id === profile.id) {
      leadsByOpportunity.set(key, lead);
    }
  }
  const visibleLeads = Array.from(leadsByOpportunity.values());

  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">Discovery & Lead Review</div>
          <h1 className="page-title">Targeted leads with verified contacts.</h1>
        </div>
        <span className={`knowledge-state ${status.live_refresh_available ? "callable" : "blocked"}`}>
          {status.label}
        </span>
      </header>

      {filters.provider === "failed" ? (
        <div className="provider-notice warning-copy">
          Live Exa refresh was temporarily unavailable. Existing verified leads remain available.
        </div>
      ) : filters.provider === "live" ? (
        <div className="provider-notice">
          Live leads and contact phone numbers refreshed successfully via Exa.
        </div>
      ) : filters.provider === "empty" ? (
        <div className="provider-notice warning-copy">
          Exa completed the refresh but found no new qualified buyer requests. Existing leads remain available.
        </div>
      ) : null}

      <section className="source-import-panel" style={{ marginBottom: "20px" }}>
        <div>
          <p className="kicker">Live Lead Finder</p>
          <h2>Find new matches for your approved ICP</h2>
          <p>
            Real-time decision-maker leads and project requirements discovered using Exa neural search with verified phone numbers.
          </p>
        </div>
        <div className="source-controls">
          <form action={refreshLeads}>
            <RefreshLeadsButton />
          </form>
          <Link className="leads-action-btn secondary" href="/campaigns">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
              <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-4.05 11a22.3 22.3 0 0 1-3.95 2z" />
              <path d="m9 12 2.5 2.5" />
            </svg>
            Launch campaign
          </Link>
        </div>
      </section>

      <LeadsExplorer
        leads={visibleLeads}
        initialQuery={filters.q ?? ""}
        initialHasPhone={filters.has_phone ?? ""}
      />
    </>
  );
}
