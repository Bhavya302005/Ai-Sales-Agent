# ADR 0007: Production-MVP customer flow

- Status: Accepted
- Date: 2026-09-20

## Context

The verified implementation exposed diagnostic and hackathon-only controls in the primary product navigation. These controls were useful during development but made the customer journey look like a test harness.

## Decision

- The primary journey is `Business profile → Discover → Leads → Campaigns → Call → Analytics → Follow-up`.
- Voice diagnostics, saved-snapshot loading, and inline scheduler processing require `ENABLE_DIAGNOSTIC_UI=true`; they are hidden by default and the diagnostic route returns not found in the normal product configuration.
- Live discovery actions appear only when a live provider is configured.
- Campaigns expose the selected outbound provider and customer-safe actions: approve for outreach, prepare call, start call, and track call.
- Mock CRM implementation details and synthetic fixture identifiers are not presented as customer features. Sample data remains explicitly labelled as sample data.
- Usage remains measured and visible. A subscription or payment UI is not shown until a real billing provider and lifecycle exist.

## Consequences

The default localhost and production interface represent the intended MVP instead of its development harness. Automated tests can still enable diagnostic controls explicitly without weakening consent, suppression, approval, budget, or kill-switch enforcement.
