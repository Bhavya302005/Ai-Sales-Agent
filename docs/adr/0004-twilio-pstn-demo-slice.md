# ADR 0004: Twilio PSTN demo slice

Status: accepted after PRD review

## Context

The original four-day plan made browser voice mandatory and production PSTN optional. The supplied PRD
instead requires an AI agent to make real inbound or outbound calls. The user selected outbound Twilio
calling as the next implementation milestone. Browser voice remains useful for deterministic rehearsal,
but it is not presented as fulfillment of the PRD's phone-call requirement.

## Decision

Implement one outbound, consent-gated Twilio test-call path with ConversationRelay. Twilio supplies the
PSTN connection, speech recognition, and speech synthesis. The application retains the approved product
knowledge, deterministic conversation policy, transcript, qualification, opt-out, and handoff logic.

The slice is deliberately narrow:

- one test destination is read from an environment variable and never returned by the API;
- an operator must separately attest PSTN consent, which expires after 24 hours;
- campaign approval, suppression, window, budget, concurrency, and kill-switch checks still apply;
- HTTP webhooks and the WebSocket handshake require Twilio signatures;
- audio recording remains disabled;
- provider dispatch and callback processing are idempotent;
- browser voice stays available as an honestly labeled fallback and test harness.

Inbound calls, bulk dialing, voicemail detection, call transfers, arbitrary lead phone numbers, and
production telephony operations remain outside this slice.
