import calendar
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.auth import Auth
from app.db import get_session
from app.notifications import notify_roles
from app.persistence.models import (
    AuditLog,
    Call,
    CallbackRequest,
    Campaign,
    CampaignLead,
    CampaignRun,
    Contact,
    Suppression,
)
from app.rate_limits import enforce_rate_limit

router = APIRouter(prefix="/api/v1", tags=["campaign-operations"])
RETRYABLE_OUTCOMES = frozenset({"busy", "no_answer", "unanswered", "temporary_provider_failure"})


class CampaignRunResponse(BaseModel):
    id: UUID
    campaign_id: UUID
    scheduled_for: datetime
    state: str
    ready_lead_count: int
    processed_at: datetime | None


class ProcessDueResponse(BaseModel):
    runs_ready: int
    retries_ready: int
    attempts_exhausted: int


class CallbackResponse(BaseModel):
    id: UUID
    call_id: UUID
    handoff_id: UUID | None
    owner_id: UUID
    requested_text: str
    scheduled_for: datetime | None
    status: str
    created_at: datetime


class CallbackUpdate(BaseModel):
    status: Literal["scheduled", "completed", "cancelled"]
    scheduled_for: datetime | None = None


class CampaignRunUpdate(BaseModel):
    state: Literal["completed", "cancelled"]


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _next_occurrence(value: datetime, recurrence: str, timezone_name: str) -> datetime | None:
    if recurrence == "once":
        return None
    timezone = ZoneInfo(timezone_name)
    local = _aware(value).astimezone(timezone)
    if recurrence == "daily":
        return (local + timedelta(days=1)).astimezone(UTC)
    if recurrence == "weekly":
        return (local + timedelta(weeks=1)).astimezone(UTC)
    year, month = local.year, local.month + 1
    if month == 13:
        year, month = year + 1, 1
    day = min(local.day, calendar.monthrange(year, month)[1])
    return local.replace(year=year, month=month, day=day).astimezone(UTC)


def _run_response(row: CampaignRun) -> CampaignRunResponse:
    return CampaignRunResponse(
        id=row.id,
        campaign_id=row.campaign_id,
        scheduled_for=row.scheduled_for,
        state=row.state,
        ready_lead_count=row.ready_lead_count,
        processed_at=row.processed_at,
    )


def _callback_response(row: CallbackRequest) -> CallbackResponse:
    return CallbackResponse(
        id=row.id,
        call_id=row.call_id,
        handoff_id=row.handoff_id,
        owner_id=row.owner_id,
        requested_text=row.requested_text,
        scheduled_for=row.scheduled_for,
        status=row.status,
        created_at=row.created_at,
    )


def process_due_campaigns(session: Session, *, now: datetime | None = None) -> ProcessDueResponse:
    now = _aware(now or datetime.now(UTC)).astimezone(UTC)
    runs_ready = retries_ready = attempts_exhausted = 0
    campaigns = session.scalars(select(Campaign).where(Campaign.status == "active")).all()
    for campaign in campaigns:
        seed = campaign.scheduled_start_at or campaign.created_at
        latest = session.scalar(
            select(CampaignRun)
            .where(
                CampaignRun.organization_id == campaign.organization_id,
                CampaignRun.campaign_id == campaign.id,
            )
            .order_by(CampaignRun.scheduled_for.desc())
            .limit(1)
        )
        occurrence = (
            _aware(seed).astimezone(UTC)
            if latest is None
            else (
                _aware(latest.scheduled_for).astimezone(UTC)
                if latest.state == "scheduled"
                else _next_occurrence(latest.scheduled_for, campaign.recurrence, campaign.timezone)
            )
        )
        generated = 0
        while occurrence is not None and occurrence <= now and generated < 100:
            existing = session.scalar(
                select(CampaignRun).where(
                    CampaignRun.organization_id == campaign.organization_id,
                    CampaignRun.campaign_id == campaign.id,
                    CampaignRun.scheduled_for == occurrence,
                )
            )
            ready_count = session.scalar(
                select(func.count())
                .select_from(CampaignLead)
                .where(
                    CampaignLead.organization_id == campaign.organization_id,
                    CampaignLead.campaign_id == campaign.id,
                    CampaignLead.approved_at.is_not(None),
                    CampaignLead.state.in_(["approved", "eligible", "retry_due"]),
                )
            ) or 0
            if existing is None:
                run = CampaignRun(
                    organization_id=campaign.organization_id,
                    campaign_id=campaign.id,
                    scheduled_for=occurrence,
                    state="ready",
                    ready_lead_count=ready_count,
                    processed_at=now,
                )
                session.add(run)
            elif existing.state == "scheduled":
                existing.state = "ready"
                existing.ready_lead_count = ready_count
                existing.processed_at = now
            else:
                generated += 1
                occurrence = _next_occurrence(occurrence, campaign.recurrence, campaign.timezone)
                continue
            notify_roles(
                session,
                organization_id=campaign.organization_id,
                notification_type="campaign_run_ready",
                severity="info",
                title="Campaign is ready",
                summary=f"{ready_count} approved lead(s) are ready for operator review.",
                action_url="/campaigns",
                dedupe_key=f"campaign-run:{campaign.id}:{occurrence.isoformat()}",
            )
            runs_ready += 1
            generated += 1
            occurrence = _next_occurrence(occurrence, campaign.recurrence, campaign.timezone)

        if occurrence is not None and occurrence > now:
            future = session.scalar(
                select(CampaignRun).where(
                    CampaignRun.organization_id == campaign.organization_id,
                    CampaignRun.campaign_id == campaign.id,
                    CampaignRun.scheduled_for == occurrence,
                )
            )
            if future is None:
                session.add(
                    CampaignRun(
                        organization_id=campaign.organization_id,
                        campaign_id=campaign.id,
                        scheduled_for=occurrence,
                        state="scheduled",
                        ready_lead_count=0,
                        processed_at=None,
                    )
                )

        leads = session.scalars(
            select(CampaignLead).where(
                CampaignLead.organization_id == campaign.organization_id,
                CampaignLead.campaign_id == campaign.id,
                CampaignLead.approved_at.is_not(None),
            )
        ).all()
        for item in leads:
            calls = session.scalars(
                select(Call)
                .where(
                    Call.organization_id == campaign.organization_id,
                    Call.campaign_id == campaign.id,
                    Call.lead_id == item.lead_id,
                    Call.state != "blocked",
                )
                .order_by(Call.created_at.desc())
            ).all()
            if not calls:
                continue
            latest_call = calls[0]
            if latest_call.outcome not in RETRYABLE_OUTCOMES or latest_call.ended_at is None:
                continue
            contact = session.scalar(
                select(Contact).where(
                    Contact.id == latest_call.contact_id,
                    Contact.organization_id == campaign.organization_id,
                )
            )
            if contact is None:
                continue
            suppressed = session.scalar(
                select(Suppression.id).where(
                    Suppression.organization_id == campaign.organization_id,
                    Suppression.identifier_hash == contact.identifier_hash,
                    Suppression.channel.in_(["browser_voice", "pstn_voice", "all"]),
                    or_(Suppression.expires_at.is_(None), Suppression.expires_at > now),
                )
            )
            if suppressed is not None:
                continue
            if len(calls) >= campaign.max_attempts:
                if item.state != "attempts_exhausted":
                    item.state = "attempts_exhausted"
                    attempts_exhausted += 1
                    notify_roles(
                        session,
                        organization_id=campaign.organization_id,
                        notification_type="campaign_attempts_exhausted",
                        severity="warning",
                        title="Call attempts exhausted",
                        summary="A campaign lead reached its configured attempt limit.",
                        action_url="/campaigns",
                        dedupe_key=f"attempts-exhausted:{campaign.id}:{item.lead_id}",
                    )
                continue
            due_at = _aware(latest_call.ended_at) + timedelta(minutes=campaign.retry_delay_minutes)
            if due_at <= now and item.state != "retry_due":
                item.state = "retry_due"
                retries_ready += 1
                notify_roles(
                    session,
                    organization_id=campaign.organization_id,
                    notification_type="campaign_retry_due",
                    severity="info",
                    title="Call retry is due",
                    summary="A retryable campaign call is ready for operator review.",
                    action_url="/campaigns",
                    dedupe_key=f"retry-due:{latest_call.id}",
                )
    session.commit()
    return ProcessDueResponse(
        runs_ready=runs_ready,
        retries_ready=retries_ready,
        attempts_exhausted=attempts_exhausted,
    )


@router.post("/campaigns/process-due", response_model=ProcessDueResponse)
def process_due(
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> ProcessDueResponse:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=403, detail="Editor role required")
    enforce_rate_limit(
        session,
        identity=f"{auth.organization_id}:{auth.user_id}",
        category="campaign-operations",
        limit=10,
    )
    result = process_due_campaigns(session)
    session.add(
        AuditLog(
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            action="campaign_due_processing_requested",
            target_type="organization",
            target_id=auth.organization_id,
            reason=(
                f"runs_ready={result.runs_ready};retries_ready={result.retries_ready};"
                f"attempts_exhausted={result.attempts_exhausted}"
            ),
            request_id=request.state.request_id,
        )
    )
    session.commit()
    return result


@router.get("/campaigns/{campaign_id}/runs", response_model=list[CampaignRunResponse])
def list_campaign_runs(
    campaign_id: UUID,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> list[CampaignRunResponse]:
    campaign = session.scalar(
        select(Campaign).where(
            Campaign.id == campaign_id, Campaign.organization_id == auth.organization_id
        )
    )
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    rows = session.scalars(
        select(CampaignRun)
        .where(
            CampaignRun.organization_id == auth.organization_id,
            CampaignRun.campaign_id == campaign_id,
        )
        .order_by(CampaignRun.scheduled_for.desc())
    ).all()
    return [_run_response(row) for row in rows]


@router.patch(
    "/campaigns/{campaign_id}/runs/{run_id}", response_model=CampaignRunResponse
)
def update_campaign_run(
    campaign_id: UUID,
    run_id: UUID,
    payload: CampaignRunUpdate,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> CampaignRunResponse:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=403, detail="Editor role required")
    enforce_rate_limit(
        session,
        identity=f"{auth.organization_id}:{auth.user_id}",
        category="campaign-operations",
        limit=10,
    )
    row = session.scalar(
        select(CampaignRun).where(
            CampaignRun.id == run_id,
            CampaignRun.campaign_id == campaign_id,
            CampaignRun.organization_id == auth.organization_id,
        )
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Campaign occurrence not found")
    if row.state in {"completed", "cancelled"}:
        raise HTTPException(status_code=409, detail="Campaign occurrence is already terminal")
    row.state = payload.state
    row.processed_at = datetime.now(UTC)
    session.add(
        AuditLog(
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            action="campaign_occurrence_updated",
            target_type="campaign_run",
            target_id=row.id,
            reason=f"state={row.state}",
            request_id=request.state.request_id,
        )
    )
    session.commit()
    return _run_response(row)


@router.get("/callbacks", response_model=list[CallbackResponse])
def list_callbacks(
    auth: Auth, session: Annotated[Session, Depends(get_session)]
) -> list[CallbackResponse]:
    rows = session.scalars(
        select(CallbackRequest)
        .where(CallbackRequest.organization_id == auth.organization_id)
        .order_by(CallbackRequest.created_at.desc())
    ).all()
    return [_callback_response(row) for row in rows]


@router.patch("/callbacks/{callback_id}", response_model=CallbackResponse)
def update_callback(
    callback_id: UUID,
    payload: CallbackUpdate,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> CallbackResponse:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=403, detail="Editor role required")
    enforce_rate_limit(
        session,
        identity=f"{auth.organization_id}:{auth.user_id}",
        category="callback-operations",
        limit=10,
    )
    row = session.scalar(
        select(CallbackRequest).where(
            CallbackRequest.id == callback_id,
            CallbackRequest.organization_id == auth.organization_id,
        )
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Callback not found")
    if row.status in {"completed", "cancelled"}:
        raise HTTPException(status_code=409, detail="Callback is already terminal")
    if payload.status == "scheduled":
        if payload.scheduled_for is None or _aware(payload.scheduled_for) <= datetime.now(UTC):
            raise HTTPException(status_code=422, detail="Scheduled callback must be in the future")
        row.scheduled_for = _aware(payload.scheduled_for)
    row.status = payload.status
    session.add(
        AuditLog(
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            action="callback_updated",
            target_type="callback_request",
            target_id=row.id,
            reason=f"status={row.status}",
            request_id=request.state.request_id,
        )
    )
    session.commit()
    return _callback_response(row)
