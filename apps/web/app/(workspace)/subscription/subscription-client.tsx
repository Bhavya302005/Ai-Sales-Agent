"use client";

import { useState } from "react";

import type { Me, Subscription, Usage } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Tab = "overview" | "pricing" | "usage" | "billing";

interface Props {
  me: Me;
  subscription: Subscription;
  usage: Usage;
}

// ---------------------------------------------------------------------------
// Static demo billing history
// ---------------------------------------------------------------------------

const BILLING_HISTORY = [
  { id: "INV-0003", date: "1 Sep 2026", amount: "₹0", plan: "Starter", status: "paid" },
  { id: "INV-0002", date: "1 Aug 2026", amount: "₹0", plan: "Starter", status: "paid" },
  { id: "INV-0001", date: "1 Jul 2026", amount: "₹0", plan: "Starter", status: "paid" },
];

// ---------------------------------------------------------------------------
// Plan feature check icon
// ---------------------------------------------------------------------------

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={16}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2.2}
      viewBox="0 0 24 24"
      width={16}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function CrossIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={16}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={16}
      style={{ opacity: 0.3 }}
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Usage meter row
// ---------------------------------------------------------------------------

function UsageMeterRow({
  label,
  used,
  limit,
  unit,
}: {
  label: string;
  used: number;
  limit: number;
  unit: string;
}) {
  const unlimited = limit === -1;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const fillClass =
    pct >= 95 ? "usage-bar-fill crit" : pct >= 80 ? "usage-bar-fill warn" : "usage-bar-fill";

  return (
    <div className="usage-meter-row">
      <div className="usage-meter-header">
        <span className="usage-meter-label">{label}</span>
        <span className="usage-meter-value">
          {unlimited ? (
            <span className="usage-unlimited">Unlimited</span>
          ) : (
            <>
              <span>{used.toLocaleString("en-IN")}</span>
              <span className="usage-meter-sep">/ {limit.toLocaleString("en-IN")} {unit}</span>
            </>
          )}
        </span>
      </div>
      <div className="usage-bar-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={fillClass} style={{ width: unlimited ? "0%" : `${pct}%` }} />
      </div>
      {!unlimited && (
        <div className="usage-meter-pct">{pct}% used</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Upgrade modal
// ---------------------------------------------------------------------------

function UpgradeModal({
  open,
  onClose,
  targetPlan,
}: {
  open: boolean;
  onClose: () => void;
  targetPlan: string;
}) {
  if (!open) return null;
  return (
    <div
      className="upgrade-modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <dialog
        open
        className="upgrade-modal"
        aria-labelledby="upgrade-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="upgrade-modal-close"
          onClick={onClose}
          aria-label="Close upgrade dialog"
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="upgrade-modal-badge">
          <span className="sub-plan-dot" />
          Upgrade request
        </div>

        <h2 id="upgrade-modal-title" className="upgrade-modal-title">
          Upgrade to {targetPlan}
        </h2>
        <p className="upgrade-modal-copy">
          Our team will get you set up on the right plan within one business day. No credit card required to talk.
        </p>

        <div className="upgrade-modal-actions">
          <a
            href="mailto:sales@signalpath.ai?subject=Upgrade%20to%20Pro"
            className="primary-button upgrade-modal-cta"
          >
            Email sales team
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </a>
          <button type="button" className="secondary-button" onClick={onClose}>
            Maybe later
          </button>
        </div>

        <p className="upgrade-modal-fine">
          Or reach us at{" "}
          <a href="mailto:sales@signalpath.ai">sales@signalpath.ai</a>
          {" "}— we typically respond within 4 hours.
        </p>
      </dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cancel confirm modal
// ---------------------------------------------------------------------------

function CancelModal({
  open,
  onClose,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  if (!open) return null;
  return (
    <div className="upgrade-modal-backdrop" onClick={onClose} role="presentation">
      <dialog open className="upgrade-modal cancel-modal" aria-labelledby="cancel-modal-title" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="upgrade-modal-close" onClick={onClose} aria-label="Close">
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <div className="cancel-modal-icon" aria-hidden="true">⚠</div>
        <h2 id="cancel-modal-title" className="upgrade-modal-title">Cancel subscription?</h2>
        <p className="upgrade-modal-copy">
          Your access continues until the end of the current billing period. This action cannot be undone automatically — contact support to reverse it.
        </p>
        <div className="upgrade-modal-actions">
          <button
            type="button"
            className="sub-cancel-confirm-btn"
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? "Sending…" : "Yes, cancel my plan"}
          </button>
          <button type="button" className="secondary-button" onClick={onClose}>
            Keep my plan
          </button>
        </div>
      </dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Overview
// ---------------------------------------------------------------------------

function OverviewTab({
  subscription,
  usage,
  isOwner,
  onUpgradeClick,
}: {
  subscription: Subscription;
  usage: Usage;
  isOwner: boolean;
  onUpgradeClick: (plan: string) => void;
}) {
  const planName = subscription.catalogue.find((c) => c.slug === subscription.plan)?.display_name ?? subscription.plan;
  const isPro = subscription.plan === "pro";
  const isEnterprise = subscription.plan === "enterprise";
  const periodEnd = new Date(subscription.period_end).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

  // Map real usage quantities from analytics API
  const callSeconds = Number(usage.totals.find((t) => t.unit === "call_seconds")?.quantity ?? 0);
  const callMinutes = Math.round(callSeconds / 60);

  return (
    <div className="sub-overview-layout">
      {/* Current Plan Hero */}
      <div className="plan-current-card glow-dark">
        <div className="plan-current-top">
          <span className="plan-current-badge">Current plan</span>
          {subscription.status === "active" && (
            <span className="sub-status-pill sub-status-active">● Active</span>
          )}
        </div>

        <div className="plan-tier-name">{planName}</div>

        <div className="plan-current-price">
          {subscription.catalogue.find((c) => c.slug === subscription.plan)?.price_inr === 0 ? (
            <span className="plan-price-free">Free forever</span>
          ) : subscription.catalogue.find((c) => c.slug === subscription.plan)?.price_inr === -1 ? (
            <span className="plan-price-custom">Custom pricing</span>
          ) : (
            <>
              <span className="plan-price-amount">₹{(subscription.catalogue.find((c) => c.slug === subscription.plan)?.price_inr ?? 0).toLocaleString("en-IN")}</span>
              <span className="plan-price-period">/ month</span>
            </>
          )}
        </div>

        <p className="plan-current-renew">
          {subscription.cancel_requested
            ? "Access ends " + periodEnd
            : "Renews " + periodEnd}
        </p>

        {isOwner && !isEnterprise && (
          <button
            type="button"
            className="primary-button plan-upgrade-btn"
            onClick={() => onUpgradeClick("Pro")}
          >
            Upgrade to Pro
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Quick Stats */}
      <div className="sub-quick-stats">
        <div className="sub-stat-card">
          <div className="sub-stat-label">Leads this period</div>
          <div className="sub-stat-val">
            {usage.totals.find((t) => t.unit === "enrichment_units") ? (
              Number(usage.totals.find((t) => t.unit === "enrichment_units")!.quantity).toLocaleString("en-IN")
            ) : "—"}
          </div>
          <div className="sub-stat-limit">of {isPro ? "500" : isEnterprise ? "∞" : "50"} limit</div>
        </div>
        <div className="sub-stat-card">
          <div className="sub-stat-label">AI voice minutes</div>
          <div className="sub-stat-val">{callMinutes.toLocaleString("en-IN")}</div>
          <div className="sub-stat-limit">of {isPro ? "600" : isEnterprise ? "∞" : "60"} limit</div>
        </div>
        <div className="sub-stat-card">
          <div className="sub-stat-label">Estimated cost</div>
          <div className="sub-stat-val">₹{Number(usage.total_estimated_cost_inr).toFixed(2)}</div>
          <div className="sub-stat-limit">this billing period</div>
        </div>
        <div className="sub-stat-card">
          <div className="sub-stat-label">Voice latency</div>
          <div className="sub-stat-val">
            {usage.average_voice_latency_ms === null ? "—" : `${usage.average_voice_latency_ms} ms`}
          </div>
          <div className="sub-stat-limit">avg round-trip</div>
        </div>
      </div>

      {/* Features included */}
      <div className="sub-included-features">
        <p className="kicker" style={{ marginBottom: 14 }}>Included in your plan</p>
        <div className="sub-features-grid">
          {(subscription.catalogue.find((c) => c.slug === subscription.plan)?.features ?? []).map((feat) => (
            <div key={feat} className="sub-feat-item">
              <span className="sub-feat-check"><CheckIcon /></span>
              <span>{feat}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Plans & Pricing
// ---------------------------------------------------------------------------

function PricingTab({
  subscription,
  isOwner,
  onUpgradeClick,
}: {
  subscription: Subscription;
  isOwner: boolean;
  onUpgradeClick: (plan: string) => void;
}) {
  // Feature union across all plans for comparison table
  const allFeatures = Array.from(
    new Set(subscription.catalogue.flatMap((p) => p.features))
  );

  return (
    <div className="sub-pricing-section">
      <div className="sub-pricing-header">
        <div className="eyebrow" style={{ marginBottom: 8 }}>Transparent pricing</div>
        <h2 className="sub-pricing-title">Choose the right plan</h2>
        <p className="sub-pricing-sub">All plans include evidence-backed qualification, consent gating, and full audit trails.</p>
      </div>

      <div className="sub-pricing-grid" role="list">
        {subscription.catalogue.map((plan) => {
          const isCurrent = plan.slug === subscription.plan;
          const isPro = plan.slug === "pro";
          const isEnt = plan.slug === "enterprise";

          return (
            <div
              key={plan.slug}
              className={`sub-plan-col${isPro ? " featured" : ""}`}
              role="listitem"
              aria-label={`${plan.display_name} plan`}
            >
              {isPro && (
                <div className="sub-plan-popular-badge">Most popular</div>
              )}

              <div className="sub-plan-header">
                <h3 className="sub-plan-name">{plan.display_name}</h3>
                <div className="sub-plan-price">
                  {plan.price_inr === 0 ? (
                    <>
                      <span className="sub-price-amount">₹0</span>
                      <span className="sub-price-period">/ month</span>
                    </>
                  ) : plan.price_inr === -1 ? (
                    <span className="sub-price-custom">Custom</span>
                  ) : (
                    <>
                      <span className="sub-price-amount">₹{plan.price_inr.toLocaleString("en-IN")}</span>
                      <span className="sub-price-period">/ month</span>
                    </>
                  )}
                </div>
                <p className="sub-plan-billing">
                  {plan.price_inr === -1 ? "Annual commitment" : `Billed ${plan.billing_period}`}
                </p>
              </div>

              <div className="sub-plan-cta">
                {isCurrent ? (
                  <span className="sub-current-badge">✓ Current plan</span>
                ) : isOwner ? (
                  <>
                    <button
                      type="button"
                      className={`primary-button sub-plan-btn${isPro ? " sub-plan-btn-featured" : ""}`}
                      onClick={() => onUpgradeClick(plan.display_name)}
                    >
                      {plan.slug === "starter" ? "Downgrade" : "Upgrade"} to {plan.display_name}
                    </button>
                    {isEnt ? (
                      <p style={{ textAlign: "center", margin: "10px 0 0", fontSize: "12px", color: "var(--muted)" }}>
                        Need custom volume? <a href="mailto:sales@signalpath.ai?subject=Enterprise%20Custom%20Scale" style={{ color: "var(--ink)", textDecoration: "underline" }}>Contact sales</a>
                      </p>
                    ) : null}
                  </>
                ) : null}
              </div>

              <ul className="sub-plan-features" aria-label={`${plan.display_name} features`}>
                {plan.features.map((feat) => (
                  <li key={feat} className="sub-feat-row">
                    <span className="sub-feat-check-green"><CheckIcon /></span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <p className="sub-pricing-fine">
        All prices shown in INR. Taxes may apply. Cancel anytime during the current billing period.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Usage
// ---------------------------------------------------------------------------

const USAGE_LABELS: Record<string, { label: string; unit: string }> = {
  llm_tokens: { label: "LLM tokens", unit: "tokens" },
  stt_seconds: { label: "Speech-to-text", unit: "sec" },
  tts_characters: { label: "Text-to-speech", unit: "chars" },
  call_seconds: { label: "Call time", unit: "sec" },
  enrichment_units: { label: "Discovery units", unit: "units" },
  email_drafts: { label: "Emails sent", unit: "emails" },
};

function UsageTab({
  usage,
  subscription,
}: {
  usage: Usage;
  subscription: Subscription;
}) {
  const callSeconds = Number(usage.totals.find((t) => t.unit === "call_seconds")?.quantity ?? 0);
  const omnidimUsage = usage.providers?.find((p) => p.provider === "omnidimension");
  const exaUsage = usage.providers?.find((p) => p.provider === "exa");

  return (
    <div className="sub-usage-layout">
      {/* Actual Provider Usage: OmniDimension & Exa */}
      <div className="sub-provider-usage-grid">
        <div className="sub-provider-card">
          <div className="sub-provider-header">
            <h3 className="sub-provider-title">OmniDimension Voice AI</h3>
            <span className="sub-provider-tag">Voice Outbound</span>
          </div>
          <div className="sub-provider-metrics">
            <div>
              <div className="sub-provider-metric-val">
                {omnidimUsage ? Number(omnidimUsage.quantity).toFixed(1) : (callSeconds / 60).toFixed(1)} min
              </div>
              <div className="sub-provider-metric-lbl">Actual voice time</div>
            </div>
            <div>
              <div className="sub-provider-metric-val">
                ₹{omnidimUsage ? Number(omnidimUsage.cost_inr).toFixed(2) : ((callSeconds / 60) * 7.0).toFixed(2)}
              </div>
              <div className="sub-provider-metric-lbl">Actual provider cost</div>
            </div>
          </div>
          <div className="sub-provider-details">
            {omnidimUsage?.details ?? "OmniDimension carrier PSTN · ₹7.00/min rate"}
          </div>
        </div>

        <div className="sub-provider-card">
          <div className="sub-provider-header">
            <h3 className="sub-provider-title">Exa Semantic Discovery</h3>
            <span className="sub-provider-tag">Lead Intelligence</span>
          </div>
          <div className="sub-provider-metrics">
            <div>
              <div className="sub-provider-metric-val">
                {exaUsage ? Number(exaUsage.quantity).toLocaleString("en-IN") : Number(usage.totals.find((t) => t.unit === "enrichment_units")?.quantity ?? 0).toLocaleString("en-IN")}
              </div>
              <div className="sub-provider-metric-lbl">Candidate leads</div>
            </div>
            <div>
              <div className="sub-provider-metric-val">
                ₹{exaUsage ? Number(exaUsage.cost_inr).toFixed(2) : (Number(usage.totals.find((t) => t.unit === "enrichment_units")?.quantity ?? 0) * 0.25).toFixed(2)}
              </div>
              <div className="sub-provider-metric-lbl">Actual discovery cost</div>
            </div>
          </div>
          <div className="sub-provider-details">
            {exaUsage?.details ?? "Exa neural search active · ₹0.25/lead rate"}
          </div>
        </div>

        <div className="sub-provider-card">
          <div className="sub-provider-header">
            <h3 className="sub-provider-title">Email Outreach</h3>
            <span className="sub-provider-tag">Async Follow-up</span>
          </div>
          <div className="sub-provider-metrics">
            <div>
              <div className="sub-provider-metric-val">
                {Number(usage.totals.find((t) => t.unit === "email_drafts")?.quantity ?? 0).toLocaleString("en-IN")}
              </div>
              <div className="sub-provider-metric-lbl">Emails sent this period</div>
            </div>
            <div>
              <div className="sub-provider-metric-val">
                {subscription.limits.emails_per_month === -1 ? "∞" : subscription.limits.emails_per_month.toLocaleString("en-IN")}
              </div>
              <div className="sub-provider-metric-lbl">Monthly limit</div>
            </div>
          </div>
          <div className="sub-provider-details">
            SendGrid · Evidence-grounded AI drafts · Open tracking included
          </div>
        </div>
      </div>

      <div className="sub-usage-hero">
        <div className="sub-usage-cost-card">
          <p className="kicker" style={{ color: "rgba(255,255,255,0.5)" }}>Total estimated cost</p>
          <div className="sub-usage-total-cost">
            ₹{Number(usage.total_estimated_cost_inr).toFixed(2)}
          </div>
          {usage.total_actual_cost_inr !== null && (
            <div className="sub-usage-actual-cost">
              Actual: ₹{Number(usage.total_actual_cost_inr).toFixed(2)}
            </div>
          )}
          <p className="sub-usage-cost-note">{usage.cost_label}</p>
        </div>

        <div className="sub-usage-signals">
          <div className="sub-signal-item">
            <span className="sub-signal-label">Voice latency</span>
            <span className="sub-signal-val">
              {usage.average_voice_latency_ms === null ? "Not measured" : `${usage.average_voice_latency_ms} ms avg`}
            </span>
          </div>
          <div className="sub-signal-item">
            <span className="sub-signal-label">CRM retrying</span>
            <span className="sub-signal-val">{usage.crm_retrying}</span>
          </div>
          <div className="sub-signal-item">
            <span className="sub-signal-label">CRM action needed</span>
            <span className="sub-signal-val sub-signal-alert">
              {usage.crm_action_required > 0 ? `⚠ ${usage.crm_action_required}` : "0"}
            </span>
          </div>
          <div className="sub-signal-item">
            <span className="sub-signal-label">AI minutes used</span>
            <span className="sub-signal-val">{Math.round(callSeconds / 60)} min</span>
          </div>
        </div>
      </div>

      <div className="sub-usage-meters">
        <p className="kicker" style={{ marginBottom: 18 }}>Usage by dimension</p>

        {usage.totals.map((item) => {
          const { label, unit } = USAGE_LABELS[item.unit] ?? { label: item.unit, unit: "" };
          const qty = Number(item.quantity);

          // Map usage unit to plan limit
          let limit = -1;
          if (item.unit === "call_seconds") limit = subscription.limits.ai_minutes_per_month * 60;
          if (item.unit === "enrichment_units") limit = subscription.limits.leads_per_month;

          return (
            <UsageMeterRow
              key={item.unit}
              label={label}
              used={qty}
              limit={limit}
              unit={unit}
            />
          );
        })}
      </div>

      <div className="sub-usage-breakdown">
        <p className="kicker" style={{ marginBottom: 14 }}>Cost breakdown by service</p>
        <div className="sub-breakdown-table">
          <div className="sub-breakdown-header">
            <span>Service</span>
            <span>Quantity</span>
            <span>Estimated cost</span>
          </div>
          {usage.totals.map((item) => (
            <div key={item.unit} className="sub-breakdown-row">
              <span>{USAGE_LABELS[item.unit]?.label ?? item.unit}</span>
              <span>{Number(item.quantity).toLocaleString("en-IN")} {USAGE_LABELS[item.unit]?.unit}</span>
              <span>₹{Number(item.estimated_cost_inr).toFixed(4)}</span>
            </div>
          ))}
          <div className="sub-breakdown-total">
            <span>Total</span>
            <span />
            <span>₹{Number(usage.total_estimated_cost_inr).toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab: Billing
// ---------------------------------------------------------------------------

function BillingTab({
  subscription,
  isOwner,
  onCancelClick,
}: {
  subscription: Subscription;
  isOwner: boolean;
  onCancelClick: () => void;
}) {
  const periodStart = new Date(subscription.period_start).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });
  const periodEnd = new Date(subscription.period_end).toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="sub-billing-layout">
      {/* Period card */}
      <div className="billing-period-card">
        <div className="billing-period-row">
          <div>
            <p className="kicker">Billing period</p>
            <div className="billing-period-dates">
              <span>{periodStart}</span>
              <span className="billing-period-arrow">→</span>
              <span>{periodEnd}</span>
            </div>
          </div>
          <div className="billing-period-status">
            <span className={`sub-status-pill ${subscription.cancel_requested ? "sub-status-cancel" : "sub-status-active"}`}>
              {subscription.cancel_requested ? "● Cancellation pending" : "● Active"}
            </span>
          </div>
        </div>

        <div className="billing-info-grid">
          <div>
            <span className="billing-info-label">Plan</span>
            <strong className="billing-info-val">
              {subscription.catalogue.find((c) => c.slug === subscription.plan)?.display_name ?? subscription.plan}
            </strong>
          </div>
          <div>
            <span className="billing-info-label">Billing cycle</span>
            <strong className="billing-info-val capitalize">
              {subscription.catalogue.find((c) => c.slug === subscription.plan)?.billing_period ?? "monthly"}
            </strong>
          </div>
          <div>
            <span className="billing-info-label">Amount due</span>
            <strong className="billing-info-val">
              {subscription.catalogue.find((c) => c.slug === subscription.plan)?.price_inr === 0
                ? "₹0 (Free)"
                : subscription.catalogue.find((c) => c.slug === subscription.plan)?.price_inr === -1
                ? "Custom"
                : `₹${subscription.catalogue.find((c) => c.slug === subscription.plan)!.price_inr.toLocaleString("en-IN")}`}
            </strong>
          </div>
          <div>
            <span className="billing-info-label">Payment method</span>
            <strong className="billing-info-val">Not configured</strong>
          </div>
        </div>
      </div>

      {/* Invoice history */}
      <div className="sub-billing-section">
        <div className="sub-billing-section-header">
          <p className="kicker">Invoice history</p>
          <span className="mode-badge" style={{ fontSize: 11 }}>Demo data</span>
        </div>
        <div className="billing-history-table">
          <div className="billing-history-head">
            <span>Invoice</span>
            <span>Date</span>
            <span>Plan</span>
            <span>Amount</span>
            <span>Status</span>
          </div>
          {BILLING_HISTORY.map((inv) => (
            <div key={inv.id} className="billing-history-row">
              <span className="billing-inv-id">{inv.id}</span>
              <span>{inv.date}</span>
              <span>{inv.plan}</span>
              <span>{inv.amount}</span>
              <span className="billing-status-paid">✓ Paid</span>
            </div>
          ))}
        </div>
      </div>

      {/* Danger zone */}
      {isOwner && (
        <div className="sub-cancel-section">
          <div className="sub-cancel-header">
            <p className="kicker" style={{ color: "var(--warning)" }}>Danger zone</p>
            <h3 className="sub-cancel-title">Cancel subscription</h3>
            <p className="sub-cancel-copy">
              Cancelling will keep your access active until{" "}
              <span>{periodEnd}</span>. After that, the workspace will revert to read-only mode. This action cannot be undone without contacting support.
            </p>
          </div>
          {subscription.cancel_requested ? (
            <div className="sub-cancel-pending">
              <span>⚠</span> Cancellation already requested. Contact{" "}
              <a href="mailto:support@signalpath.ai">support@signalpath.ai</a> to reverse.
            </div>
          ) : (
            <button
              type="button"
              id="cancel-subscription-btn"
              className="sub-cancel-btn"
              onClick={onCancelClick}
            >
              Cancel subscription
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main shell
// ---------------------------------------------------------------------------

const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "pricing", label: "Plans & Pricing" },
  { id: "usage", label: "Usage" },
  { id: "billing", label: "Billing" },
];

export function SubscriptionClientShell({ me, subscription, usage }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; plan: string }>({
    open: false,
    plan: "Pro",
  });
  const [cancelModal, setCancelModal] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelDone, setCancelDone] = useState(false);

  const isOwner = me.role === "owner";

  const planDisplayName =
    subscription.catalogue.find((c) => c.slug === subscription.plan)?.display_name ??
    subscription.plan;

  function handleUpgradeClick(plan: string) {
    setUpgradeModal({ open: true, plan });
  }

  async function handleCancelConfirm() {
    setCancelLoading(true);
    try {
      await fetch("/api/v1/subscription/cancel", { method: "POST" });
      setCancelDone(true);
    } catch {
      // swallow — stub endpoint
    } finally {
      setCancelLoading(false);
      setCancelModal(false);
    }
  }

  return (
    <>
      {/* Page header */}
      <header className="page-header">
        <div>
          <div className="eyebrow">Workspace billing</div>
          <h1 className="page-title">Subscription</h1>
        </div>
        <span className="mode-badge sub-plan-badge-header">{planDisplayName} plan</span>
      </header>

      {/* Tab bar */}
      <div className="sub-tabs" role="tablist" aria-label="Subscription sections">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            id={`sub-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={`sub-panel-${id}`}
            className={`sub-tab-btn${activeTab === id ? " active" : ""}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div
        id={`sub-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`sub-tab-${activeTab}`}
        className="sub-tab-panel"
      >
        {activeTab === "overview" && (
          <OverviewTab
            subscription={cancelDone ? { ...subscription, cancel_requested: true } : subscription}
            usage={usage}
            isOwner={isOwner}
            onUpgradeClick={handleUpgradeClick}
          />
        )}
        {activeTab === "pricing" && (
          <PricingTab
            subscription={subscription}
            isOwner={isOwner}
            onUpgradeClick={handleUpgradeClick}
          />
        )}
        {activeTab === "usage" && (
          <UsageTab usage={usage} subscription={subscription} />
        )}
        {activeTab === "billing" && (
          <BillingTab
            subscription={cancelDone ? { ...subscription, cancel_requested: true } : subscription}
            isOwner={isOwner}
            onCancelClick={() => setCancelModal(true)}
          />
        )}
      </div>

      {/* Modals */}
      <UpgradeModal
        open={upgradeModal.open}
        targetPlan={upgradeModal.plan}
        onClose={() => setUpgradeModal({ open: false, plan: "Pro" })}
      />
      <CancelModal
        open={cancelModal}
        onClose={() => setCancelModal(false)}
        onConfirm={handleCancelConfirm}
        loading={cancelLoading}
      />
    </>
  );
}
