# V02 — Eligible-call browser voice

The browser voice route is now bound to a stored, tenant-scoped call attempt rather than the
standalone feasibility lab.

- `GET /calls/{id}` opens only an eligible attempt created by the deterministic call policy.
- `WS /api/v1/voice/calls/{id}` authenticates the signed session before accepting the socket.
- Starting the socket performs the constrained `eligible → connecting → active` transition.
- Only finalized participant and agent transcript segments are stored; audio is not recorded.
- Segment sequence numbers make final transcript writes idempotent and conflict-detecting.
- Browser speech recognition and synthesis provide the honest no-provider-credit fallback.
- Playback is cancelled when participant speech begins, and the UI exposes listening, thinking,
  speaking and interrupted states plus response latency.
- Server-side duration, turn, silence, stop and kill-switch checks bound every session.

The standalone `/voice-lab` remains a feasibility diagnostic. It is not an authorized sales call.
PSTN/Exotel remains intentionally outside this task and cannot be presented as implemented.
