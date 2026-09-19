# T02 Playwright critical path

## Scope

The Chromium suite starts an isolated Next.js app, API service, voice service, and synthetic SQLite
database on dedicated test ports. It does not reuse or modify the developer's normal local servers or
database.

The primary test verifies this complete journey:

1. A protected route redirects to the real development login.
2. Login creates the HTTP-only session and opens the opportunity list.
3. The judge-facing lead page displays permitted source evidence, explicit unknowns, score context,
   and approved knowledge.
4. An operator approves the consenting test lead and runs server-side call eligibility.
5. The browser opens the authenticated voice WebSocket and completes the bounded qualification
   dialogue.
6. The completed page displays the final transcript, evidence-derived qualification, and owned human
   handoff.
7. The handoff synchronizes once to the explicitly labeled deterministic mock CRM and displays its
   external reference.

A second test verifies sign-out and protected-route redirection.

## Test boundary

Headless Chromium does not expose a real microphone, Web Speech recognition, or operating-system
speech synthesis. The suite therefore installs deterministic browser-device fakes for those APIs.
The Next.js server, HTTP API, voice WebSocket, conversation policy, tools, database persistence,
outcome derivation, handoff, and CRM adapter all run normally; HTTP and WebSocket responses are not
mocked.

## Operation

From the repository root:

```bash
pnpm --filter @sales-agent/web exec playwright install chromium
pnpm --filter @sales-agent/web test:e2e
```

Playwright uses ports `3100`, `8100`, and `8101`, plus
`/tmp/ai-sales-agent-playwright.db`. Failure traces, screenshots, and videos are retained. CI runs the
suite after API and web gates and uploads the HTML report only on failure.

## Verification

- Chromium: 2 passed.
- Full happy path completed in approximately five seconds locally.
- Existing local development ports and data were untouched.
