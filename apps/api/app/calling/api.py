from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import Auth
from app.calling.service import ACTIVE_CALL_STATES, request_call
from app.config import Settings, get_settings
from app.db import get_session
from app.jobs.service import IdempotencyConflict
from app.persistence.models import (
    AuditLog,
    Call,
    Campaign,
    CampaignLead,
    ConsentRecord,
    Contact,
    HandoffTask,
    Lead,
    Qualification,
    Workspace,
)
from app.twilio_voice import dispatch_twilio_call, end_twilio_call, provider_mapping

router = APIRouter(prefix="/api/v1", tags=["calling"])


class CallRequest(BaseModel):
    lead_id: UUID
    contact_id: UUID
    campaign_id: UUID
    transport: Literal["browser", "twilio"] = "browser"


class PstnConsentRequest(BaseModel):
    attested: Literal[True]


class CallResponse(BaseModel):
    id: UUID
    attempt_id: UUID
    lead_id: UUID
    contact_id: UUID
    transport: str
    state: str
    eligible: bool
    eligibility_checks: list[dict[str, Any]]
    max_duration_seconds: int
    usage: dict[str, Any]
    outcome: str | None
    created: bool | None = None


class CampaignLeadResponse(BaseModel):
    id: UUID
    lead_id: UUID
    state: str
    approved_at: datetime | None
    approved_by: UUID | None
    owner_id: UUID | None
    contact_id: UUID | None
    latest_call_id: UUID | None
    latest_call_state: str | None
    latest_call_transport: str | None
    latest_call_checks: list[dict[str, Any]]
    disposition: str
    interest: str | None
    handoff_id: UUID | None


class CampaignResponse(BaseModel):
    id: UUID
    name: str
    timezone: str
    daily_budget_inr: Decimal
    status: str
    mode: str
    scheduled_start_at: datetime | None
    recurrence: str
    max_attempts: int
    leads: list[CampaignLeadResponse]


class CampaignCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    mode: Literal["leads_and_calling", "calling_only"] = "leads_and_calling"
    timezone: str = Field(default="Asia/Kolkata", min_length=2, max_length=80)
    scheduled_start_at: datetime | None = None
    recurrence: Literal["once", "daily", "weekly", "monthly"] = "once"
    max_attempts: int = Field(default=1, ge=1, le=5)
    daily_budget_inr: Decimal = Field(default=Decimal("500"), ge=0, le=100_000)


class CampaignUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    timezone: str | None = Field(default=None, min_length=2, max_length=80)
    scheduled_start_at: datetime | None = None
    recurrence: Literal["once", "daily", "weekly", "monthly"] | None = None
    max_attempts: int | None = Field(default=None, ge=1, le=5)
    daily_budget_inr: Decimal | None = Field(default=None, ge=0, le=100_000)
    status: Literal["draft", "active", "paused", "completed"] | None = None


def _call_response(call: Call, *, created: bool | None = None) -> CallResponse:
    decision = call.eligibility_decision
    return CallResponse(
        id=call.id,
        attempt_id=call.attempt_id,
        lead_id=call.lead_id,
        contact_id=call.contact_id,
        transport=call.transport,
        state=call.state,
        eligible=bool(decision.get("eligible")),
        eligibility_checks=list(decision.get("checks", [])),
        max_duration_seconds=call.max_duration_seconds,
        usage=call.usage,
        outcome=call.outcome,
        created=created,
    )


def _campaign_response(
    session: Session, organization_id: UUID, campaign: Campaign
) -> CampaignResponse:
    return CampaignResponse(
        id=campaign.id,
        name=campaign.name,
        timezone=campaign.timezone,
        daily_budget_inr=campaign.daily_budget_inr,
        status=campaign.status,
        mode=campaign.mode,
        scheduled_start_at=campaign.scheduled_start_at,
        recurrence=campaign.recurrence,
        max_attempts=campaign.max_attempts,
        leads=[
            _campaign_lead_response(session, organization_id, item)
            for item in session.scalars(
                select(CampaignLead).where(
                    CampaignLead.organization_id == organization_id,
                    CampaignLead.campaign_id == campaign.id,
                )
            ).all()
        ],
    )


@router.get("/campaigns", response_model=list[CampaignResponse])
def list_campaigns(
    auth: Auth, session: Annotated[Session, Depends(get_session)]
) -> list[CampaignResponse]:
    campaigns = session.scalars(
        select(Campaign)
        .where(Campaign.organization_id == auth.organization_id)
        .order_by(Campaign.created_at)
    ).all()
    return [_campaign_response(session, auth.organization_id, campaign) for campaign in campaigns]


@router.post("/campaigns", response_model=CampaignResponse, status_code=201)
def create_campaign(
    payload: CampaignCreate,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> CampaignResponse:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Editor role required")
    try:
        ZoneInfo(payload.timezone)
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Unknown campaign timezone") from exc
    workspace = session.scalar(
        select(Workspace)
        .where(Workspace.organization_id == auth.organization_id)
        .order_by(Workspace.created_at)
        .limit(1)
    )
    if workspace is None:
        raise HTTPException(status_code=409, detail="Create a workspace first")
    campaign = Campaign(
        organization_id=auth.organization_id,
        workspace_id=workspace.id,
        name=payload.name,
        timezone=payload.timezone,
        daily_budget_inr=payload.daily_budget_inr,
        status="active",
        mode=payload.mode,
        scheduled_start_at=payload.scheduled_start_at,
        recurrence=payload.recurrence,
        max_attempts=payload.max_attempts,
    )
    session.add(campaign)
    session.flush()
    session.add(
        AuditLog(
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            action="campaign_created",
            target_type="campaign",
            target_id=campaign.id,
            reason=f"mode={campaign.mode}; recurrence={campaign.recurrence}",
            request_id=request.state.request_id,
        )
    )
    session.commit()
    return _campaign_response(session, auth.organization_id, campaign)


@router.patch("/campaigns/{campaign_id}", response_model=CampaignResponse)
def update_campaign(
    campaign_id: UUID,
    payload: CampaignUpdate,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> CampaignResponse:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Editor role required")
    campaign = session.scalar(
        select(Campaign).where(
            Campaign.organization_id == auth.organization_id, Campaign.id == campaign_id
        )
    )
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    changes = payload.model_dump(exclude_unset=True)
    timezone = changes.get("timezone")
    if timezone:
        try:
            ZoneInfo(timezone)
        except (KeyError, ValueError) as exc:
            raise HTTPException(status_code=422, detail="Unknown campaign timezone") from exc
    for name, value in changes.items():
        setattr(campaign, name, value)
    session.add(
        AuditLog(
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            action="campaign_updated",
            target_type="campaign",
            target_id=campaign.id,
            reason="Operator updated campaign controls",
            request_id=request.state.request_id,
        )
    )
    session.commit()
    return _campaign_response(session, auth.organization_id, campaign)


@router.get("/campaigns/{campaign_id}/results", response_model=CampaignResponse)
def campaign_results(
    campaign_id: UUID,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> CampaignResponse:
    campaign = session.scalar(
        select(Campaign).where(
            Campaign.organization_id == auth.organization_id, Campaign.id == campaign_id
        )
    )
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return _campaign_response(session, auth.organization_id, campaign)


def _campaign_lead_response(
    session: Session, organization_id: UUID, item: CampaignLead
) -> CampaignLeadResponse:
    lead = session.scalar(
        select(Lead).where(Lead.organization_id == organization_id, Lead.id == item.lead_id)
    )
    contact = None
    if lead and lead.company_id:
        contact = session.scalar(
            select(Contact)
            .where(
                Contact.organization_id == organization_id,
                Contact.company_id == lead.company_id,
                Contact.demo_test_contact.is_(True),
            )
            .order_by(Contact.created_at)
            .limit(1)
        )
    latest_call = session.scalar(
        select(Call)
        .where(
            Call.organization_id == organization_id,
            Call.lead_id == item.lead_id,
            Call.campaign_id == item.campaign_id,
        )
        .order_by(Call.created_at.desc())
        .limit(1)
    )
    qualification = (
        session.scalar(
            select(Qualification).where(
                Qualification.organization_id == organization_id,
                Qualification.call_id == latest_call.id,
            )
        )
        if latest_call
        else None
    )
    handoff = (
        session.scalar(
            select(HandoffTask).where(
                HandoffTask.organization_id == organization_id,
                HandoffTask.call_id == latest_call.id,
            )
        )
        if latest_call
        else None
    )
    if handoff:
        disposition = "follow_up_requested"
    elif qualification and qualification.interest in {"interested", "high", "positive"}:
        disposition = "interested"
    elif latest_call and latest_call.outcome in {"no_answer", "unanswered"}:
        disposition = "unanswered"
    elif latest_call and latest_call.state == "failed":
        disposition = "failed"
    elif latest_call and latest_call.state == "completed":
        disposition = "completed"
    elif item.approved_at:
        disposition = "eligible" if item.state == "eligible" else "approved"
    else:
        disposition = "queued"
    return CampaignLeadResponse(
        id=item.id,
        lead_id=item.lead_id,
        state=item.state,
        approved_at=item.approved_at,
        approved_by=item.approved_by,
        owner_id=item.owner_id,
        contact_id=contact.id if contact else None,
        latest_call_id=latest_call.id if latest_call else None,
        latest_call_state=latest_call.state if latest_call else None,
        latest_call_transport=latest_call.transport if latest_call else None,
        latest_call_checks=(
            list(latest_call.eligibility_decision.get("checks", [])) if latest_call else []
        ),
        disposition=disposition,
        interest=qualification.interest if qualification else None,
        handoff_id=handoff.id if handoff else None,
    )


@router.post(
    "/campaigns/{campaign_id}/leads/{lead_id}",
    response_model=CampaignLeadResponse,
)
def add_campaign_lead(
    campaign_id: UUID,
    lead_id: UUID,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> CampaignLeadResponse:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Editor role required")
    campaign = session.scalar(
        select(Campaign).where(
            Campaign.organization_id == auth.organization_id,
            Campaign.id == campaign_id,
        )
    )
    lead = session.scalar(
        select(Lead).where(Lead.organization_id == auth.organization_id, Lead.id == lead_id)
    )
    if campaign is None or lead is None:
        raise HTTPException(status_code=404, detail="Campaign or actionable lead not found")
    item = session.scalar(
        select(CampaignLead).where(
            CampaignLead.organization_id == auth.organization_id,
            CampaignLead.campaign_id == campaign.id,
            CampaignLead.lead_id == lead.id,
        )
    )
    if item is None:
        item = CampaignLead(
            organization_id=auth.organization_id,
            campaign_id=campaign.id,
            lead_id=lead.id,
            approved_at=None,
            approved_by=None,
            owner_id=auth.user_id,
            state="pending_review",
        )
        session.add(item)
        session.flush()
        session.add(
            AuditLog(
                organization_id=auth.organization_id,
                actor_id=auth.user_id,
                action="lead_added_to_campaign",
                target_type="campaign_lead",
                target_id=item.id,
                reason="Operator queued an actionable lead for review",
                request_id=request.state.request_id,
            )
        )
        session.commit()
    return _campaign_lead_response(session, auth.organization_id, item)


@router.post(
    "/campaigns/{campaign_id}/leads/{lead_id}/approve",
    response_model=CampaignLeadResponse,
)
def approve_campaign_lead(
    campaign_id: UUID,
    lead_id: UUID,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> CampaignLeadResponse:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Editor role required")
    item = session.scalar(
        select(CampaignLead).where(
            CampaignLead.organization_id == auth.organization_id,
            CampaignLead.campaign_id == campaign_id,
            CampaignLead.lead_id == lead_id,
        )
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign lead not found")
    if item.approved_at is None:
        item.approved_at = datetime.now(UTC)
        item.approved_by = auth.user_id
    item.state = "approved"
    session.add(
        AuditLog(
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            action="campaign_lead_approved",
            target_type="campaign_lead",
            target_id=item.id,
            reason="Operator approved the consenting demo lead for eligibility evaluation",
            request_id=request.state.request_id,
        )
    )
    session.commit()
    return _campaign_lead_response(session, auth.organization_id, item)


@router.post("/calls/requests", response_model=CallResponse, status_code=201)
def create_call_request(
    payload: CallRequest,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=200)],
) -> CallResponse:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Editor role required")
    try:
        result = request_call(
            session,
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            lead_id=payload.lead_id,
            contact_id=payload.contact_id,
            campaign_id=payload.campaign_id,
            transport=payload.transport,
            idempotency_key=idempotency_key,
            settings=settings,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except (IdempotencyConflict, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    session.commit()
    return _call_response(result.call, created=result.created)


@router.post("/contacts/{contact_id}/pstn-consent", status_code=204)
def attest_pstn_consent(
    contact_id: UUID,
    payload: PstnConsentRequest,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Editor role required")
    contact = session.scalar(
        select(Contact).where(
            Contact.id == contact_id,
            Contact.organization_id == auth.organization_id,
            Contact.demo_test_contact.is_(True),
        )
    )
    if contact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Verified test contact not found"
        )
    now = datetime.now(UTC)
    existing = session.scalar(
        select(ConsentRecord).where(
            ConsentRecord.organization_id == auth.organization_id,
            ConsentRecord.contact_id == contact.id,
            ConsentRecord.channel == "pstn_voice",
            ConsentRecord.purpose == "hackathon_demo_qualification",
            ConsentRecord.status == "active",
            ConsentRecord.expires_at > now,
        )
    )
    if existing:
        return None
    session.add(
        ConsentRecord(
            organization_id=auth.organization_id,
            contact_id=contact.id,
            channel="pstn_voice",
            purpose="hackathon_demo_qualification",
            scope="single_test_number",
            source="operator_attested_test_participant",
            status="active",
            recorded_at=now,
            expires_at=now + timedelta(hours=24),
        )
    )
    session.add(
        AuditLog(
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            action="pstn_test_consent_attested",
            target_type="contact",
            target_id=contact.id,
            reason="Operator attested consent for one hackathon PSTN test number",
            request_id=request.state.request_id,
        )
    )
    session.commit()


@router.post("/calls/{call_id}/dispatch", response_model=CallResponse)
def dispatch_call(
    call_id: UUID,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CallResponse:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Editor role required")
    call = session.scalar(
        select(Call).where(Call.id == call_id, Call.organization_id == auth.organization_id)
    )
    if call is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found")
    if call.transport != "twilio":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Call is not PSTN")
    try:
        dispatch_twilio_call(session, call=call, settings=settings)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Twilio rejected the outbound call request",
        ) from exc
    session.add(
        AuditLog(
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            action="pstn_call_dispatched",
            target_type="call",
            target_id=call.id,
            reason="Eligible consent-gated test call dispatched through Twilio",
            request_id=request.state.request_id,
        )
    )
    session.commit()
    return _call_response(call)


@router.get("/calls/{call_id}", response_model=CallResponse)
def get_call(
    call_id: UUID,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> CallResponse:
    call = session.scalar(
        select(Call).where(Call.id == call_id, Call.organization_id == auth.organization_id)
    )
    if call is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found")
    return _call_response(call)


@router.post("/calls/{call_id}/stop", response_model=CallResponse)
def stop_call(
    call_id: UUID,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CallResponse:
    call = session.scalar(
        select(Call).where(Call.id == call_id, Call.organization_id == auth.organization_id)
    )
    if call is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found")
    if call.state in ACTIVE_CALL_STATES or call.state == "requested":
        call.state = "ending"
        call.outcome = "stop_requested"
        session.commit()
        mapping = provider_mapping(session, call_id=call.id) if call.transport == "twilio" else None
        if mapping:
            try:
                end_twilio_call(settings, provider_call_sid=mapping.external_id)
            except Exception as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail="Stop was recorded, but Twilio did not confirm hangup",
                ) from exc
    return _call_response(call)
