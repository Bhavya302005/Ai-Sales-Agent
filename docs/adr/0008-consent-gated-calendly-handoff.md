# ADR 0008: Consent-gated Calendly handoff and one booking reminder

- Status: Accepted
- Date: 2026-09-25

## Context

The organizer added a requirement for the voice agent to offer a Calendly link by SMS and to call
once more when the lead does not book. ADR 0001 intentionally limited the MVP to proposed booking
and operator-confirmed follow-up. The new requirement changes only that boundary; it does not
authorize general messaging, mass dialing, repeated reminders, or inferred consent.

Twilio messaging credentials are not available for the demo. Calendly owns availability and
preferred time slots, while OmniDimension remains the selected voice transport.

## Decision

- The agent must obtain separate, explicit consent for one SMS and for one re-call within 48 hours.
- A protected provider tool derives the tenant, contact, and sealed phone reference from the mapped
  active call. It never accepts a tenant or destination number from the provider.
- One single-use Calendly link is correlated by an opaque UTM token. Signed Calendly webhooks are
  authoritative for booked and canceled states; full webhook payloads and invitee details are not
  retained.
- The existing outbox and call-request eligibility path are reused. An unbooked follow-up can create
  at most one retry, after every existing suppression, consent, campaign, product, attempt, window,
  budget, concurrency, provider, and kill-switch check passes.
- Production waits 24 hours plus a five-minute webhook grace period. The two-minute path is enabled
  only by `BOOKING_DEMO_MODE=true` and only for the configured consenting demo contact.
- `SMS_MODE=mock` prepares a real link but labels delivery as simulated everywhere. Live Twilio SMS
  and signed STOP handling can be activated by configuration without changing this workflow.

## Consequences

The organizer's narrow add-on supersedes the proposed-booking boundary in ADR 0001. It does not
weaken the rest of that ADR: no unrestricted autonomous outreach is permitted, and delivery or
booking success is never claimed without provider evidence.
