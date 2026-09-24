from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import Auth
from app.calling.service import ACTIVE_CALL_STATES, request_call
from app.config import Settings, get_settings
from app.contact_secrets import is_dialable_phone_ref
from app.db import get_session
from app.jobs.service import IdempotencyConflict
from app.omnidim_voice import (
    OmniDimClient,
    OmniDimPermanentError,
    OmniDimRetryableError,
    dispatch_omnidim_call,
)
from app.omnidim_voice import (
    provider_mapping as omnidim_provider_mapping,
)
from app.outcomes.service import finalize_completed_call
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
    TranscriptSegment,
    Workspace,
)
from app.rate_limits import enforce_rate_limit
from app.twilio_voice import dispatch_twilio_call, end_twilio_call, provider_mapping

router = APIRouter(prefix="/api/v1", tags=["calling"])


class CallRequest(BaseModel):
    lead_id: UUID
    contact_id: UUID
    campaign_id: UUID
    transport: Literal["browser", "twilio", "omnidim"] = "browser"


class CallingProviderResponse(BaseModel):
    transport: str
    pstn_configured: bool
    label: str


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
    retry_delay_minutes: int
    leads: list[CampaignLeadResponse]


class CampaignCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    mode: Literal["leads_and_calling", "calling_only"] = "leads_and_calling"
    timezone: str = Field(default="Asia/Kolkata", min_length=2, max_length=80)
    scheduled_start_at: datetime | None = None
    recurrence: Literal["once", "daily", "weekly", "monthly"] = "once"
    max_attempts: int = Field(default=1, ge=1, le=5)
    retry_delay_minutes: int = Field(default=60, ge=5, le=1440)
    daily_budget_inr: Decimal = Field(default=Decimal("500"), ge=0, le=100_000)


class CampaignUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    timezone: str | None = Field(default=None, min_length=2, max_length=80)
    scheduled_start_at: datetime | None = None
    recurrence: Literal["once", "daily", "weekly", "monthly"] | None = None
    max_attempts: int | None = Field(default=None, ge=1, le=5)
    retry_delay_minutes: int | None = Field(default=None, ge=5, le=1440)
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
        retry_delay_minutes=campaign.retry_delay_minutes,
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
        retry_delay_minutes=payload.retry_delay_minutes,
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


def _affirmative_provider_handoff(values: dict[str, Any]) -> bool:
    accepted = {"yes", "true", "interested", "positive", "requested", "confirmed"}
    for key in ("interest", "interested", "follow_up", "callback_requested"):
        value = values.get(key)
        if isinstance(value, bool) and value:
            return True
        if isinstance(value, str) and value.strip().casefold() in accepted:
            return True
    return False


def _sync_single_omnidim_call(
    session: Session,
    call: Call,
    settings: Settings,
    organization_id: UUID,
) -> bool:
    if call.transport != "omnidim":
        return False
    mapping = omnidim_provider_mapping(session, call_id=call.id)
    if mapping is None:
        return False
    provider = OmniDimClient(settings)
    try:
        result = provider.result(mapping.external_id)
    except Exception:
        return False
    finally:
        provider.close()
    if result is None:
        return False
    terminal = result.status in {"completed", "busy", "failed", "no_answer"}
    if terminal and not session.scalar(
        select(TranscriptSegment.id).where(
            TranscriptSegment.organization_id == organization_id,
            TranscriptSegment.call_id == call.id,
        )
    ):
        sequence = 1
        for interaction in result.interactions[:100]:
            if not isinstance(interaction, dict):
                continue
            for speaker, key in (("participant", "user_query"), ("agent", "bot_response")):
                text = str(interaction.get(key) or "").strip()
                if not text:
                    continue
                session.add(
                    TranscriptSegment(
                        organization_id=organization_id,
                        call_id=call.id,
                        sequence=sequence,
                        speaker=speaker,
                        started_ms=(sequence - 1) * 1000,
                        ended_ms=sequence * 1000,
                        text=text[:5000],
                        language="en-IN",
                        is_final=True,
                    )
                )
                sequence += 1
    call.usage = {
        **call.usage,
        "provider_status": result.status,
        "duration_seconds": result.duration_seconds,
        "provider_reported_estimated_cost": result.estimated_cost,
        "provider_sentiment": result.sentiment,
        "provider_summary": result.summary,
        "provider_recording_available": result.recording_url is not None,
        "provider_recording_url": result.recording_url,
        "reservation_status": "released" if terminal else "reserved",
    }
    if result.status == "completed":
        call.state = "completed"
        call.ended_at = call.ended_at or datetime.now(UTC)
        call.outcome = (
            "handoff_requested"
            if _affirmative_provider_handoff(result.extracted_variables)
            else "completed"
        )
        session.flush()
        finalize_completed_call(
            session,
            organization_id=organization_id,
            call_id=call.id,
        )
    elif result.status in {"busy", "no_answer"}:
        call.state = "failed"
        call.ended_at = call.ended_at or datetime.now(UTC)
        call.outcome = result.status
    elif result.status == "failed":
        call.state = "failed"
        call.ended_at = call.ended_at or datetime.now(UTC)
        call.outcome = "temporary_provider_failure"
    else:
        call.state = "active"
        call.started_at = call.started_at or datetime.now(UTC)
    session.commit()
    return True


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
                Contact.channel == "phone",
                Contact.identifier_encrypted_ref.is_not(None),
                ~Contact.identifier_encrypted_ref.like("redacted:%"),
            )
            .order_by(Contact.demo_test_contact.desc(), Contact.created_at.desc())
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
    if latest_call and latest_call.transport == "omnidim" and latest_call.state in {"connecting", "active", "ending"}:
        try:
            _sync_single_omnidim_call(session, latest_call, get_settings(), organization_id)
            session.refresh(latest_call)
        except Exception:
            pass
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
            reason="Operator approved the lead for outreach eligibility evaluation",
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
    enforce_rate_limit(
        session, identity=f"{auth.organization_id}:{auth.user_id}", category="call-action", limit=10
    )
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
            Contact.channel == "phone",
        )
    )
    if contact is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Phone contact not found"
        )
    if not is_dialable_phone_ref(contact.identifier_encrypted_ref):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Contact number is not securely available; re-import this contact",
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
            scope="single_operator_confirmed_number",
            source="operator_attested_contact_consent",
            status="active",
            recorded_at=now,
            expires_at=now + timedelta(hours=24),
        )
    )
    session.add(
        AuditLog(
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            action="outbound_call_consent_attested",
            target_type="contact",
            target_id=contact.id,
            reason="Operator attested contact consent for the outbound call",
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
    enforce_rate_limit(
        session, identity=f"{auth.organization_id}:{auth.user_id}", category="call-action", limit=10
    )
    call = session.scalar(
        select(Call).where(Call.id == call_id, Call.organization_id == auth.organization_id)
    )
    if call is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Call not found")
    if call.transport not in {"twilio", "omnidim"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Call is not PSTN")
    try:
        if call.transport == "twilio":
            dispatch_twilio_call(session, call=call, settings=settings)
        else:
            dispatch_omnidim_call(session, call=call, settings=settings)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"{call.transport} rejected the outbound call request",
        ) from exc
    session.add(
        AuditLog(
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            action="pstn_call_dispatched",
            target_type="call",
            target_id=call.id,
            reason=f"Eligible consent-gated test call dispatched through {call.transport}",
            request_id=request.state.request_id,
        )
    )
    session.commit()
    return _call_response(call)


@router.get("/calling/provider", response_model=CallingProviderResponse)
def calling_provider(
    auth: Auth, settings: Annotated[Settings, Depends(get_settings)]
) -> CallingProviderResponse:
    del auth
    configured = (
        bool(
            settings.omnidim_api_key
            and settings.omnidim_agent_id
            and settings.omnidim_test_to_number
            and settings.enable_outbound_pstn
        )
        if settings.voice_transport == "omnidim"
        else bool(
            settings.twilio_account_sid
            and settings.twilio_auth_token
            and settings.twilio_from_number
            and settings.twilio_test_to_number
            and settings.public_voice_base_url
            and settings.enable_outbound_pstn
        )
        if settings.voice_transport == "twilio"
        else False
    )
    return CallingProviderResponse(
        transport=settings.voice_transport,
        pstn_configured=configured,
        label=(
            "OmniDimension outbound AI calling"
            if settings.voice_transport == "omnidim"
            else "Twilio ConversationRelay"
            if settings.voice_transport == "twilio"
            else "Browser voice diagnostics"
        ),
    )


@router.post("/calls/{call_id}/refresh", response_model=CallResponse)
def refresh_provider_call(
    call_id: UUID,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CallResponse:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=403, detail="Editor role required")
    enforce_rate_limit(
        session, identity=f"{auth.organization_id}:{auth.user_id}", category="call-action", limit=10
    )
    call = session.scalar(
        select(Call).where(Call.id == call_id, Call.organization_id == auth.organization_id)
    )
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    if call.transport != "omnidim":
        raise HTTPException(status_code=409, detail="Call does not use OmniDimension")
    _sync_single_omnidim_call(session, call, settings, auth.organization_id)
    session.refresh(call)
    return _call_response(call)


@router.get("/calls/{call_id}/recording")
def get_provider_recording(
    call_id: UUID,
    auth: Auth,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    call = session.scalar(
        select(Call).where(Call.id == call_id, Call.organization_id == auth.organization_id)
    )
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    if call.transport != "omnidim":
        raise HTTPException(status_code=409, detail="Recording is not provided by OmniDimension")
    # Use cached URL from usage blob first (avoids re-fetching call logs)
    recording_url = call.usage.get("provider_recording_url") if isinstance(call.usage, dict) else None
    if not recording_url or not isinstance(recording_url, str) or not recording_url.startswith("https://"):
        # Fall back: re-fetch from OmniDimension
        mapping = omnidim_provider_mapping(session, call_id=call.id)
        if mapping is None:
            raise HTTPException(status_code=409, detail="Call has not been dispatched")
        provider = OmniDimClient(settings)
        try:
            result = provider.result(mapping.external_id)
        except OmniDimPermanentError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except OmniDimRetryableError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
        finally:
            provider.close()
        if result is None or result.recording_url is None:
            raise HTTPException(status_code=404, detail="Recording is not available yet")
        recording_url = result.recording_url
        call.usage = {**call.usage, "provider_recording_url": recording_url}
        session.commit()
    # Proxy the audio bytes so the browser avoids cross-origin CORS restrictions
    import httpx as _httpx
    try:
        resp = _httpx.get(recording_url, timeout=_httpx.Timeout(30, connect=5), follow_redirects=True)
        resp.raise_for_status()
    except _httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Recording temporarily unavailable") from exc
    content_type = resp.headers.get("content-type", "audio/mpeg").split(";")[0].strip()
    if not content_type.startswith("audio/"):
        content_type = "audio/mpeg"
    
    audio_bytes = resp.content
    total_bytes = len(audio_bytes)
    range_header = request.headers.get("range")

    if range_header and range_header.startswith("bytes="):
        try:
            parts = range_header.replace("bytes=", "").split("-")
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if len(parts) > 1 and parts[1] else total_bytes - 1
            if 0 <= start < total_bytes:
                end = min(end, total_bytes - 1)
                chunk = audio_bytes[start : end + 1]
                return Response(
                    content=chunk,
                    status_code=206,
                    media_type=content_type,
                    headers={
                        "Content-Range": f"bytes {start}-{end}/{total_bytes}",
                        "Accept-Ranges": "bytes",
                        "Content-Length": str(len(chunk)),
                        "Cache-Control": "private, max-age=3600",
                        "Content-Disposition": "inline",
                    },
                )
        except Exception:
            pass

    return Response(
        content=audio_bytes,
        status_code=200,
        media_type=content_type,
        headers={
            "Content-Length": str(total_bytes),
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, max-age=3600",
            "Content-Disposition": "inline",
        },
    )


@router.get("/calls/{call_id}", response_model=CallResponse)
def get_call(
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
    if call.transport == "omnidim" and call.state in {"connecting", "active", "ending"}:
        try:
            _sync_single_omnidim_call(session, call, settings, auth.organization_id)
            session.refresh(call)
        except Exception:
            pass
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
    if call.transport == "omnidim" and call.state in ACTIVE_CALL_STATES:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "OmniDimension does not expose an individual hangup endpoint; "
                "stop the live call from its dashboard"
            ),
        )
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
