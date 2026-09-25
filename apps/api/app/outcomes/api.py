from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.auth import Auth
from app.config import Settings, get_settings
from app.db import get_session
from app.persistence.models import (
    BookingFollowup,
    Call,
    HandoffTask,
    OutboxEvent,
    Qualification,
    TranscriptSegment,
)

router = APIRouter(prefix="/api/v1", tags=["outcomes"])


class TranscriptSegmentResponse(BaseModel):
    id: UUID
    sequence: int
    speaker: str
    started_ms: int
    ended_ms: int
    text: str
    language: str


class QualificationResponse(BaseModel):
    id: UUID
    need: str | None
    timeline: str | None
    scope: str | None
    authority_known: bool | None
    budget_known: bool | None
    objections: list[Any]
    interest: str | None
    requested_next_step: str | None
    evidence_segment_ids: list[str]


class HandoffResponse(BaseModel):
    id: UUID
    owner_id: UUID
    priority: str
    reason: str
    due_at: datetime
    state: str
    external_reference: str | None
    crm_provider: str
    crm_sync_status: str


class BookingFollowupResponse(BaseModel):
    id: UUID
    status: str
    delivery_mode: str
    delivery_status: str
    calendly_link: str | None
    link_sent_at: datetime | None
    booking_check_at: datetime | None
    booked_at: datetime | None
    canceled_at: datetime | None
    scheduled_start_at: datetime | None
    retry_count: int
    retry_call_id: UUID | None
    last_error_code: str | None


class CallDetailResponse(BaseModel):
    id: UUID
    lead_id: UUID
    transport: str
    state: str
    outcome: str | None
    max_duration_seconds: int
    usage: dict[str, Any]
    eligibility_checks: list[dict[str, Any]]
    transcript: list[TranscriptSegmentResponse]
    qualification: QualificationResponse | None
    handoff: HandoffResponse | None
    booking_followup: BookingFollowupResponse | None


def _qualification_response(value: Qualification | None) -> QualificationResponse | None:
    if value is None:
        return None
    return QualificationResponse(
        id=value.id,
        need=value.need,
        timeline=value.timeline,
        scope=value.scope,
        authority_known=value.authority_known,
        budget_known=value.budget_known,
        objections=value.objections,
        interest=value.interest,
        requested_next_step=value.requested_next_step,
        evidence_segment_ids=[str(item) for item in value.evidence_segment_ids],
    )


@router.get("/calls/{call_id}/detail", response_model=CallDetailResponse)
def get_call_detail(
    call_id: UUID,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CallDetailResponse:
    call = session.scalar(
        select(Call).where(Call.id == call_id, Call.organization_id == auth.organization_id)
    )
    if call is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found")
    if call.transport == "omnidim" and (
        call.state in {"connecting", "active", "ending"}
        or not session.scalar(
            select(TranscriptSegment.id).where(
                TranscriptSegment.organization_id == auth.organization_id,
                TranscriptSegment.call_id == call.id,
            )
        )
    ):
        from app.calling.api import _sync_single_omnidim_call

        _sync_single_omnidim_call(session, call, settings, auth.organization_id)
        session.refresh(call)
    segments = session.scalars(
        select(TranscriptSegment)
        .where(
            TranscriptSegment.organization_id == auth.organization_id,
            TranscriptSegment.call_id == call.id,
            TranscriptSegment.is_final.is_(True),
        )
        .order_by(TranscriptSegment.sequence)
    ).all()
    qualification = session.scalar(
        select(Qualification).where(
            Qualification.organization_id == auth.organization_id,
            Qualification.call_id == call.id,
        )
    )
    handoff = session.scalar(
        select(HandoffTask).where(
            HandoffTask.organization_id == auth.organization_id,
            HandoffTask.call_id == call.id,
        )
    )
    booking_followup = session.scalar(
        select(BookingFollowup).where(
            BookingFollowup.organization_id == auth.organization_id,
            or_(
                BookingFollowup.call_id == call.id,
                BookingFollowup.retry_call_id == call.id,
            ),
        )
    )
    sync_event = (
        session.scalar(
            select(OutboxEvent)
            .where(
                OutboxEvent.organization_id == auth.organization_id,
                OutboxEvent.aggregate_type == "handoff_task",
                OutboxEvent.aggregate_id == handoff.id,
                OutboxEvent.event_type == "crm.sync_requested.v1",
            )
            .order_by(OutboxEvent.created_at.desc())
            .limit(1)
        )
        if handoff
        else None
    )
    sync_status = {
        "pending": "pending",
        "processing": "pending",
        "retry_wait": "retrying",
        "completed": "succeeded",
        "action_required": "action_required",
    }.get(sync_event.state, "not_requested") if sync_event else "not_requested"
    return CallDetailResponse(
        id=call.id,
        lead_id=call.lead_id,
        transport=call.transport,
        state=call.state,
        outcome=call.outcome,
        max_duration_seconds=call.max_duration_seconds,
        usage=call.usage,
        eligibility_checks=list(call.eligibility_decision.get("checks", [])),
        transcript=[
            TranscriptSegmentResponse(
                id=item.id,
                sequence=item.sequence,
                speaker=item.speaker,
                started_ms=item.started_ms,
                ended_ms=item.ended_ms,
                text=item.text,
                language=item.language,
            )
            for item in segments
        ],
        qualification=_qualification_response(qualification),
        handoff=(
            HandoffResponse(
                id=handoff.id,
                owner_id=handoff.owner_id,
                priority=handoff.priority,
                reason=handoff.reason,
                due_at=handoff.due_at,
                state=handoff.state,
                external_reference=handoff.external_reference,
                crm_provider=settings.crm_mode,
                crm_sync_status=sync_status,
            )
            if handoff
            else None
        ),
        booking_followup=(
            BookingFollowupResponse(
                id=booking_followup.id,
                status=booking_followup.status,
                delivery_mode=booking_followup.delivery_mode,
                delivery_status=booking_followup.delivery_status,
                calendly_link=booking_followup.calendly_link,
                link_sent_at=booking_followup.link_sent_at,
                booking_check_at=booking_followup.booking_check_at,
                booked_at=booking_followup.booked_at,
                canceled_at=booking_followup.canceled_at,
                scheduled_start_at=booking_followup.scheduled_start_at,
                retry_count=booking_followup.retry_count,
                retry_call_id=booking_followup.retry_call_id,
                last_error_code=booking_followup.last_error_code,
            )
            if booking_followup
            else None
        ),
    )
