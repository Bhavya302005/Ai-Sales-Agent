# ADR 0001: MVP scope and implementation boundaries

Status: accepted

## Decision

Build the single vertical slice defined by the four-day plan. Development starts in deterministic fallback mode:

- discovery: bundled, clearly labeled permitted fixture;
- voice: browser transport, with text simulation until provider credentials are verified;
- CRM: labeled mock implementing the same contract as HubSpot;
- async execution: inline handler behind an interface, while still writing a transactional outbox;
- authentication: signed development JWT adapter, with membership authorization owned by the application.

Live provider modes are enabled only after credentials, terms, and a verified round trip are available. Exotel is outside the required release path.

## Included

Approved product knowledge, evidence ingestion, provenance, conservative resolution, deterministic scoring, approval and eligibility, consenting English/Hindi browser qualification, interruption/stop, transcript-backed qualification, handoff, idempotent CRM synchronization, and compact funnel/usage analytics.

## Excluded

Mass calling, unrestricted scraping, autonomous persuasion after positive interest, email sending, native mobile, billing, predictive forecasting, multi-agent orchestration, Kubernetes, all-language support, and production PSTN.

## Runtime baseline

Containers pin Node.js 22 LTS and Python 3.12. Local Node 26/Python 3.14 are not the reproducibility baseline. Framework and direct dependency versions are locked after installation and tested before upgrades.

## Release truthfulness

A fixture, mock, replay, or text simulation is always labeled in the UI. Deployment, provider, and latency claims require observed evidence. Local completion and provider-dependent staging readiness are separate gates.

