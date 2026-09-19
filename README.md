# Evidence-first AI Sales Agent

This repository implements the bounded MVP in
[`CODEX_4_DAY_AI_SALES_AGENT_MVP_PLAN.md`](./CODEX_4_DAY_AI_SALES_AGENT_MVP_PLAN.md): permitted evidence becomes an explainable opportunity, a consent-gated qualification, and a human-owned follow-up.

## Current status

The judge-ready web MVP now supports two explicit workflows: **Leads + Calling** through a canonical
verified discovery snapshot (with optional labelled Exa MCP refresh), and **Calling Only** through
bounded CSV/XLSX import. Direct requirements can become reviewed leads; hiring records remain visible
market signals and can never become automatically call-eligible. Eligible browser calls produce transcript-backed
qualification, a human handoff, idempotent mock CRM synchronization and reconciled analytics. Live
Sarvam remains blocked by zero credits. A Twilio ConversationRelay outbound test-call path is
implemented but remains disabled until credentials, one consenting test number, and a public HTTPS
voice URL are configured. The HubSpot adapter is implemented but must remain labelled
unverified until a test-account write and read-back succeeds with user-provided credentials.

See:

- [`docs/implementation/PLAN_REVIEW.md`](./docs/implementation/PLAN_REVIEW.md) for required plan amendments.
- [`docs/implementation/TASK_BOARD.md`](./docs/implementation/TASK_BOARD.md) for the single active task.
- [`docs/demo/acceptance.md`](./docs/demo/acceptance.md) for release acceptance.
- [`docs/demo/ONE_DAY_RELEASE_RUNBOOK.md`](./docs/demo/ONE_DAY_RELEASE_RUNBOOK.md) for reset, demo,
  limitations, and release commands.
- [`docs/implementation/AGENT_HANDOFF.md`](./docs/implementation/AGENT_HANDOFF.md) for the exact
  continuation state if another agent needs to resume the project.

## Runtime baseline

- Node.js 22 LTS
- pnpm 12.4.2
- Python 3.12
- PostgreSQL 17
- RabbitMQ 4

The host currently has Docker CLI but not the Docker Compose plugin. Install a current Compose plugin before using the stack command.

## Local setup

```bash
cp .env.example .env
docker compose up --build
```

Web: `http://localhost:3000`  
API docs: `http://localhost:8000/docs`
Voice lab: `http://localhost:3000/voice-lab`

Without Compose, component checks can run directly:

```bash
uv venv .venv --python 3.12
UV_CACHE_DIR=/tmp/ai-sales-agent-uv-cache uv pip install --python .venv/bin/python -e 'apps/api[dev]'
.venv/bin/ruff check apps/api
.venv/bin/mypy apps/api/app
.venv/bin/pytest apps/api/tests

pnpm install --frozen-lockfile
pnpm --filter @sales-agent/web lint
pnpm --filter @sales-agent/web typecheck
pnpm --filter @sales-agent/web test
pnpm --filter @sales-agent/web build
```

For native development, PostgreSQL is required but RabbitMQ is optional while
`ASYNC_MODE=inline`. After creating `.env` and starting PostgreSQL:

```bash
make native-install
make native-migrate
make native-seed
```

For a clean rehearsal, run `make native-reset-demo`. It is restricted to a local development/test
database and resets only the fixed synthetic demo tenant.

Run `make native-api`, `make native-voice`, and `make native-web` in three terminals.
Keep those terminals and PostgreSQL running while developing or using the app. Source reload is enabled;
restart a service only after changing dependencies or its startup environment.

For natural browser and PSTN dialogue interpretation, set `GEMINI_API_KEY`, set
`DIALOGUE_MODE=gemini`, and restart the voice service. The server uses the configured
`GEMINI_DIALOGUE_MODEL` (Gemini 3.5 Flash-Lite by default) for indirect yes/no interpretation,
bounded FAQ classification, and short acknowledgements. `DIALOGUE_MODE=anthropic` remains available
with `ANTHROPIC_API_KEY`. Consent, suppression, tool authorization, handoff, turn limits, and approved
product facts remain enforced by the deterministic state machine. Provider errors fall back to
deterministic processing and the browser labels the active mode honestly.

For seamless Gemini resilience, optionally set `GEMINI_FALLBACK_API_KEY` to a key from a legitimate
separate Google project. Each request carries the same bounded server-owned state and up to eight prior
participant answers to the secondary key. If both keys fail, deterministic processing continues.

For the voice spike, set `SARVAM_API_KEY`, leave `RECORD_AUDIO=false`, sign in, then open `/voice-lab`.
Allow microphone access and test English and Hindi separately. Raw audio is relayed in memory and is not
stored. A Sarvam account with available credits is required.

### Real Twilio test call

The real-call path uses Twilio for PSTN, speech-to-text, and text-to-speech, while the existing bounded
conversation state machine remains the agent brain. It is intentionally limited to one environment
configured, consenting test number.

1. In Twilio Voice settings, accept the Predictive and Generative AI/ML Features Addendum required by
   ConversationRelay.
2. Expose the voice service on port `8001` through a trusted HTTPS tunnel and set its public origin as
   `PUBLIC_VOICE_BASE_URL` (no path). Twilio will connect to the derived `wss://` endpoint.
3. Add `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, and
   `TWILIO_TEST_TO_NUMBER` to `.env`. Use E.164 numbers and a number you control; never commit them.
4. Set `VOICE_TRANSPORT=twilio`, `ENABLE_OUTBOUND_PSTN=true`, and keep `RECORD_AUDIO=false`.
5. Restart the API and voice services, approve the test lead, attest PSTN consent in `/campaigns`,
   prepare the real call, then click **Place real test call**.

Twilio HTTP callbacks and the ConversationRelay WebSocket handshake are signature-validated. Failed,
busy, and unanswered calls release the local spend reservation. Trial-account restrictions, verified
destinations, ConversationRelay access, and Twilio credits still apply.

Manual URL ingestion is disabled by default. Enable it only after source permission is confirmed:

```bash
DISCOVERY_MODE=live
SOURCE_ALLOWED_HOSTS=permitted.example
```

Every URL and redirect must remain HTTPS, match the exact allowlist, and resolve only to public IPs.

CRM defaults to `CRM_MODE=mock`, which creates deterministic local references without claiming an
external write. To run the optional HubSpot task adapter, set `CRM_MODE=hubspot` and a scoped
`HUBSPOT_ACCESS_TOKEN`; the adapter is pinned to the documented `2026-03` API version and verifies the
created task by reading it back.

## Safety boundary

Defaults use a labeled discovery fixture, browser transport, mock CRM, inline jobs, no audio recording,
and no outbound PSTN. Live modes fail closed when credentials are missing. PSTN additionally requires a
separate, 24-hour operator attestation and is constrained to the single test number stored outside source
control. Only consenting test participants may be used during development and demonstration.
