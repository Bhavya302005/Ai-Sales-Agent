# Demo recording and submission package

## 3–5 minute script

1. **Business understanding (30 seconds):** show the approved Microsoft 365/SharePoint offering,
   ICP, knowledge version, and explicit prohibited claims.
2. **Discovery and evidence (45 seconds):** import the verified snapshot, distinguish direct
   requirements from hiring signals, open one lead, and show source URL, excerpt, provenance,
   unknowns, and score contributions.
3. **Campaign safety (35 seconds):** show workflow modes, approval, timezone, recurrence, retry delay,
   consent, suppression, budget, concurrency, and the owner pause control.
4. **AI qualification (75 seconds):** use the guaranteed browser call or verified OmniDimension path.
   Confirm AI disclosure and consent; answer scope, timeline, authority, budget, and explicitly request
   human follow-up.
5. **Outcome and follow-up (45 seconds):** show transcript evidence, qualification unknowns,
   interested disposition, callback scheduling, handoff, and verified mock or live HubSpot sync.
6. **Operations (30 seconds):** show notification-to-action navigation, audit history, provider
   readiness, analytics, and persistent call pause.
7. **Close (15 seconds):** state honest limitations and emphasize that no call bypasses human approval
   or consent.

## Recording checklist

- Reset only the local synthetic demo tenant and sign in as the demo owner.
- Close unrelated tabs, notifications, terminals, and files containing credentials or personal data.
- Use a synthetic company/contact and a participant who explicitly consented to the test.
- Keep recording disabled at the telephony provider unless separate recording consent exists.
- Confirm provider readiness and balance; keep browser voice ready as fallback.
- Run the journey once without recording, then record one clean 3–5 minute take.
- Review every frame and audio segment for numbers, tokens, personal notifications, and unrelated
  desktop content before sharing.
- Store the recording under ignored `artifacts/`; run `scripts/check_secrets.py` before packaging.

## Limitation statement

This is a polished hackathon MVP, not multi-region production certification. Native Android/iOS,
subscriptions/payments, inbound PSTN, automated voicemail, broad authenticated social scraping, fraud
modeling, and enterprise-scale infrastructure are roadmap items. English and Hindi are the supported
demo languages. Live OmniDimension and HubSpot claims are shown only after their exact sandbox round
trips succeed; otherwise the UI displays configuration-required or unverified labels. Calls remain
operator-approved, consent-gated, suppression-aware, time-windowed, budgeted, and manually dispatched.

## Submission contents

- 3–5 minute reviewed video.
- Repository commit hash and setup README.
- This limitation statement.
- Test evidence from `docs/demo/acceptance.md`.
- No `.env`, tokens, full phone numbers, raw provider responses, recordings, or temporary exports.

Submitting the external form is a deliberate user action; the application does not submit it
automatically.
