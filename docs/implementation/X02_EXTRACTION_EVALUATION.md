# X02 extraction evaluation

Date: 2026-09-17

The default extractor is a deterministic, network-free baseline so the hackathon demo does not
depend on model credits. A strict provider-neutral adapter is also present for a future configured
model; it enforces an 8-second timeout contract, 700-token output budget, two schema attempts,
exact evidence validation, and delimited untrusted input.

| Fixture | Expected | Result |
|---|---|---|
| Explicit buyer intent | actionable buyer requirement | PASS |
| Weak signal | non-actionable weak signal | PASS |
| Seller pitch | non-actionable seller pitch | PASS |
| Job posting | non-actionable job posting | PASS |
| Closed requirement | expired | PASS |
| Missing date | actionable; deadline unknown | PASS |
| Hindi | actionable buyer requirement | PASS |
| Mixed Hindi/English | actionable buyer requirement | PASS |
| Prompt injection | instructions ignored; grounded result | PASS |
| Missing company | actionable; company unknown | PASS |
| Past explicit deadline | expired | PASS |
| General commentary | not actionable | PASS |

All populated fields passed exact character-span validation. Unsupported/extra schema fields and
repeated invalid provider responses were rejected. API persistence was verified idempotent: one
requirement, one model run, and evidence-backed field assertions after a repeated request.

