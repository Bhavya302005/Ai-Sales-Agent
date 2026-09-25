from __future__ import annotations

import hashlib
import hmac
import json
import re
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any
from urllib.parse import urljoin
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import Auth
from app.booking_followups.service import provider_event_id, queue_booking_link
from app.config import Settings, get_settings
from app.db import get_session
from app.jobs.service import process_event
from app.notifications import notify_roles
from app.persistence.models import (
    AuditLog,
    BookingFollowup,
    Call,
    CallbackRequest,
    Contact,
    HandoffTask,
    OutboxEvent,
    ProviderWebhookEvent,
    Suppression,
)
from app.twilio_voice import validate_twilio_request

router = APIRouter(prefix="/api/v1", tags=["booking-followups"])
MAX_WEBHOOK_BYTES = 256 * 1024
WEBHOOK_TOLERANCE_SECONDS = 180


class OmniDimBookingToolRequest(BaseModel):
    call_id: UUID
    sms_consent_confirmed: bool
    retry_consent_confirmed: bool


class OmniDimBookingToolResponse(BaseModel):
    followup_id: UUID
    status: str
    delivery_status: str
    safe_agent_message: str


class BookingIntegrationStatus(BaseModel):
    calendly_configured: bool
    sms_mode: str
    sms_live: bool
    scheduler_mode: str
    retry_delay_minutes: int
    demo_mode: bool


@router.get("/booking-followups/status", response_model=BookingIntegrationStatus)
def booking_integration_status(
    auth: Auth, settings: Annotated[Settings, Depends(get_settings)]
) -> BookingIntegrationStatus:
    del auth
    return BookingIntegrationStatus(
        calendly_configured=bool(
            settings.calendly_access_token
            and settings.calendly_event_type_uri
            and settings.calendly_organization_uri
            and settings.calendly_webhook_signing_key
            and settings.public_api_base_url
        ),
        sms_mode=settings.sms_mode,
        sms_live=settings.sms_mode in {"twilio", "textbee"},
        scheduler_mode=settings.booking_scheduler_mode,
        retry_delay_minutes=(
            2 if settings.booking_demo_mode else settings.booking_retry_delay_minutes
        ),
        demo_mode=settings.booking_demo_mode,
    )


def _safe_agent_message(followup: BookingFollowup) -> str:
    if followup.delivery_status == "sent":
        return "The booking link was sent by text. Do not read the URL aloud."
    if followup.delivery_status == "simulated":
        return (
            "The booking link was prepared, but text delivery is in simulated mode. "
            "Do not claim that a text was sent."
        )
    if followup.status == "action_required":
        return "The link could not be sent automatically. A human will follow up."
    return "The booking-link message is queued. Do not claim delivery yet."


def _verify_tool_secret(provided: str | None, settings: Settings) -> None:
    if settings.omnidim_tool_secret is None:
        raise HTTPException(status_code=503, detail="OmniDimension booking tool is not configured")
    expected = settings.omnidim_tool_secret.get_secret_value()
    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=401, detail="Invalid provider tool authentication")


@router.post(
    "/provider-tools/omnidim/send-booking-link",
    response_model=OmniDimBookingToolResponse,
)
def send_booking_link(
    payload: OmniDimBookingToolRequest,
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    tool_secret: Annotated[str | None, Header(alias="X-Omnidim-Tool-Secret")] = None,
) -> OmniDimBookingToolResponse:
    _verify_tool_secret(tool_secret, settings)
    call = session.scalar(select(Call).where(Call.id == payload.call_id))
    if call is None:
        raise HTTPException(status_code=404, detail="Call not found")
    try:
        queued = queue_booking_link(
            session,
            call=call,
            settings=settings,
            sms_consent_confirmed=payload.sms_consent_confirmed,
            retry_consent_confirmed=payload.retry_consent_confirmed,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if queued.created:
        session.add(
            AuditLog(
                organization_id=call.organization_id,
                actor_id=None,
                action="calendly_booking_link_requested",
                target_type="booking_followup",
                target_id=queued.followup.id,
                reason=(
                    f"sms_mode={settings.sms_mode};retry_consent={payload.retry_consent_confirmed}"
                ),
                request_id=request.state.request_id,
            )
        )
    session.commit()
    event_id = queued.event_id
    if event_id is None and queued.followup.status == "delivery_pending":
        event_id = session.scalar(
            select(OutboxEvent.event_id).where(
                OutboxEvent.organization_id == call.organization_id,
                OutboxEvent.aggregate_type == "booking_followup",
                OutboxEvent.aggregate_id == queued.followup.id,
                OutboxEvent.state.in_(["pending", "retry_wait"]),
            )
        )
    if event_id and settings.async_mode == "inline":
        process_event(session, event_id)
    elif event_id and settings.async_mode == "celery" and queued.created:
        from app.worker import process_outbox_event

        process_outbox_event.delay(str(event_id))
    session.refresh(queued.followup)
    return OmniDimBookingToolResponse(
        followup_id=queued.followup.id,
        status=queued.followup.status,
        delivery_status=queued.followup.delivery_status,
        safe_agent_message=_safe_agent_message(queued.followup),
    )


def verify_calendly_signature(
    *, body: bytes, header: str | None, secret: str, now: datetime
) -> None:
    values: dict[str, str] = {}
    for item in (header or "").split(","):
        key, separator, value = item.partition("=")
        if separator:
            values[key.strip()] = value.strip()
    timestamp_text = values.get("t")
    supplied = values.get("v1")
    if not timestamp_text or not supplied:
        raise ValueError("Missing Calendly webhook signature")
    try:
        timestamp = int(timestamp_text)
    except ValueError as exc:
        raise ValueError("Invalid Calendly webhook timestamp") from exc
    if abs(int(now.timestamp()) - timestamp) > WEBHOOK_TOLERANCE_SECONDS:
        raise ValueError("Expired Calendly webhook signature")
    expected = hmac.new(
        secret.encode(), timestamp_text.encode() + b"." + body, hashlib.sha256
    ).hexdigest()
    if not hmac.compare_digest(supplied, expected):
        raise ValueError("Invalid Calendly webhook signature")


def _scheduled_start(payload: dict[str, Any]) -> datetime | None:
    scheduled_event = payload.get("scheduled_event")
    raw = scheduled_event.get("start_time") if isinstance(scheduled_event, dict) else None
    if not isinstance(raw, str):
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


@router.post("/webhooks/calendly", status_code=status.HTTP_204_NO_CONTENT)
async def calendly_webhook(
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    if settings.calendly_webhook_signing_key is None:
        raise HTTPException(status_code=503, detail="Calendly webhook is not configured")
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_WEBHOOK_BYTES:
        raise HTTPException(status_code=413, detail="Webhook payload is too large")
    body = await request.body()
    if len(body) > MAX_WEBHOOK_BYTES:
        raise HTTPException(status_code=413, detail="Webhook payload is too large")
    try:
        verify_calendly_signature(
            body=body,
            header=request.headers.get("Calendly-Webhook-Signature"),
            secret=settings.calendly_webhook_signing_key.get_secret_value(),
            now=datetime.now(UTC),
        )
        envelope = json.loads(body)
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=401, detail="Invalid Calendly webhook") from exc
    event_name = envelope.get("event")
    payload = envelope.get("payload")
    created_at = envelope.get("created_at")
    if event_name not in {"invitee.created", "invitee.canceled"} or not isinstance(payload, dict):
        return Response(status_code=204)
    tracking = payload.get("tracking")
    correlation = tracking.get("utm_content") if isinstance(tracking, dict) else None
    if not isinstance(correlation, str) or not correlation:
        return Response(status_code=204)
    followup = session.scalar(
        select(BookingFollowup)
        .where(BookingFollowup.correlation_token == correlation)
        .with_for_update()
    )
    if followup is None:
        return Response(status_code=204)
    invitee_uri = str(payload.get("uri") or "")[:500]
    event_id = provider_event_id(str(event_name), str(created_at or ""), invitee_uri, body)
    existing = session.scalar(
        select(ProviderWebhookEvent).where(
            ProviderWebhookEvent.provider == "calendly",
            ProviderWebhookEvent.provider_event_id == event_id,
        )
    )
    if existing:
        return Response(status_code=204)
    webhook_event = ProviderWebhookEvent(
        organization_id=followup.organization_id,
        provider="calendly",
        provider_event_id=event_id,
        payload_hash=hashlib.sha256(body).hexdigest(),
        status="processing",
    )
    session.add(webhook_event)
    now = datetime.now(UTC)
    scheduled_event = payload.get("scheduled_event")
    event_uri = (
        str(scheduled_event.get("uri") or "")[:500]
        if isinstance(scheduled_event, dict)
        else str(payload.get("event") or "")[:500]
    )
    if event_name == "invitee.created":
        followup.status = "booked"
        followup.booked_at = now
        followup.canceled_at = None
        followup.calendly_invitee_uri = invitee_uri or None
        followup.calendly_event_uri = event_uri or None
        followup.scheduled_start_at = _scheduled_start(payload)
        followup.last_error_code = None
        if followup.callback_request_id:
            callback = session.scalar(
                select(CallbackRequest).where(
                    CallbackRequest.organization_id == followup.organization_id,
                    CallbackRequest.id == followup.callback_request_id,
                )
            )
            if callback:
                callback.status = "scheduled"
                callback.scheduled_for = followup.scheduled_start_at
        if followup.handoff_id:
            handoff = session.scalar(
                select(HandoffTask).where(
                    HandoffTask.organization_id == followup.organization_id,
                    HandoffTask.id == followup.handoff_id,
                )
            )
            if handoff:
                handoff.state = "scheduled"
        if followup.retry_call_id:
            retry_call = session.scalar(
                select(Call).where(
                    Call.organization_id == followup.organization_id,
                    Call.id == followup.retry_call_id,
                    Call.state.in_(["requested", "eligible"]),
                )
            )
            if retry_call:
                retry_call.state = "blocked"
                retry_call.outcome = "booking_completed_before_retry"
                retry_call.usage = {**retry_call.usage, "reservation_status": "released"}
        notify_roles(
            session,
            organization_id=followup.organization_id,
            notification_type="calendly_booking_created",
            severity="success",
            title="Calendly meeting booked",
            summary="A lead booked a human follow-up from the tracked link.",
            action_url=f"/calls/{followup.call_id}",
            dedupe_key=f"calendly-booked:{followup.id}:{event_id}",
        )
    elif not bool(payload.get("rescheduled")):
        followup.status = "canceled"
        followup.canceled_at = now
        if followup.retry_count == 0:
            contact = session.scalar(
                select(Contact).where(
                    Contact.organization_id == followup.organization_id,
                    Contact.id == followup.contact_id,
                )
            )
            demo_delay = bool(settings.booking_demo_mode and contact and contact.demo_test_contact)
            delay = 2 if demo_delay else settings.booking_retry_delay_minutes + 5
            followup.booking_check_at = now + timedelta(minutes=delay)
        if followup.callback_request_id:
            callback = session.scalar(
                select(CallbackRequest).where(
                    CallbackRequest.organization_id == followup.organization_id,
                    CallbackRequest.id == followup.callback_request_id,
                )
            )
            if callback and followup.retry_count == 0:
                callback.status = "awaiting_confirmation"
                callback.scheduled_for = None
    webhook_event.status = "processed"
    webhook_event.processed_at = now
    session.commit()
    return Response(status_code=204)


STOP_KEYWORDS = {"STOP", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"}


@router.post("/webhooks/twilio/sms")
async def twilio_sms_webhook(
    request: Request,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> Response:
    """Honor provider-authenticated SMS opt-outs without retaining message contents."""
    if settings.sms_mode != "twilio" or not settings.public_api_base_url:
        raise HTTPException(status_code=503, detail="Live SMS is not configured")
    form = dict(await request.form())
    callback_url = urljoin(
        settings.public_api_base_url.rstrip("/") + "/",
        "api/v1/webhooks/twilio/sms",
    )
    if not validate_twilio_request(
        settings,
        url=callback_url,
        params=form,
        signature=request.headers.get("X-Twilio-Signature"),
    ):
        raise HTTPException(status_code=401, detail="Invalid Twilio signature")
    keyword = str(form.get("Body") or "").strip().upper()
    sender = re.sub(r"[^\d+]", "", str(form.get("From") or "").strip())
    if keyword in STOP_KEYWORDS and re.fullmatch(r"\+[1-9]\d{7,14}", sender):
        identifier_hash = hashlib.sha256(sender.encode()).hexdigest()
        contacts = session.scalars(
            select(Contact).where(Contact.identifier_hash == identifier_hash)
        ).all()
        for contact in contacts:
            existing = session.scalar(
                select(Suppression).where(
                    Suppression.organization_id == contact.organization_id,
                    Suppression.channel == "sms",
                    Suppression.identifier_hash == identifier_hash,
                    Suppression.scope == "all_sms",
                )
            )
            if existing is None:
                session.add(
                    Suppression(
                        organization_id=contact.organization_id,
                        channel="sms",
                        identifier_hash=identifier_hash,
                        reason="provider_stop_keyword",
                        scope="all_sms",
                        expires_at=None,
                    )
                )
        session.commit()
    return Response(
        content='<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        media_type="application/xml",
    )
