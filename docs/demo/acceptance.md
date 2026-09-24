# Demo acceptance checklist

1. Sign in and enter the single organization workspace.
2. Inspect one approved offering, ICP, and versioned knowledge set.
3. Ingest a permitted URL or bundled labeled fixture.
4. Show original URL/origin, publication date when known, evidence excerpt, and field provenance.
5. Keep unknown budget, authority, phone, and urgency unknown.
6. Show deterministic score contributions and uncertainty.
7. Require operator approval and a passing eligibility decision before a call.
8. Complete a consenting English/Hindi browser voice conversation.
9. Interrupt the agent and stop current playback.
10. Ground product answers; route unsupported pricing or commitments to a human.
11. Produce transcript segments, qualification, outcome, and next action.
12. Create one human task and one idempotent HubSpot test or labeled mock update.
13. Expose pending, succeeded, retrying, and action-required integration states.
14. Show funnel counts and measured usage.
15. Pass the 3–5 minute demo three consecutive times after a clean reset.

Provider-dependent items may be marked `conditional` until credentials are supplied, but must use an honest fallback rather than be reported as live.

## 2026-09-19 release evidence

- Backend unit/integration suite: passed.
- Web type check, lint, component tests and production build: passed.
- Secret scan: passed.
- PostgreSQL migration `6c2a4d91e7f0`: applied locally.
- Guarded demo reset: verified against an isolated SQLite demo database.
- Chromium critical journey: three consecutive clean runs, two tests per run.
- Browser conversation: detailed qualification, transcript, handoff and idempotent mock CRM passed.
- Twilio: code-complete/provider-ready; live call remains conditional on credits, trial access and public HTTPS.
- Exa: optional live adapter; last provider probe was unavailable, so verified snapshot is the release path.
- HubSpot: optional; mock CRM is the honestly labelled verified path.

## 2026-09-20 demo-ready extension evidence

- Backend suite: 155 tests passed, including OmniDimension dispatch/result parsing, HubSpot failure
  handling, tenant-scoped notifications/admin, recurrence, suppression-safe retries, callbacks, rate
  limits, request IDs, and headers.
- Ruff and mypy: passed. Web type check, ESLint, 9 component tests, and 14-route production build:
  passed. Secret scan: passed across 433 bounded project files.
- PostgreSQL migration `b17d4a8c2e91`: upgrade, downgrade, and restored upgrade all passed.
- Notifications, owner administration, persistent call pause, callback operations, campaign
  occurrences, and manual retry readiness are implemented. No scheduler dispatches a call.
- HubSpot contact import uses the `2026-03` contacts API and is covered by pagination, malformed
  response, 401, 429, 5xx, masking, and import tests. Live validation is conditional because no local
  HubSpot token is configured.
- OmniDimension manual outbound dispatch and bounded result refresh are code-verified. Live calling is
  conditional because no local API key or agent ID is configured. Browser voice remains the guaranteed
  fallback.
- Chromium acceptance: 3 tests passed for browser qualification/CRM/callback/notifications, owner
  pause/resume and due processing, and protected-route sign-out.
