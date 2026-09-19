# M01 — Reconciled funnel and usage

The analytics page reads stored tenant-scoped records; it does not synthesize conversions.

- Funnel: discovered leads → reviewed leads → approved campaign leads → leads with started calls →
  qualifications with transcript evidence → leads with human handoffs.
- Usage: discovery/enrichment units, browser STT seconds, browser TTS characters and completed call
  seconds. LLM tokens remain visibly zero while deterministic adapters are active.
- Cost: reserved browser-call cost is labelled estimated. Actual cost remains unavailable until a
  provider supplies it.
- Reliability: measured speech-end-to-playback latency and CRM retry/action-required counts.

Provider event IDs make usage writes idempotent. Re-finalizing a call cannot double count its usage.
