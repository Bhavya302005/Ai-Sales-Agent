# T01 security and conversation regression

## Result

The core browser-voice MVP has no known critical policy failure. The regression suite now covers
tenant isolation, input boundaries, eligibility gates, bounded conversation behavior, voice-session
finalization, retry/idempotency behavior, and safe provider error handling.

## Security and policy coverage

- A second-tenant route matrix verifies that lead, call, call detail, stop, job, handoff sync,
  source extraction, offering, campaign, source, and analytics access cannot disclose or mutate the
  first tenant's records.
- Source tests cover private-address SSRF, off-allowlist redirects, oversized bodies, unreadable or
  hostile HTML, and visible-text extraction.
- Calling tests cover suppression, missing campaign approval, expired consent, inactive product
  knowledge, exhausted budget, concurrency/lifecycle boundaries, and the global kill switch.
- Outbox and CRM tests cover request replay, logical external-object idempotency, bounded retry,
  worker restart, revoked credentials, and provider error redaction.
- `scripts/check_secrets.py` scans project text without printing suspected values. Local `.env` files
  remain ignored; `.env.example` contains placeholders only.
- CI runs secret scanning plus Python and production JavaScript dependency audits.

The browser transport and the current HubSpot create/read-back adapter have no inbound provider
webhook, so duplicate or reordered telephony callbacks are not applicable until optional PSTN is
implemented. That future adapter must add signed callback, replay, and reordering fixtures before it
can be enabled.

## Conversation and voice cases

Deterministic regressions cover English, Hindi, code-switching, interruption, silence, background
noise, wrong person, opt-out, unsupported pricing, positive interest, maximum duration, network
disconnect, prompt injection, turn limits, and tool limits. Opt-out remains executable even after the
ordinary tool budget is exhausted. Confirmed callback requests are explicitly marked `proposed` and
never represented as a calendar booking.

The browser records speech-end-to-first-audio latency and persists bounded samples for analytics.
Barge-in immediately cancels browser speech and is verified at the WebSocket protocol boundary.

The locked behavior identifiers are:

- conversation policy: `conversation-policy.v1`
- extraction prompt: `requirement-extraction.prompt.v1`
- extraction schema: `requirement-extraction.v1`
- deterministic extraction model: `bounded-rules.v1`
- score rule: `score.v1`

These are text/protocol regression cases, not stored audio recordings. This is deliberate: audio is
not recorded, and Sarvam live validation remains blocked by provider quota. The working browser
speech fallback is labeled honestly and requires no provider credits.

## Verification

- Focused security/conversation/voice/retry suite: 49 passed.
- Full API/domain suite: 109 passed.
- Ruff and strict mypy: passed.
- Web lint, typecheck, 3 component tests, and production build: passed.
- Repository secret scan: 181 project files checked, passed.
- Python dependency audit: no known vulnerabilities after upgrading pytest to 9.0.3.
- Full JavaScript dependency audit: no known vulnerabilities after upgrading browserslist to
  4.28.7, Vitest to 4.1.11, Vite to 7.3.5, and the esbuild override to 0.28.1.

The reproducible CI runtime remains Python 3.12 and Node.js 22. The local web verification ran on the
available Node.js 26 host; CI is the Node.js 22 compatibility gate.
