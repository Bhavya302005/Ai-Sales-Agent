from datetime import UTC

from app.briefing.schemas import (
    BriefCitation,
    GroundedBriefItem,
    LabeledBriefItem,
    PreCallBriefResponse,
)
from app.repositories.leads import LeadRecord

QUALIFICATION_KEY = "_qualification_questions"
HANDOFF_KEY = "_handoff_conditions"
PROHIBITED_CLAIMS = (
    "unapproved pricing or discounts",
    "unverified availability or delivery dates",
    "unapproved customer names or case studies",
    "guarantees or contractual commitments",
)


def _source_evidence(record: LeadRecord) -> str:
    span = record.requirement.evidence_span
    evidence = span.get("quote") or span.get("excerpt")
    return str(evidence or record.source.evidence_excerpt)


def _source_citation(record: LeadRecord, evidence: str | None = None) -> BriefCitation:
    return BriefCitation(
        kind="source",
        reference_id=str(record.source.id),
        evidence=evidence or _source_evidence(record),
    )


def _product_citation(record: LeadRecord, *, key: str, value: str) -> BriefCitation:
    return BriefCitation(
        kind="product_fact",
        reference_id=f"{record.product_version.id}:{key}",
        evidence=value,
    )


def build_pre_call_brief(record: LeadRecord, unknown_fields: list[str]) -> PreCallBriefResponse:
    if record.product_version.approved_at is None:
        raise ValueError("pre-call brief requires an approved product version")
    evidence = _source_evidence(record)
    source_citation = _source_citation(record, evidence)
    description_citation = BriefCitation(
        kind="product_description",
        reference_id=str(record.product_version.id),
        evidence=record.product_version.description,
    )
    known_facts: list[LabeledBriefItem] = [
        LabeledBriefItem(
            label="requirement",
            text=record.requirement.normalized_need,
            citations=(source_citation,),
        )
    ]
    if record.requirement.category:
        known_facts.append(
            LabeledBriefItem(
                label="category",
                text=record.requirement.category.replace("_", " "),
                citations=(source_citation,),
            )
        )
    if record.requirement.geography:
        known_facts.append(
            LabeledBriefItem(
                label="geography",
                text=record.requirement.geography,
                citations=(source_citation,),
            )
        )
    if record.requirement.explicit_deadline:
        deadline = record.requirement.explicit_deadline
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=UTC)
        known_facts.append(
            LabeledBriefItem(
                label="explicit deadline",
                text=deadline.date().isoformat(),
                citations=(source_citation,),
            )
        )

    stored_facts = record.product_version.facts
    faq = tuple(
        LabeledBriefItem(
            label=key.replace("_", " "),
            text=str(value),
            citations=(_product_citation(record, key=key, value=str(value)),),
        )
        for key, value in stored_facts.items()
        if key not in {QUALIFICATION_KEY, HANDOFF_KEY}
    )
    questions = tuple(
        LabeledBriefItem(
            label=f"question {index}",
            text=str(question),
            citations=(
                _product_citation(
                    record,
                    key=QUALIFICATION_KEY,
                    value=str(question),
                ),
            ),
        )
        for index, question in enumerate(stored_facts.get(QUALIFICATION_KEY, []), start=1)
    )
    escalations = tuple(
        LabeledBriefItem(
            label=f"handoff rule {index}",
            text=str(condition),
            citations=(
                _product_citation(record, key=HANDOFF_KEY, value=str(condition)),
            ),
        )
        for index, condition in enumerate(stored_facts.get(HANDOFF_KEY, []), start=1)
    )
    return PreCallBriefResponse(
        lead_id=record.lead.id,
        product_version_id=record.product_version.id,
        opener=GroundedBriefItem(
            text=f"I’m calling about this published requirement: {evidence}",
            citations=(source_citation,),
        ),
        likely_need=GroundedBriefItem(
            text=record.requirement.normalized_need,
            citations=(source_citation,),
        ),
        fit_summary=GroundedBriefItem(
            text=record.product_version.description,
            citations=(description_citation,),
        ),
        known_facts=tuple(known_facts),
        unknowns=tuple(unknown_fields),
        allowed_faq=faq,
        qualification_questions=questions,
        escalation_topics=escalations,
        prohibited_claims=PROHIBITED_CLAIMS,
    )
