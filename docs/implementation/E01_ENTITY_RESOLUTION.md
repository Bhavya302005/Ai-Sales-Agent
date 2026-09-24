# E01 entity resolution

The resolver is deliberately conservative:

- An exact normalized domain resolves to the existing canonical company.
- Without a domain, both normalized company name and geography must match.
- A same-name company in another location is created separately and labeled ambiguous.
- Missing company evidence produces an explicit `unknown` assertion; it is not guessed.
- Independent matching assertions become `corroborated`; differing values are retained and become
  `conflicted`. Manual verification and expiry remain distinct statuses.
- Company merges are owner-only, tenant-scoped and audited. The audit record retains the exact lead
  IDs moved, allowing a safe one-time reversal.
- Contacts remain optional; no contact is invented or imported by this stage.

The API exposes tenant-scoped company listing, owner merge, and merge reversal. Extraction now also
returns the resolved company ID and resolution method.

