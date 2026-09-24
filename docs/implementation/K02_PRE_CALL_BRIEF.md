# K02 grounded pre-call brief

Each lead tied to an approved immutable product version now receives a deterministic brief in its
detail response and UI. No generative model is required.

The brief contains:

- a source-grounded opener and likely need;
- an approved-product fit statement;
- known requirement facts and explicit unknowns;
- only the approved factual FAQ answers;
- approved qualification questions and human-handoff conditions;
- an explicit prohibition on invented pricing, availability, customer names and commitments.

Every factual item has one or more typed citations pointing to the source document, approved
product description, or a specific approved product fact. The pricing policy is not converted into
a price or sales claim. Draft/unapproved product versions cannot produce a brief.

Approved knowledge also has a tenant-scoped narrow search endpoint. PostgreSQL uses
`to_tsvector`/`plainto_tsquery`; the SQLite test environment uses an equivalent bounded fallback.

