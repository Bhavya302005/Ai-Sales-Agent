# O01/H01 — Transcript qualification and human handoff

Call completion now atomically produces the post-call artifacts. Only finalized, tenant-scoped
transcript segments are considered. The deterministic verifier maps answers to the approved
qualification question that immediately precedes them and stores the exact participant segment IDs
as evidence. Missing or unasked values remain `null` and appear as `Unknown` in the UI.

The stored qualification includes need, scope, timeline, authority-known, budget-known, objections,
interest, requested next step and evidence segment IDs. Pricing/commitment objections retain the
participant's exact text and segment ID.

When the bounded conversation ends with `handoff_requested`, finalization creates one tenant-scoped
handoff task linked to the call and lead. The task has a campaign owner, deterministic priority,
reason, due time and open state. A database uniqueness constraint prevents duplicate handoffs for
the same call. High-priority pricing/commitment or positive-interest cases are due within four hours;
normal confirmed follow-ups are due within one day.

`GET /api/v1/calls/{call_id}/detail` returns the finalized transcript, qualification and handoff.
The call screen highlights cited transcript rows and labels the CRM reference as not synced until the
next task completes.
