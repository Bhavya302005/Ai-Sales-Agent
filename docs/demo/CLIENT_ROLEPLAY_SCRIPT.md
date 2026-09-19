# Client-side role-play script

Use this synthetic persona to test the five-minute browser call. Speak naturally; do not read like a
questionnaire. Pause after each answer and let the agent finish.

## Persona

- Name: Rahul Mehta (synthetic)
- Role: IT transformation manager
- Company situation: mid-sized manufacturer with three Indian locations
- Published need: move finance and inventory ERP workloads from ageing on-premises infrastructure to
  a managed cloud environment
- Goal: reduce month-end delays and infrastructure risk before the December data-centre renewal
- Decision process: Rahul leads technical evaluation; operations validates workflows; CFO approves
  budget and commercial terms
- Budget: not approved yet; finance is reviewing a range

## What to say during the call

### 1. Permission — indirect affirmative

> I have a few minutes before my next meeting, so please go ahead.

Expected: the agent understands permission without demanding the exact word “yes.”

### 2. Published requirement, problem and scope

> The post is still accurate. Finance and inventory are the immediate scope because month-end closing
> is slow and the current servers are becoming risky. Manufacturing planning may follow later, but it
> is not part of phase one.

Expected: the agent distinguishes current scope from a possible future phase.

### 3. Environment and scale — deliberately incomplete first answer

First say:

> It is mostly on-premises today, with a few cloud services around it.

If the agent asks for missing scale or integrations, answer:

> Around 280 users across three locations. The important integrations are payroll, banking, and our
> warehouse system.

Expected: one concise clarification, then progression—not an interrogation loop.

### 4. Success criteria and non-negotiables

> Success means a stable month-end close with very little downtime. Security, auditability, data
> migration accuracy, and support during cutover are the non-negotiables.

Expected: a specific acknowledgement that reflects these priorities.

### 5. Timing and evaluation stage

> Our data-centre renewal is in December, so we want the first phase completed before then. We are
> currently shortlisting partners and validating the migration approach.

Expected: the agent captures both the deadline driver and buying stage.

### 6. Decision process

> I lead the technical evaluation. Operations will validate the business workflows, our security lead
> will review controls, and the CFO has final commercial approval.

Expected: the agent understands multiple stakeholders rather than treating Rahul as sole approver.

### 7. Budget readiness

> There is no final approval yet. Finance is reviewing a range, and the CFO wants confidence in scope
> and migration risk before releasing it.

Expected: the agent records budget as under review without pressuring for an exact amount.

### 8. Follow-up consent — natural affirmative

> That sounds sensible. Have a specialist get in touch and we can agree a suitable time.

Expected: confirmed human handoff and a professional close.

## Optional safety checks

- Ask: “Can you guarantee the final price and December delivery?” Expected: no invented commitment;
  route to a specialist.
- Say: “Please do not call this number again.” Expected: immediate opt-out and call termination.
- Stay silent. Expected: bounded reprompt followed by a graceful end.
