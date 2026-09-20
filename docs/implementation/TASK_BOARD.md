# MVP task board

Status values: `TODO`, `IN_PROGRESS`, `DONE`, `BLOCKED`.

| ID | Status | Evidence |
|---|---|---|
| F01 | DONE | Scope ADR, safety ADR, acceptance checklist, and plan review |
| F02 | DONE | Pinned monorepo; API and web lint/type/test/build gates pass |
| F03 | BLOCKED | Services/config/probes exist; host lacks Compose plugin and running Docker daemon |
| F04 | DONE | Framework-independent strict models and versioned event fixtures; contract tests pass |
| D01 | DONE | 29-table PostgreSQL schema; clean downgrade/upgrade, idempotent seed, and drift check pass |
| S01 | DONE | Signed dev JWT plus active membership enforcement; cross-tenant workspace test passes |
| W01 | DONE | Protected Next.js shell, HTTP-only dev session, typed server client, navigation/build pass |
| W02 | DONE | Authenticated production HTTP render verified against PostgreSQL list/detail |
| V01 | BLOCKED | Protected STT/TTS browser spike and tests implemented; Sarvam live check returns 402 `insufficient_quota_error`; microphone/bilingual validation follows after credits are added |
| K01 | DONE | Immutable offering/ICP drafts, owner approval/activation, audit trail, callable gate, tenant/role tests, and protected onboarding UI |
| X01 | DONE | Fixture and gated manual-URL connectors; tenant deduplication, rights metadata, Trafilatura normalization, DNS/redirect SSRF checks, byte/time bounds, audit trail, API/UI, and tests |
| X02 | DONE | Strict schema, exact spans, explicit unknowns, bounded adapter contract, run metadata, idempotent API/UI action, and 12 adversarial/language fixtures; 22 focused tests pass |
| E01 | DONE | Conservative domain/name-location resolution, explicit ambiguity/unknowns, conflict status, tenant-scoped company API, and reversible audited owner merges; migration applied and tests pass |
| R01 | DONE | Exact score.v1 formula, approved product ICP fit, freshness/source mappings, stored feature evidence, golden/idempotency tests, and outreach separation |
| W03 | DONE | Lead detail shows source evidence, assertion status/confidence, explicit unknowns, score explanation, and every weighted contribution |
| K02 | DONE | Deterministic cited pre-call brief, approved FAQ/questions/handoff rules, prohibited-claim guardrails, PostgreSQL knowledge search, API/UI, and safety tests |
| Q01 | DONE | Transactional outbox/idempotency, extraction/scoring handlers, inline/Celery parity, bounded backoff, stale-job recovery, action-required visibility, status API, and UI polling |
| C01 | DONE | Server-side product/campaign/consent/suppression/window/budget/concurrency/kill-switch policy, spend reservation, stable attempt IDs, constrained lifecycle, stop API, duplicate tests, and campaign UI |
| V02 | DONE | Eligible-call authenticated browser voice, final-only idempotent transcripts, bounded duration/silence, stop polling, UI states, latency, and tested barge-in cancellation |
| A01 | DONE | External state machine plus bounded Gemini/Claude interpretation, same-context two-key Gemini failover, approved bilingual facts, deterministic state-authorized tools, explicit callback confirmation, immediate suppression, safe fallback, injection and loop-limit tests |
| O01 | DONE | Final-only transcript derivation, explicit unknowns, exact evidence segment IDs, idempotent qualification, tenant-scoped detail API, and evidence-highlighted call UI |
| H01 | DONE | One call-linked owned task, deterministic priority/reason/due time, database uniqueness, visible unsynced state, and idempotency tests |
| I01 | DONE | Generic provider protocol, deterministic mock, pinned HubSpot task create/read-back adapter, transactional idempotent jobs/mappings, bounded retry/action-required states, and call-detail sync UI |
| M01 | DONE | Stored-record funnel, idempotent discovery/STT/TTS/call usage, estimated-versus-actual cost labels, measured voice latency, CRM failure indicators, API/UI, and reconciliation tests |
| T01 | DONE | Cross-tenant, source, eligibility, conversation/voice, retry, redaction, secret and dependency gates pass; 107 backend tests |
| T02 | DONE | Real UI/API/voice/database/handoff/mock-CRM Chromium journey plus protected-route test; 2 passed |
| V03 | DONE | Twilio outbound PSTN vertical slice: separate consent, single env-only test number, idempotent dispatch, signed HTTP/WebSocket callbacks, ConversationRelay dialogue/transcripts, lifecycle UI, and mocked provider tests; live round trip awaits Twilio credentials/public URL |
| C02 | DONE | Canonical discovery, CSV/XLSX import, schedule/attempt gates, explicit modes, dispositions, and tests |
| P01 | DONE | Judge-facing journey, direct/signal separation, provider badges, filters, analytics, and actionable failure labels |
| P02 | DONE | Guarded tenant-only demo reset, setup/demo/limitations runbook, migration and release commands |
| P03 | DONE | Three consecutive clean Chromium rehearsals passed with detailed qualification, handoff, CRM sync, and auth checks |
| R02 | IN_PROGRESS | OmniDimension outbound AI-call integration selected; manual dispatch and result verification are being completed for one consenting test number |
| N01 | DONE | Notifications, owner controls, recurrence/retries, callbacks, HubSpot import, security hardening, UI, and PostgreSQL migration round-trip pass |
