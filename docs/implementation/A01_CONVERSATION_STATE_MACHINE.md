# A01 — Bounded conversation and safe tools

Conversation policy runs in server code outside any dialogue model. The active path is:

`EligibilityChecked → Disclosure → Permission → Qualification ↔ FAQ → NextStep → Handoff`

Decline, opt-out, wrong-person, silence and hard limits terminate through explicit states. The
runtime uses only approved product facts and approved qualification questions. Pricing, discounts,
custom/legal commitments, guarantees and positive buying intent stop autonomous persuasion and
route to a human handoff.

The seven permitted tools have typed inputs and state-based server authorization:
`lead_lookup`, `product_search`, `availability_lookup`, `callback_schedule`, `lead_update`,
`human_handoff`, and `opt_out`. Callback proposals require explicit confirmation. Opt-out and
wrong-person events immediately create an idempotent channel suppression. The tool does not claim
the task exists during the live turn; call finalization atomically creates the H01 handoff afterward.

The deterministic adapter is the safe hackathon runtime while no external dialogue-model account is
configured. Spoken prompt-injection phrases are treated as participant text and cannot select tools,
change policy, or access system instructions.
