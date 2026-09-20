from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import Auth
from app.db import get_session
from app.persistence.models import (
    Call,
    CampaignLead,
    HandoffTask,
    Lead,
    OutboxEvent,
    Qualification,
    SourceDocument,
    UsageEvent,
)

router = APIRouter(prefix="/api/v1/analytics", tags=["analytics"])


class FunnelResponse(BaseModel):
    discovered: int
    reviewed: int
    approved: int
    called: int
    qualified: int
    handed_off: int


class BreakdownItem(BaseModel):
    label: str
    count: int


class DiscoveryBreakdownResponse(BaseModel):
    by_source: list[BreakdownItem]
    by_type: list[BreakdownItem]
    actionable: int
    calls_attempted: int
    calls_completed: int
    interested: int


class UsageTotal(BaseModel):
    unit: str
    quantity: Decimal
    estimated_cost_inr: Decimal
    actual_cost_inr: Decimal | None


class UsageResponse(BaseModel):
    totals: list[UsageTotal]
    total_estimated_cost_inr: Decimal
    total_actual_cost_inr: Decimal | None
    average_voice_latency_ms: int | None
    crm_retrying: int
    crm_action_required: int
    cost_label: str = "Estimated unless actual provider cost is present"


@router.get("/funnel", response_model=FunnelResponse)
def get_funnel(
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> FunnelResponse:
    discovered = (
        session.scalar(
            select(func.count())
            .select_from(Lead)
            .where(Lead.organization_id == auth.organization_id)
        )
        or 0
    )
    reviewed = (
        session.scalar(
            select(func.count())
            .select_from(Lead)
            .where(
                Lead.organization_id == auth.organization_id,
                Lead.lifecycle.in_(
                    ["reviewed", "approved", "contacted", "qualified", "handed_off"]
                ),
            )
        )
        or 0
    )
    approved = (
        session.scalar(
            select(func.count(func.distinct(CampaignLead.lead_id))).where(
                CampaignLead.organization_id == auth.organization_id,
                CampaignLead.approved_at.is_not(None),
            )
        )
        or 0
    )
    called = (
        session.scalar(
            select(func.count(func.distinct(Call.lead_id))).where(
                Call.organization_id == auth.organization_id,
                Call.started_at.is_not(None),
            )
        )
        or 0
    )
    qualifications = session.scalars(
        select(Qualification).where(Qualification.organization_id == auth.organization_id)
    ).all()
    qualified = sum(bool(item.evidence_segment_ids) for item in qualifications)
    handed_off = (
        session.scalar(
            select(func.count(func.distinct(HandoffTask.lead_id))).where(
                HandoffTask.organization_id == auth.organization_id
            )
        )
        or 0
    )
    return FunnelResponse(
        discovered=discovered,
        reviewed=reviewed,
        approved=approved,
        called=called,
        qualified=qualified,
        handed_off=handed_off,
    )


@router.get("/discovery", response_model=DiscoveryBreakdownResponse)
def get_discovery_breakdown(
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> DiscoveryBreakdownResponse:
    source_rows = session.execute(
        select(SourceDocument.source_type, func.count())
        .where(
            SourceDocument.organization_id == auth.organization_id,
            SourceDocument.opportunity_type.is_not(None),
        )
        .group_by(SourceDocument.source_type)
        .order_by(func.count().desc())
    ).all()
    type_rows = session.execute(
        select(SourceDocument.opportunity_type, func.count())
        .where(
            SourceDocument.organization_id == auth.organization_id,
            SourceDocument.opportunity_type.is_not(None),
        )
        .group_by(SourceDocument.opportunity_type)
        .order_by(func.count().desc())
    ).all()
    return DiscoveryBreakdownResponse(
        by_source=[BreakdownItem(label=label, count=count) for label, count in source_rows],
        by_type=[BreakdownItem(label=label, count=count) for label, count in type_rows if label],
        actionable=session.scalar(
            select(func.count())
            .select_from(SourceDocument)
            .where(
                SourceDocument.organization_id == auth.organization_id,
                SourceDocument.discovery_actionable.is_(True),
            )
        )
        or 0,
        calls_attempted=session.scalar(
            select(func.count())
            .select_from(Call)
            .where(Call.organization_id == auth.organization_id)
        )
        or 0,
        calls_completed=session.scalar(
            select(func.count())
            .select_from(Call)
            .where(Call.organization_id == auth.organization_id, Call.state == "completed")
        )
        or 0,
        interested=sum(
            item.interest in {"interested", "high", "positive"}
            for item in session.scalars(
                select(Qualification).where(Qualification.organization_id == auth.organization_id)
            ).all()
        ),
    )


@router.get("/usage", response_model=UsageResponse)
def get_usage(
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> UsageResponse:
    events = session.scalars(
        select(UsageEvent).where(UsageEvent.organization_id == auth.organization_id)
    ).all()
    units = ("llm_tokens", "stt_seconds", "tts_characters", "call_seconds", "enrichment_units")
    totals: list[UsageTotal] = []
    for unit in units:
        matching = [event for event in events if event.unit == unit]
        actual_values = [
            event.actual_cost_inr for event in matching if event.actual_cost_inr is not None
        ]
        totals.append(
            UsageTotal(
                unit=unit,
                quantity=sum((event.quantity for event in matching), start=Decimal("0")),
                estimated_cost_inr=sum(
                    (event.estimated_cost_inr for event in matching), start=Decimal("0")
                ),
                actual_cost_inr=(sum(actual_values, start=Decimal("0")) if actual_values else None),
            )
        )
    latency_samples: list[int] = []
    for call in session.scalars(
        select(Call).where(Call.organization_id == auth.organization_id)
    ).all():
        latency_samples.extend(int(value) for value in call.usage.get("voice_latency_ms", []))
    crm_events = session.scalars(
        select(OutboxEvent).where(
            OutboxEvent.organization_id == auth.organization_id,
            OutboxEvent.event_type == "crm.sync_requested.v1",
        )
    ).all()
    return UsageResponse(
        totals=totals,
        total_estimated_cost_inr=sum(
            (event.estimated_cost_inr for event in events), start=Decimal("0")
        ),
        total_actual_cost_inr=(
            sum(
                (event.actual_cost_inr for event in events if event.actual_cost_inr is not None),
                start=Decimal("0"),
            )
            if any(event.actual_cost_inr is not None for event in events)
            else None
        ),
        average_voice_latency_ms=(
            round(sum(latency_samples) / len(latency_samples)) if latency_samples else None
        ),
        crm_retrying=sum(event.state == "retry_wait" for event in crm_events),
        crm_action_required=sum(event.state == "action_required" for event in crm_events),
    )
