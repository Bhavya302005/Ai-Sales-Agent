# ADR 0006: Time-boxed demo closeout

- Status: Superseded by ADR 0007
- Date: 2026-09-20

## Context

The submission window leaves five to seven hours. The core evidence-to-follow-up journey is complete, while the live OmniDimension call is intentionally deferred. Broad native mobile, payment processing, predictive fraud modelling, and production-scale infrastructure cannot be completed or honestly verified in this window.

## Decision

Finish only high-value, demo-visible gaps:

1. Make the responsive web product installable with a standards-based application manifest and mobile navigation/layout polish.
2. Present subscriptions, billing, and voice usage as an explicitly non-billable demo plan backed by stored usage events. Do not simulate checkout or invoices.
3. Present tenant-scoped, deterministic abuse and safety signals from calls, suppressions, runtime controls, and audit records. Label them rule-based rather than predictive fraud detection.
4. Publish a requirement coverage matrix and release checklist with conditional and roadmap items clearly identified.

No automatic dialing is introduced. Consent, suppression, approval, idempotency, budget, concurrency, and kill-switch controls remain mandatory.

## Consequences

The demo gains credible mobile, billing/usage, and security coverage without unverified production claims. Native app-store packages, live payments, predictive fraud models, multi-region infrastructure, and the live PSTN round trip remain explicit post-demo work.
