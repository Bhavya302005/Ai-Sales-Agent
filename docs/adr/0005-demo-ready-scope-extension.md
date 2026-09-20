# ADR 0005: bounded demo-ready scope extension

Status: accepted

## Context

The owner explicitly requested a final pre-submission slice after feature freeze: in-app
notifications, workspace administration, campaign scheduling and retry readiness, HubSpot sandbox
lead import, security hardening, and release artifacts. Live AI telephony remains deferred.

## Decision

Extend the existing modular monolith without adding a second identity, queue, CRM, or notification
provider. All new data is tenant-owned, mutations are role checked and audited, recurring work is
idempotent, and retries only become operator actions. Nothing auto-dials. HubSpot imports require an
operator-supplied requirement and consent attestation and never persist raw phone or email values.

The demo uses in-app notifications only. Administration manages existing memberships; it does not
claim invitations or production identity provisioning. Generated recordings and submission bundles
remain outside source control.

## Consequences

This improves coverage of the hackathon definition while preserving the consent, provenance,
suppression, idempotency, and honest-label invariants. Multi-region scale, native mobile, billing,
fraud modeling, and broad discovery remain explicitly outside this slice.
