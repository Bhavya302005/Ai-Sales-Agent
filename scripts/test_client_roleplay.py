"""Run the synthetic client-side role-play through the configured dialogue adapter."""

from dataclasses import asdict

from app.config import Settings
from app.conversation.dialogue_adapter import build_dialogue_adapter

TURNS = (
    (
        "Permission",
        "Is now a good time to continue?",
        "I have a few minutes before my next meeting, so please go ahead.",
        False,
    ),
    (
        "Qualification",
        (
            "Which workloads and processes are in scope, what triggered this, "
            "and is the post accurate?"
        ),
        "The post is still accurate. Finance and inventory are phase one because month-end close "
        "is slow and the servers are risky. Manufacturing planning may follow later.",
        False,
    ),
    (
        "Qualification",
        "Describe the environment, users, locations, and integrations.",
        "It is mostly on-premises today, with a few cloud services around it.",
        False,
    ),
    (
        "Qualification",
        "Please clarify the scale and important integrations.",
        (
            "Around 280 users across three locations, with payroll, banking, "
            "and warehouse integrations."
        ),
        False,
    ),
    (
        "Qualification",
        "What defines success and which requirements are most important?",
        "A stable month-end close with little downtime. Security, auditability, "
        "migration accuracy, and cutover support are non-negotiable.",
        False,
    ),
    (
        "Qualification",
        "What deadline is driving this, and what is the evaluation stage?",
        "The December data-centre renewal is the driver. We are shortlisting partners and "
        "the migration approach.",
        False,
    ),
    (
        "Qualification",
        "Who owns technical and commercial decisions, and who else approves?",
        "I lead technical evaluation, operations validates workflows, security reviews controls, "
        "and the CFO gives final commercial approval.",
        False,
    ),
    (
        "Qualification",
        "Is the budget approved, under review, or not decided?",
        "There is no final approval. Finance is reviewing a range, and the CFO wants confidence in "
        "scope and migration risk first.",
        True,
    ),
    (
        "NextStep",
        "May a human specialist follow up using the verified contact?",
        "That sounds sensible. Have a specialist get in touch and we can agree a suitable time.",
        False,
    ),
)


def main() -> None:
    settings = Settings()
    adapter = build_dialogue_adapter(settings)
    if adapter is None:
        raise SystemExit("Configure DIALOGUE_MODE and its provider key first")
    history: list[str] = []
    lead_context = {
        "requirement": "Finance and inventory ERP migration to managed cloud",
        "category": "ERP cloud migration",
        "geography": "India",
        "urgency": "before December data-centre renewal",
    }
    for number, (state, question, answer, final_question) in enumerate(TURNS, start=1):
        result = adapter.interpret(
            participant_text=answer,
            language="en-IN",
            conversation_state=state,
            current_question=question,
            approved_facts={},
            previous_participant_answers=tuple(history[-8:]),
            lead_context=lead_context,
            is_final_qualification_question=final_question,
        )
        print(
            {
                "turn": number,
                "state": state,
                "result": None if result is None else asdict(result),
            }
        )
        history.append(answer)


if __name__ == "__main__":
    main()
