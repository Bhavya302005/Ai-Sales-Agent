# C01 call eligibility and lifecycle

The server makes the call decision; the voice/dialogue layer cannot authorize itself.

Every browser-call request checks:

- the lead references the active approved product version;
- an operator approved the lead in an active campaign;
- the selected contact belongs to the lead company, is a verified demo participant and has active
  browser-voice consent for the hackathon qualification purpose;
- no active channel suppression exists;
- local campaign time is within the configured call window;
- the campaign/global daily budget can cover the reservation;
- a concurrency slot remains available;
- the global kill switch is off.

Every check and its human-readable reason are stored on the call. Eligible calls reserve estimated
cost before any provider connection, receive a stable attempt ID and a configured maximum duration.
Blocked calls remain visible. Repeated requests with the same idempotency key return the same call;
the same key cannot be reused for a different request.

The lifecycle is database-constrained to `requested`, `eligible`, `connecting`, `active`, `ending`,
`completed`, `failed`, or `blocked`. A stop endpoint moves a live/eligible call to `ending`. The
Campaigns UI supports operator approval, eligibility evaluation and displays failed reasons.

