import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.notifications import notify_roles
from app.persistence.models import (
    Call,
    CallbackRequest,
    CampaignLead,
    HandoffTask,
    Lead,
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
    "human handoff",
    "હ્યુમન હેન્ડઓફ",
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
    "હા",
    "હા છે",
    "હા અમ",
    "ઓકે",
)
NO_ANSWERS = ("no", "nope", "not me", "नहीं", "ના")

NEED_QUESTIONS = ("need", "requirement", "challenge", "problem", "looking for", "help with")
SCOPE_QUESTIONS = ("scope", "services", "project", "users", "team", "workload", "environment")
TIMELINE_QUESTIONS = (
    "timeline",
    "deadline",
    "when",
    "start",
    "urgency",
    "time frame",
    "timeframe",
    "टाइमलाइन",
    "समय सीमा",
    "સમયરેખા",
)
AUTHORITY_QUESTIONS = (
    "decision",
    "approve",
    "approval",
    "stakeholder",
    "responsible",
    "involved",
    "निर्णय",
    "फैसला",
    "कौन लेगा",
    "નિર્ણય",
)
INTEREST_QUESTIONS = (
    "interested",
    "follow up",
    "follow-up",
    "next step",
    "schedule",
    "meeting",
    "callback",
    "call back",
    "speak with",
    "connect you",
    "विशेषज्ञ",
    "संपर्क किया जाए",
    "વિશેષજ્ઞ",
    "ઈચ્છા",
    "આગળની ચર્ચા",
    "calendly",
    "book",
    "બુક",
    "કૉલ કરીશ",
    "human handoff",
    "હ્યુમન હેન્ડઓફ",
)
CALLBACK_TIMING_QUESTIONS = (
    "which day",
    "what day",
    "what time",
    "preferred time",
    "day or time",
    "कौन सा दिन",
    "किस समय",
    "કયો દિવસ",
    "કયો સમય",
    "યોગ્ય રહેશે",
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
    previous_agent_segment: TranscriptSegment | None = None
    for segment in segments:
        if segment.speaker == "agent":
            previous_agent = segment.text.casefold()
            previous_agent_segment = segment
            continue
        if segment.speaker != "participant":
            continue
        text = segment.text.strip()
        # Allow Devanagari (\u0900-\u097f) and Gujarati (\u0A80-\u0AFF) blocks
        normalized = " ".join(re.sub(r"[^\w\u0900-\u097f\u0A80-\u0AFF]+", " ", text.casefold()).split())
        padded = f" {normalized} "
        raw_folded = text.casefold().strip(" .,!?:;।")
        affirmative = any(
            f" {answer} " in padded
            or raw_folded == answer
            or raw_folded.startswith(f"{answer} ")
            for answer in YES_ANSWERS
        )
        negative = any(
            f" {answer} " in padded
            or raw_folded == answer
            or raw_folded.startswith(f"{answer} ")
            for answer in NO_ANSWERS
        )
        used = False

        is_environment_question = any(
            term in previous_agent
            for term in ("current environment", "users, locations", "मौजूदा परिवेश")
        )
        is_success_question = any(
            term in previous_agent
            for term in ("make this project successful", "most important", "सफलता", "सबसे महत्वपूर्ण")
        )

        # Classify the preceding question once. This prevents a question such as
        # "requirements most important for the project" from overwriting both the
        # need and scope captured by earlier, more specific questions.
        confirms_described_need = (
            ("requirement" in previous_agent or "जरूरत" in previous_agent)
            and any(term in previous_agent for term in ("still active", "accurate", "सक्रिय"))
            and affirmative
        )
        if confirms_described_need and previous_agent_segment is not None:
            result["need"] = f"Confirmed: {previous_agent_segment.text.strip()}"
            _add_evidence(result["evidence_segment_ids"], previous_agent_segment)
            used = True
        elif is_environment_question:
            result["scope"] = text
            used = True
        elif is_success_question:
            if not _contains(normalized, UNKNOWN_PHRASES):
                result["objections"].append(
                    {
                        "type": "delivery_requirement",
                        "text": text,
                        "evidence_segment_id": str(segment.id),
                    }
                )
            used = True
        elif "budget" in previous_agent or "बजट" in previous_agent:
            result["budget_known"] = (
                None
                if _contains(normalized, UNKNOWN_PHRASES)
                else not any(f" {answer} " in f" {normalized} " for answer in NO_ANSWERS)
            )
            used = True
        elif any(term in previous_agent for term in AUTHORITY_QUESTIONS):
            result["authority_known"] = (
                None
                if _contains(normalized, UNKNOWN_PHRASES)
                else not any(f" {answer} " in f" {normalized} " for answer in NO_ANSWERS)
            )
            used = True
        elif any(term in previous_agent for term in TIMELINE_QUESTIONS):
            result["timeline"] = text
            used = True
        elif any(term in previous_agent for term in INTEREST_QUESTIONS):
            # Interest and next-step values are resolved below from the answer.
            used = True
        elif "workloads" in previous_agent:
            result["need"] = text
            used = True
        elif any(term in previous_agent for term in SCOPE_QUESTIONS):
            result["scope"] = text
            used = True
        elif any(term in previous_agent for term in NEED_QUESTIONS):
            result["need"] = text
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

        interest_question = any(term in previous_agent for term in INTEREST_QUESTIONS)
        if interest_question and affirmative:
            result["interest"] = "positive"
            used = True
        elif interest_question and negative:
            result["interest"] = "not_interested"
            used = True

        asks_for_follow_up = any(term in previous_agent for term in INTEREST_QUESTIONS) and (
            "confirm" in previous_agent or "पुष्टि" in previous_agent or affirmative
        )
        if asks_for_follow_up and affirmative:
            result["requested_next_step"] = "Human specialist follow-up requested"
            used = True
        if any(term in previous_agent for term in CALLBACK_TIMING_QUESTIONS) and not _contains(
            normalized, UNKNOWN_PHRASES
        ):
            result["requested_next_step"] = f"Preferred follow-up time: {text}"
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
    derived = _derive_fields(segments)
    qualification_created = qualification is None
    if qualification is None:
        qualification = Qualification(
            organization_id=organization_id,
            call_id=call.id,
            **derived,
        )
        session.add(qualification)
        session.flush()
    else:
        for field in (
            "need",
            "timeline",
            "scope",
            "authority_known",
            "budget_known",
            "interest",
            "requested_next_step",
        ):
            if derived[field] is not None:
                setattr(qualification, field, derived[field])
        if not qualification.objections and derived["objections"]:
            qualification.objections = derived["objections"]
        qualification.evidence_segment_ids = list(
            dict.fromkeys([*qualification.evidence_segment_ids, *derived["evidence_segment_ids"]])
        )
        session.flush()

    handoff = session.scalar(
        select(HandoffTask).where(
            HandoffTask.organization_id == organization_id,
            HandoffTask.call_id == call.id,
        )
    )
    handoff_created = False
    objection_types = {
        str(item.get("type")) for item in qualification.objections if isinstance(item, dict)
    }
    needs_handoff = (
        call.outcome == "handoff_requested"
        or qualification.interest == "positive"
        or bool(qualification.requested_next_step)
        or "pricing_or_commitment" in objection_types
    )
    if needs_handoff and handoff is None:
        call.outcome = "handoff_requested"
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
        session.add(
            CallbackRequest(
                organization_id=organization_id,
                call_id=call.id,
                handoff_id=handoff.id,
                owner_id=owner_id,
                requested_text=qualification.requested_next_step or "Human follow-up requested",
                scheduled_for=None,
                status="awaiting_confirmation",
            )
        )
        notify_roles(
            session,
            organization_id=organization_id,
            notification_type="callback_confirmation_required",
            severity="success",
            title="Follow-up requested",
            summary="A qualified conversation requires callback scheduling.",
            action_url="/callbacks",
            dedupe_key=f"callback:{call.id}",
        )
        handoff_created = True

    # BUG FIX: Update Lead.lifecycle and CampaignLead.state after call completion.
    # Previously these were never updated, making the analytics funnel wrong.
    new_lifecycle = "qualified" if qualification.interest == "positive" else "contacted"
    lead_row = session.scalar(
        select(Lead).where(
            Lead.id == call.lead_id,
            Lead.organization_id == organization_id,
        )
    )
    if lead_row is not None and lead_row.lifecycle in {"discovered", "reviewed", "approved"}:
        lead_row.lifecycle = new_lifecycle

    campaign_leads = session.scalars(
        select(CampaignLead).where(
            CampaignLead.organization_id == organization_id,
            CampaignLead.lead_id == call.lead_id,
            CampaignLead.state.not_in({"attempts_exhausted", "qualified", "contacted"}),
        )
    ).all()
    for cl in campaign_leads:
        cl.state = new_lifecycle

    from app.booking_followups.service import attach_finalized_handoff

    attach_finalized_handoff(session, call_id=call.id, organization_id=organization_id)

    return FinalizationResult(
        qualification=qualification,
        handoff=handoff,
        qualification_created=qualification_created,
        handoff_created=handoff_created,
    )
