# Demo requirement coverage

Truthful status for the hackathon demo on 2026-09-20.

| Requirement | Demo status | Evidence / limitation |
|---|---|---|
| Understand business and offerings | Ready | Versioned knowledge intake, owner approval, ICP and FAQ controls |
| Discover requirements and leads | Ready for supported sources | Fixture and allow-listed public URL discovery with provenance; broad social-platform harvesting is not claimed |
| Upload leads | Ready | CSV/XLSX and gated HubSpot sandbox contact import |
| Enrich and qualify | Ready | Evidence-backed extraction, deterministic scoring, explicit unknowns |
| Calling only / leads + calling | Ready | Campaign modes, approval/consent gates, browser voice, provider dispatch integration |
| Real outbound AI call | Conditional | OmniDimension is configured and authenticated read-only; the consenting live-call round trip is deferred |
| Inbound voice | Roadmap | Not implemented in this submission |
| Multilingual conversation | Demo-safe | English/Hindi browser conversation path; provider voice depends on configured agent |
| Callbacks, voicemail, retries | Partial | Callbacks and bounded operator-approved retries are ready; provider voicemail detection is conditional |
| Transcripts, summaries, next action | Ready | Final-only transcript storage, qualification, handoff and CRM task |
| Campaign scheduling | Ready | Time-zone recurrence and idempotent due processing; dispatch remains manual |
| Analytics and voice usage | Ready | Stored-event funnel, provider quantities, estimated/actual cost labels |
| CRM integration | Ready / conditional | Mock task sync is verified; HubSpot contact preview/import and task sync require sandbox credentials |
| Notifications | Ready | Tenant/user-scoped in-app notification center |
| Authentication, roles, admin, audit | Ready | Signed session, owner/operator/viewer controls, final-owner protection, audit history |
| Voice usage | Ready | Stored provider quantities and clearly labelled estimated/actual costs |
| Subscriptions and billing | Roadmap | Not shown until a real payment provider, subscription lifecycle, and invoices exist |
| Fraud detection | Demo-safe | Deterministic safety/abuse signals and hard controls; no predictive fraud model |
| Web, Android and iOS | Demo-safe | Responsive installable web app; native app-store binaries are roadmap |
| Security and encryption | Partial | Secret types, headers, rate limits, tenant isolation and HTTPS expectations; managed-at-rest infrastructure is deployment-dependent |
| Scalable enterprise architecture | Demonstrated foundation | PostgreSQL, transactional outbox, Celery mode and idempotency; multi-region certification is roadmap |

## Demo claim rule

Say “ready” only for paths exercised from stored application state. Say “configured” for credentialed providers until their live round trip passes. Never present fixture, mock, estimated, or rule-based behavior as live, actual, or predictive.
