# One-day release and demo runbook

## Supported demo

The supported story is:

`Business → Discovery → Review → Campaign → Call → Insights → Follow-up`

- **Leads + Calling:** import the verified discovery snapshot, review a direct requirement, then
  use the consent-gated browser AI call.
- **Calling Only:** create a calling-only campaign and upload the sample CSV/XLSX schema shown below.
- **Discovery:** saved snapshot is guaranteed; Exa is optional and is always labelled live or failed.
- **CRM:** mock is the verified default. HubSpot is used only when configured and independently tested.
- **PSTN:** OmniDimension is configured and its agent endpoint is authenticated read-only; the live
  call/result round trip remains deferred. Browser voice is the guaranteed presentation path.
- **Mobile:** the same responsive web product is installable through its application manifest;
  native Android/iOS store binaries are not claimed.

## Clean local start

Keep PostgreSQL running, then run:

```bash
make native-migrate
make native-reset-demo
make native-api
make native-voice
make native-web
```

The reset command is guarded and deletes only the fixed synthetic demo tenant in a local
development/test database. It then restores the approved offering, curated discovery results,
campaign, and consented browser test contact.

## Calling-only file schema

Use UTF-8 CSV or XLSX, no more than 5 MB or 100 rows:

```text
company,requirement,source_url,contact_name,phone,location,timezone,consent_basis
```

Phone values must use E.164. Full numbers are never returned by the API or written to logs; the
database stores a one-way hash and a redacted reference. A PSTN call remains limited to the single
consenting number configured in `TWILIO_TEST_TO_NUMBER`.

## Live Exa (optional)

Leave `EXA_DISCOVERY_MODE=disabled` for the guaranteed path. To try the locally configured MCP:

```text
EXA_DISCOVERY_MODE=mcp
EXA_DISCOVERY_TIMEOUT_SECONDS=25
```

Restart the API after changing configuration. If live discovery fails, the UI keeps the snapshot
and displays an explicit failure notice.

## Release checks

```bash
.venv/bin/ruff check apps/api database scripts
cd apps/api && ../../.venv/bin/mypy app
.venv/bin/pytest apps/api/tests
cd apps/web && npm run typecheck && npm run lint && npm test && npm run build
.venv/bin/python scripts/check_secrets.py
```

Run the existing Playwright critical journey three times from a reset before recording.

## Honest cut lines

Roadmap/not demonstrated as complete: native Android/iOS binaries, payments/invoices, inbound calls,
voicemail automation, predictive fraud modelling, unrestricted authenticated scraping, all-language
coverage, and enterprise-scale scheduling. The demo shows stored usage and rule-based safety
signals. Usage is measured, but no subscription or payment UI is claimed.
English and Hindi are the supported demo languages.
