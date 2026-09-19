# Agent continuation handoff

Updated: 2026-09-19, Asia/Kolkata

## Read first

1. Treat `CODEX_4_DAY_AI_SALES_AGENT_MVP_PLAN.md` as the product contract.
2. Read `AGENTS.md` and any nearer `AGENTS.md` before editing.
3. Keep exactly one row `IN_PROGRESS` in `docs/implementation/TASK_BOARD.md`.
4. Never weaken tenant isolation, provenance, explicit unknowns, consent, suppression,
   idempotency, or honest fallback labels.
5. Never print or commit credentials, browser cookies, or complete phone numbers.
6. Use `apply_patch` for source edits and preserve unrelated user work.

## Judge-ready target

`Business → Discovery → Review → Campaign → Call → Insights → Follow-up`

- **Leads + Calling:** verified discovery snapshot, optional labelled Exa refresh, review, campaign,
  browser/Twilio qualification, transcript, insights, handoff.
- **Calling Only:** bounded CSV/XLSX upload, validation, operator approval, then the same safe call path.
- Guaranteed demo path: saved snapshot + browser Gemini/deterministic fallback + mock CRM.
- Conditional path: live Exa, Twilio PSTN, HubSpot.

## Completed in the current one-day pass

- Removed hardcoded X cookies from the experimental scraper; credentials now come from environment.
- Expanded secret scanning for X auth/CSRF cookies and ignored mutable scraper exports.
- Added canonical discovery metadata to `SourceDocument` and campaign scheduling controls.
- Added eight-record curated discovery snapshot: four direct requirements and four hiring signals.
- Added deterministic approved-knowledge query generation and optional bounded `mcporter` Exa adapter.
- Added discovery APIs:
  - `POST /api/v1/discovery/import-demo`
  - `POST /api/v1/discovery/refresh`
  - `GET /api/v1/discovery/results`
- Discovery runs through tenant deduplication and the existing extraction/scoring outbox.
- Hiring signals remain non-actionable and produce no leads.
- Added CSV/XLSX lead import (5 MB, 100 rows, E.164, consent basis, deduplication, no full phone output).
- Added filtered discovery CSV export at `GET /api/v1/leads/export.csv`.
- Added campaign create/update/results APIs, recurrence metadata, start-time gate, maximum-attempt gate,
  and visible dispositions.
- Added campaign-to-call linkage for correct attempt accounting.
- Added direct-vs-signal discovery UI, filters, snapshot/live badges, explicit workflow modes,
  campaign creation/upload UI, product journey, and expanded analytics.
- Added guarded local tenant-only `make native-reset-demo` and a release runbook.
- Migration `6c2a4d91e7f0` was applied successfully to local PostgreSQL.
- Dependency lock includes `openpyxl==3.1.5`.

## Verification already completed

- [x] Secret scan: passed, 322 files.
- [x] Backend suite: 130 tests passed.
- [x] New discovery/import tests: 3 passed.
- [x] Focused analytics/calling/Twilio/security tests: 13 passed.
- [x] Web TypeScript check: passed.
- [x] Web ESLint: passed after moving a ref update into an effect.
- [x] API Ruff scope: passed after formatting.
- [x] API mypy passed before the final query-builder change; rerun it now.
- [x] PostgreSQL migration upgraded from `8e7b0a31f2cd` to `6c2a4d91e7f0`.

## Resume here — exact remaining checklist

### 1. Finish static/build verification

- [x] Run `cd apps/api && ../../.venv/bin/mypy app`.
- [x] Run `cd apps/web && npm run typecheck && npm run lint && npm test && npm run build`.
- [x] Run `.venv/bin/ruff check apps/api database scripts packages/domain`.
- [x] Run `.venv/bin/python scripts/check_secrets.py`.
- [ ] Run `.venv/bin/pytest apps/api/tests -q` once more after any fixes.

### 2. Verify the local app and migration

- [ ] Confirm API, voice and web services are running on ports 8000, 8001 and 3000.
- [ ] Check `GET /health/ready` and open `http://localhost:3000`.
- [ ] Sign in through the development login.
- [ ] Import the verified snapshot from `/sources`; confirm 4 direct + 4 signal records.
- [ ] Confirm repeat import reports duplicates rather than adding records.
- [ ] Confirm disabled/unavailable Exa shows an honest fallback notice and retains snapshot data.

### 3. Browser/UI acceptance

- [ ] Review a direct opportunity and confirm URL, date, excerpt, rights and score provenance.
- [ ] Confirm a hiring signal has no outreach/approval path.
- [ ] Create a `calling_only` campaign and import `tests/fixtures/calling_only_sample.csv` after
  replacing the reserved sample number with the configured consenting test number.
- [ ] Confirm no complete number appears in UI, API response or logs.
- [ ] Approve the fixed demo lead and complete the Gemini browser conversation.
- [ ] Verify indirect consent, partial-answer clarification, silence recovery, client questions,
  recap, transcript, qualification, disposition, summary and handoff.
- [ ] Verify mock CRM sync is labelled mock and idempotent.
- [ ] Confirm analytics update by source/type, calls, interest, handoff, usage and estimated cost.

### 4. Automated browser rehearsal

- [x] Inspect the existing Playwright command/config before running.
- [x] Playwright prepares a fresh isolated synthetic database for every clean run.
- [x] Run the critical Playwright browser journey three times (all three passed).
- [ ] Fix only release-blocking defects after the first clean run.

### 5. Optional provider checks

- [ ] Exa: only enable with `EXA_DISCOVERY_MODE=mcp`; stop if unreliable and retain snapshot.
- [ ] Twilio: test exactly one verified consenting number and stop after 90 minutes if credits,
  trial restrictions, public HTTPS, or ConversationRelay access block the test.
- [ ] HubSpot: keep `CRM_MODE=mock` unless a real create/read-back succeeds.
- [ ] Never claim a provider is live unless that exact round trip was verified.

### 6. Final release state

- [ ] Update `docs/demo/acceptance.md` with actual pass/fail/conditional evidence.
- [x] Mark `P03 DONE` after three clean rehearsals.
- [x] Keep `R02` as the single `IN_PROGRESS` task for optional live providers and submission.
- [ ] Record the presentation only after three clean browser journeys.

## Known constraints and cautions

- The user pasted a Sarvam credential in chat earlier. Do not repeat it; advise revocation/rotation.
- The previously hardcoded X session must be revoked externally by logging out/resetting sessions.
- `mcporter` exists locally, but Exa was offline during the last probe; snapshot is the supported path.
- Sandbox networking may block localhost/PostgreSQL. If needed, rerun migrations/tests with explicit
  user approval rather than changing application security.
- The sample CSV uses a reserved example number and is intentionally not call-eligible until replaced
  with the environment-configured consenting test number.
- Native mobile, billing/subscriptions, inbound calls, voicemail, fraud detection, unrestricted
  scraping and enterprise automation are documented roadmap items, not completed MVP features.

## Important files

- Product contract: `CODEX_4_DAY_AI_SALES_AGENT_MVP_PLAN.md`
- Active board: `docs/implementation/TASK_BOARD.md`
- Release runbook: `docs/demo/ONE_DAY_RELEASE_RUNBOOK.md`
- Demo acceptance: `docs/demo/acceptance.md`
- Discovery API/service: `apps/api/app/discovery/api.py`, `apps/api/app/discovery/service.py`
- Lead import: `apps/api/app/lead_import.py`
- Call/campaign policy: `apps/api/app/calling/api.py`, `apps/api/app/calling/service.py`
- Curated snapshot: `tests/fixtures/discovery_snapshot.json`
- Migration: `database/migrations/versions/6c2a4d91e7f0_discovery_campaign_essentials.py`
- Reset: `scripts/reset_demo.py`

## Fast resume command sequence

```bash
cd /Users/AminBhavya/Ai_Sales_Agent
.venv/bin/ruff check apps/api database scripts packages/domain
cd apps/api && ../../.venv/bin/mypy app && cd ../..
.venv/bin/pytest apps/api/tests -q
cd apps/web && npm run typecheck && npm run lint && npm test && npm run build && cd ../..
.venv/bin/python scripts/check_secrets.py
make native-migrate
make native-reset-demo
```
