import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence.models import (
    Call,
    CampaignLead,
    HandoffTask,
    Membership,
    Qualification,
    TranscriptSegment,
)
from app.usage.service import record_call_usage

UNKNOWN_PHRASES = (
    "don't know",
    "do not know",
    "not sure",
    "unknown",
    "पता नहीं",
)
POSITIVE_INTEREST = (
    "interested",
    "sounds good",
    "let's proceed",
    "talk to a specialist",
    "set up a meeting",
    "दिलचस्पी",
    "विशेषज्ञ से",
)
NEGATIVE_INTEREST = ("not interested", "no interest", "रुचि नहीं")
PRICING_OR_COMMITMENT = (
    "price",
    "pricing",
    "discount",
    "quote",
    "custom terms",
    "contract",
    "legal",
    "guarantee",
    "कीमत",
    "छूट",
)
YES_ANSWERS = (
    "yes",
    "yes please",
    "sure",
    "okay",
    "ok",
    "go ahead",
    "please proceed",
    "that works for me",
    "sounds good",
    "haan",
    "haan ji",
    "हाँ",
    "जी हाँ",
    "बिल्कुल",
)


@dataclass(frozen=True)
class FinalizationResult:
    qualification: Qualification
    handoff: HandoffTask | None
    qualification_created: bool
    handoff_created: bool


def _contains(text: str, phrases: tuple[str, ...]) -> bool:
    return any(phrase in text.casefold() for phrase in phrases)


def _add_evidence(evidence: list[str], segment: TranscriptSegment) -> None:
    segment_id = str(segment.id)
    if segment_id not in evidence:
        evidence.append(segment_id)


def _derive_fields(segments: list[TranscriptSegment]) -> dict[str, Any]:
    result: dict[str, Any] = {
        "need": None,
        "timeline": None,
        "scope": None,
        "authority_known": None,
        "budget_known": None,
        "objections": [],
        "interest": None,
        "requested_next_step": None,
        "evidence_segment_ids": [],
    }
    previous_agent = ""
    for segment in segments:
        if segment.speaker == "agent":
            previous_agent = segment.text.casefold()
            continue
        if segment.speaker != "participant":
            continue
        text = segment.text.strip()
        normalized = " ".join(re.sub(r"[^\w\u0900-\u097f]+", " ", text.casefold()).split())
        used = False

        if any(term in previous_agent for term in ("workloads", "वर्कलोड")):
            result["scope"] = text
            result["need"] = text
            used = True
        if any(
            term in previous_agent
            for term in ("current environment", "users, locations", "मौजूदा परिवेश")
        ):
            result["scope"] = text
            used = True
        if any(
            term in previous_agent
            for term in ("make this project successful", "most important", "सफलता", "सबसे महत्वपूर्ण")
        ):
            if not _contains(normalized, UNKNOWN_PHRASES):
                result["objections"].append(
                    {
                        "type": "delivery_requirement",
                        "text": text,
                        "evidence_segment_id": str(segment.id),
                    }
                )
            used = True
        if any(
            term in previous_agent
            for term in ("deadline", "business event", "समय-सीमा", "व्यावसायिक कारण")
        ):
            result["timeline"] = text
            used = True
        if any(
            term in previous_agent
            for term in ("owns the technical", "commercial decision", "निर्णय की जिम्मेदारी")
        ):
            result["authority_known"] = not _contains(normalized, UNKNOWN_PHRASES)
            used = True
        if "budget" in previous_agent or "बजट" in previous_agent:
            result["budget_known"] = not _contains(normalized, UNKNOWN_PHRASES)
            used = True

        if _contains(normalized, PRICING_OR_COMMITMENT):
            result["objections"].append(
                {
                    "type": "pricing_or_commitment",
                    "text": text,
                    "evidence_segment_id": str(segment.id),
                }
            )
            used = True
        if _contains(normalized, NEGATIVE_INTEREST):
            result["interest"] = "not_interested"
            used = True
        elif _contains(normalized, POSITIVE_INTEREST):
            result["interest"] = "positive"
            used = True

        asks_for_follow_up = (
            "human specialist" in previous_agent or "मानव विशेषज्ञ" in previous_agent
        ) and ("confirm" in previous_agent or "पुष्टि" in previous_agent)
        padded = f" {normalized} "
        if asks_for_follow_up and any(f" {answer} " in padded for answer in YES_ANSWERS):
            result["requested_next_step"] = (
                "Human specialist follow-up using the verified test contact"
            )
            used = True

        if used:
            _add_evidence(result["evidence_segment_ids"], segment)
    return result


def _handoff_reason(qualification: Qualification, outcome: str | None) -> tuple[str, str]:
    objection_types = {
        str(item.get("type")) for item in qualification.objections if isinstance(item, dict)
    }
    if "pricing_or_commitment" in objection_types:
        return "high", "Pricing or commitment question requires an approved human answer."
    if qualification.interest == "positive":
        return "high", "Positive interest reached the mandatory human handoff boundary."
    if qualification.requested_next_step:
        return "normal", qualification.requested_next_step
    return "normal", f"Conversation requested human review ({outcome or 'unspecified'})."


def finalize_completed_call(
    session: Session,
    *,
    organization_id: UUID,
    call_id: UUID,
    now: datetime | None = None,
) -> FinalizationResult:
    call = session.scalar(
        select(Call).where(Call.id == call_id, Call.organization_id == organization_id)
    )
    if call is None:
        raise LookupError("call not found")
    if call.state != "completed":
        raise ValueError("only a completed call can produce final artifacts")

    segments = list(
        session.scalars(
            select(TranscriptSegment)
            .where(
                TranscriptSegment.organization_id == organization_id,
                TranscriptSegment.call_id == call.id,
                TranscriptSegment.is_final.is_(True),
            )
            .order_by(TranscriptSegment.sequence)
        ).all()
    )
    record_call_usage(session, call=call, segments=segments)
    qualification = session.scalar(
        select(Qualification).where(
            Qualification.organization_id == organization_id,
            Qualification.call_id == call.id,
        )
    )
    qualification_created = qualification is None
    if qualification is None:
        qualification = Qualification(
            organization_id=organization_id,
            call_id=call.id,
            **_derive_fields(segments),
        )
        session.add(qualification)
        session.flush()

    handoff = session.scalar(
        select(HandoffTask).where(
            HandoffTask.organization_id == organization_id,
            HandoffTask.call_id == call.id,
        )
    )
    handoff_created = False
    if call.outcome == "handoff_requested" and handoff is None:
        owner_id = session.scalar(
            select(CampaignLead.owner_id)
            .where(
                CampaignLead.organization_id == organization_id,
                CampaignLead.lead_id == call.lead_id,
                CampaignLead.owner_id.is_not(None),
            )
            .order_by(CampaignLead.approved_at.desc())
            .limit(1)
        )
        if owner_id is None:
            owner_id = session.scalar(
                select(CampaignLead.approved_by)
                .where(
                    CampaignLead.organization_id == organization_id,
                    CampaignLead.lead_id == call.lead_id,
                    CampaignLead.approved_by.is_not(None),
                )
                .order_by(CampaignLead.approved_at.desc())
                .limit(1)
            )
        if owner_id is None:
            owner_id = session.scalar(
                select(Membership.user_id)
                .where(
                    Membership.organization_id == organization_id,
                    Membership.status == "active",
                    Membership.role.in_(["owner", "operator"]),
                )
                .order_by(Membership.created_at)
                .limit(1)
            )
        if owner_id is None:
            raise ValueError("handoff requires an assigned campaign owner")
        priority, reason = _handoff_reason(qualification, call.outcome)
        created_at = now or datetime.now(UTC)
        handoff = HandoffTask(
            organization_id=organization_id,
            lead_id=call.lead_id,
            call_id=call.id,
            owner_id=owner_id,
            priority=priority,
            reason=reason,
            due_at=created_at + (timedelta(hours=4) if priority == "high" else timedelta(days=1)),
            state="open",
            external_reference=None,
        )
        session.add(handoff)
        session.flush()
        handoff_created = True

    return FinalizationResult(
        qualification=qualification,
        handoff=handoff,
        qualification_created=qualification_created,
        handoff_created=handoff_created,
    )
