# Implementation plan review

## Verdict

The plan has the right product boundary and safety posture for a portfolio-grade MVP. Its critical path is coherent. Implementation should proceed after the amendments below; none changes the core product story.

## Required amendments

1. **Repository isolation:** this folder currently sits inside an unrelated parent Git worktree. Commands, CI, and release tags must be scoped to this directory; initialize a dedicated repository before making commits or tags.
2. **Runtime pins:** use Node.js 22 LTS and Python 3.12 in containers. The host currently has Node 26 and Python 3.14, and `pnpm` is not installed. Do not rely on host-global runtimes.
3. **Dependency locking:** pin direct versions and commit lockfiles. Next.js 16 no longer runs lint during `next build`, so CI must run ESLint explicitly.
4. **Schema ownership:** use `organization_id` for the tenant boundary consistently. `workspace_id` may scope product/campaign activity, but must not ambiguously double as `tenant_id`.
5. **Data lifecycle:** add retention, deletion/export, transcript minimization, and contact hashing rules. Consent alone is not a retention policy.
6. **Webhook security:** verify provider signatures against the raw body, enforce a replay window, and deduplicate provider event IDs before state transitions.
7. **SSRF hardening:** a host allowlist alone is insufficient. Validate each DNS result and redirect target against private, loopback, link-local, and reserved ranges.
8. **Idempotency contract:** define key scope as `(tenant, actor, route, key)`, persist request fingerprint and response, reject key reuse with a different payload, and specify expiry.
9. **State transitions:** encode allowed call, outbox, and CRM transitions in the domain layer and reject stale/out-of-order provider callbacks.
10. **Local versus external gates:** distinguish code-complete/local-demo gates from staging, live voice, and verified HubSpot gates. External credentials and deployment access cannot be assumed.
11. **Voice fallback:** a recorded demo is a presentation backup, not acceptance for live barge-in. Text-mode state-machine tests and browser playback cancellation remain required if STT/TTS is unavailable.
12. **Operational privacy:** add CSP/CORS/allowed-host settings, secret rotation notes, backup/restore verification, and a log-field allowlist.
13. **Host prerequisites:** the current machine has Docker CLI but no Compose plugin. Install Docker Compose before using the one-command local stack; direct component checks can still run independently.

## Schedule adjustment

Keep the four-day order, but make Day 1's deployment and live speech spike conditional on credentials and deployment access. Finish the local walking skeleton first. Integrate real providers only after their deterministic adapters and contract tests pass.
