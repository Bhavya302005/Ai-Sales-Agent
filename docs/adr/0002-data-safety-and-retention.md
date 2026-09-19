# ADR 0002: Data safety, retention, and external boundaries

Status: accepted

## Decision

- Raw source snapshots are retained only when source rights permit it; otherwise store metadata, content hash, and the minimum evidence excerpt.
- Audio recording is disabled by default. Final transcript segments are stored only after disclosure and active consent/test-purpose verification.
- Demo transcripts and contact identifiers have configurable retention, defaulting to 30 days. Audit, usage, consent, suppression, and side-effect history retain the minimum fields required for proof and reconciliation.
- Contact lookup uses normalized values for operation and keyed hashes for suppression matching. Logs mask contact identifiers and never contain tokens or full transcripts.
- Export and deletion jobs must preserve legally/operationally required audit facts while removing optional personal content.
- Webhooks require provider signature verification, replay-window validation, event deduplication, and raw-body verification before parsing.
- Manual URL imports resolve DNS before every request and redirect, reject private/link-local/loopback/reserved addresses, cap redirects, bytes, and time, and do not forward credentials.

## Rationale

The original plan specified redaction and consent but did not define retention/deletion, webhook authenticity, or DNS-rebinding controls precisely enough for implementation and release testing.

