# Repository operating rules

- Treat `CODEX_4_DAY_AI_SALES_AGENT_MVP_PLAN.md` as the product contract.
- Keep `docs/implementation/TASK_BOARD.md` current with exactly one task marked `IN_PROGRESS`.
- Preserve tenant isolation, evidence provenance, explicit unknowns, consent, suppression, idempotency, and honest fallback labels.
- Use Node.js 22 LTS and Python 3.12 in reproducible environments.
- Never put secrets, real personal contact data, or unrestricted transcript content in source control or logs.
- Run narrow tests after each task, followed by the affected integration tests.
- Do not operate on the parent repository or files outside this directory.

