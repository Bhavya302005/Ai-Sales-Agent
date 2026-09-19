# I01 — Idempotent CRM synchronization

`POST /api/v1/handoffs/{id}/sync-crm` queues `crm.sync_requested.v1` through the transactional job
path and requires an idempotency key. The handoff is row-locked, and the external mapping uniqueness
constraints ensure one logical external task per local handoff. Stored mappings are read back and
verified on repeated processing.

Mock mode is the default. It creates a deterministic `mock://` task reference and never claims an
external write. HubSpot mode is optional, requires a token at startup, and creates one structured task
through the pinned `/crm/objects/2026-03/tasks` endpoint before reading it back. Only the structured
qualification and handoff reason are sent; the unrestricted transcript remains inside the application.

Transient provider/network errors use bounded outbox retry. Invalid or revoked credentials and
provider validation failures become `action_required`. The call-detail UI displays `not_requested`,
`pending`, `retrying`, `succeeded`, or `action_required` plus the honest provider label and reference.

No live HubSpot write has been claimed without test-account credentials.
