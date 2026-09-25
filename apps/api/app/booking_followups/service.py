from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.booking_followups.providers import CalendlyClient, sms_sender
from app.calling.service import request_call
from app.config import Settings
from app.contact_secrets import resolve_phone_number
from app.jobs.service import enqueue_once
from app.notifications import notify_roles
from app.omnidim_voice import dispatch_omnidim_call
from app.persistence.models import (
    BookingFollowup,
    Call,
    CallbackRequest,
    CampaignLead,
    ConsentRecord,
    Contact,
    ExternalMapping,
    HandoffTask,
    Membership,
    Suppression,
)


@dataclass(frozen=True)
class BookingQueueResult:
    followup: BookingFollowup
    created: bool
    event_id: UUID | None


@dataclass(frozen=True)
class BookingRetryResult:
    dispatched: int = 0
    action_required: int = 0


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _active_suppression(
    session: Session, *, organization_id: UUID, contact: Contact, channel: str, now: datetime
) -> bool:
    return (
        session.scalar(
            select(Suppression.id).where(
                Suppression.organization_id == organization_id,
                Suppression.identifier_hash == contact.identifier_hash,
                Suppression.channel.in_([channel, "all"]),
                or_(Suppression.expires_at.is_(None), Suppression.expires_at > now),
            )
        )
        is not None
    )


def _record_consent(
    session: Session,
    *,
    call: Call,
    purpose: str,
    channel: str,
    scope: str,
    expires_at: datetime,
) -> None:
    existing = session.scalar(
        select(ConsentRecord).where(
            ConsentRecord.organization_id == call.organization_id,
            ConsentRecord.contact_id == call.contact_id,
            ConsentRecord.channel == channel,
            ConsentRecord.purpose == purpose,
            ConsentRecord.status == "active",
            ConsentRecord.expires_at > datetime.now(UTC),
        )
    )
    if existing is None:
        session.add(
            ConsentRecord(
                organization_id=call.organization_id,
                contact_id=call.contact_id,
                channel=channel,
                purpose=purpose,
                scope=scope,
                source="explicit_in_call_confirmation",
                status="active",
                recorded_at=datetime.now(UTC),
                expires_at=expires_at,
            )
        )


def queue_booking_link(
    session: Session,
    *,
    call: Call,
    settings: Settings,
    sms_consent_confirmed: bool,
    retry_consent_confirmed: bool,
) -> BookingQueueResult:
    if not sms_consent_confirmed:
        raise ValueError("Explicit SMS consent is required")
    if settings.sms_mode == "disabled":
        raise ValueError("SMS delivery is disabled")
    if not settings.calendly_access_token or not settings.calendly_event_type_uri:
        raise ValueError("Calendly is not configured")
    mapping = session.scalar(
        select(ExternalMapping).where(
            ExternalMapping.organization_id == call.organization_id,
            ExternalMapping.provider == "omnidim",
            ExternalMapping.local_type == "call",
            ExternalMapping.local_id == call.id,
            ExternalMapping.external_type == "call_request",
        )
    )
    if mapping is None or call.transport != "omnidim" or call.state not in {"connecting", "active"}:
        raise ValueError("Booking tools require an active mapped OmniDimension call")
    existing = session.scalar(
        select(BookingFollowup).where(
            BookingFollowup.organization_id == call.organization_id,
            or_(BookingFollowup.call_id == call.id, BookingFollowup.retry_call_id == call.id),
        )
    )
    if existing is not None:
        return BookingQueueResult(existing, False, None)
    contact = session.scalar(
        select(Contact).where(
            Contact.organization_id == call.organization_id,
            Contact.id == call.contact_id,
        )
    )
    if contact is None:
        raise LookupError("Call contact not found")
    now = datetime.now(UTC)
    if _active_suppression(
        session,
        organization_id=call.organization_id,
        contact=contact,
        channel="sms",
        now=now,
    ):
        raise ValueError("This contact is suppressed for SMS")
    _record_consent(
        session,
        call=call,
        purpose="calendly_booking_link",
        channel="sms",
        scope="one_calendly_booking_link",
        expires_at=now + timedelta(hours=48),
    )
    if retry_consent_confirmed:
        _record_consent(
            session,
            call=call,
            purpose="calendly_booking_retry",
            channel="pstn_voice",
            scope="one_retry_within_48_hours",
            expires_at=now + timedelta(hours=48),
        )
    followup = BookingFollowup(
        organization_id=call.organization_id,
        call_id=call.id,
        campaign_id=call.campaign_id,
        contact_id=call.contact_id,
        correlation_token=uuid4().hex,
        delivery_mode=settings.sms_mode,
        delivery_status="pending",
        status="delivery_pending",
        retry_consent_confirmed=retry_consent_confirmed,
        retry_count=0,
    )
    session.add(followup)
    session.flush()
    queued = enqueue_once(
        session,
        organization_id=call.organization_id,
        actor_id=call.attempt_id,
        route="POST:/api/v1/provider-tools/omnidim/send-booking-link",
        idempotency_key=f"booking-link:{call.id}",
        event_type="booking.link_send_requested.v1",
        aggregate_type="booking_followup",
        aggregate_id=followup.id,
        payload_ref=f"booking_followup:{followup.id}",
    )
    return BookingQueueResult(followup, True, queued.event.event_id)


def process_link_send(
    session: Session,
    *,
    organization_id: UUID,
    followup_id: UUID,
    settings: Settings,
) -> None:
    followup = session.scalar(
        select(BookingFollowup)
        .where(
            BookingFollowup.organization_id == organization_id,
            BookingFollowup.id == followup_id,
        )
        .with_for_update()
    )
    if followup is None:
        raise LookupError("Booking follow-up does not exist")
    if followup.delivery_status in {"sent", "simulated"}:
        return
    contact = session.scalar(
        select(Contact).where(
            Contact.organization_id == organization_id,
            Contact.id == followup.contact_id,
        )
    )
    if contact is None:
        raise LookupError("Booking contact does not exist")
    now = datetime.now(UTC)
    if _active_suppression(
        session,
        organization_id=organization_id,
        contact=contact,
        channel="sms",
        now=now,
    ):
        followup.delivery_status = "suppressed"
        followup.status = "action_required"
        followup.last_error_code = "sms_suppressed"
        return
    if not followup.calendly_link:
        calendly = CalendlyClient(settings)
        try:
            followup.calendly_link = calendly.create_single_use_link(
                correlation_token=followup.correlation_token
            )
        finally:
            calendly.close()
        # Calendly does not accept our idempotency key. Persist the one provider-created
        # URL before the independently retryable SMS step so a worker restart cannot mint
        # a second link for the same call.
        session.commit()
        followup = session.scalar(
            select(BookingFollowup)
            .where(
                BookingFollowup.organization_id == organization_id,
                BookingFollowup.id == followup_id,
            )
            .with_for_update()
        )
        if followup is None:
            raise LookupError("Booking follow-up no longer exists")
    destination = (
        "redacted-demo-destination"
        if settings.sms_mode == "mock"
        else resolve_phone_number(contact.identifier_encrypted_ref, settings)
    )
    company_name = settings.email_from_name or "us"
    delivery = sms_sender(settings).send(
        destination=destination,
        body=(
            f"Thanks for speaking with {company_name}. Book a preferred time with our team: "
            f"{followup.calendly_link} Reply STOP to stop messages."
        ),
        idempotency_key=str(followup.id),
    )
    
    # Try sending via Email as well if we have an email address for this lead
    try:
        from app.email_outreach.models import EmailOutreachDraft
        from app.email_outreach.sender import send_email
        from app.persistence.models import FieldAssertion
        import asyncio
        
        call_obj = session.scalar(select(Call).where(Call.id == followup.call_id))
        if call_obj and call_obj.lead_id:
            recipient_email = None
            
            # First check FieldAssertion (which is where the CSV import saves the email)
            email_assertion = session.scalar(
                select(FieldAssertion)
                .where(
                    FieldAssertion.organization_id == organization_id,
                    FieldAssertion.entity_type == "lead",
                    FieldAssertion.entity_id == call_obj.lead_id,
                    FieldAssertion.field_name == "email",
                )
                .order_by(FieldAssertion.observed_at.desc())
            )
            if email_assertion and email_assertion.value:
                recipient_email = email_assertion.value.get("email")
                
            # Fallback to checking EmailOutreachDraft if the user manually entered it there
            if not recipient_email:
                draft = session.scalar(
                    select(EmailOutreachDraft)
                    .where(
                        EmailOutreachDraft.organization_id == organization_id,
                        EmailOutreachDraft.lead_id == call_obj.lead_id,
                    )
                    .order_by(EmailOutreachDraft.created_at.desc())
                )
                if draft:
                    recipient_email = draft.recipient_email
                    
            if recipient_email:
                greeting = f"Hello {contact.display_name.split()[0]}," if contact and contact.display_name else "Hello,"
                company_name = settings.email_from_name or "us"
                body_html = (
                    f"<p>{greeting}</p>"
                    f"<p>Thanks for speaking with {company_name}. "
                    f"Book a preferred time with our team here:<br><br>"
                    f"<a href='{followup.calendly_link}'>{followup.calendly_link}</a></p>"
                )
                asyncio.run(
                    send_email(
                        to_address=recipient_email,
                        subject=f"Your meeting with {company_name}",
                        body_html=body_html,
                        draft_id=str(followup.id),
                    )
                )
    except Exception as exc:
        import logging
        logging.getLogger(__name__).error(f"Failed to send booking link via email: {exc}")
    followup.provider_message_id = delivery.provider_message_id
    followup.delivery_mode = delivery.provider
    followup.delivery_status = "simulated" if delivery.simulated else "sent"
    followup.status = "awaiting_booking"
    followup.link_sent_at = now
    demo_delay = settings.booking_demo_mode and contact.demo_test_contact
    delay_minutes = 2 if demo_delay else settings.booking_retry_delay_minutes + 5
    followup.booking_check_at = now + timedelta(minutes=delay_minutes)
    followup.last_error_code = None


def attach_finalized_handoff(session: Session, *, call_id: UUID, organization_id: UUID) -> None:
    followup = session.scalar(
        select(BookingFollowup).where(
            BookingFollowup.organization_id == organization_id,
            BookingFollowup.call_id == call_id,
        )
    )
    if followup is None:
        return
    handoff = session.scalar(
        select(HandoffTask).where(
            HandoffTask.organization_id == organization_id,
            HandoffTask.call_id == call_id,
        )
    )
    callback = session.scalar(
        select(CallbackRequest).where(
            CallbackRequest.organization_id == organization_id,
            CallbackRequest.call_id == call_id,
        )
    )
    followup.handoff_id = handoff.id if handoff else None
    followup.callback_request_id = callback.id if callback else None


def _retry_actor_id(session: Session, followup: BookingFollowup, call: Call) -> UUID | None:
    if followup.handoff_id:
        owner = session.scalar(
            select(HandoffTask.owner_id).where(
                HandoffTask.organization_id == followup.organization_id,
                HandoffTask.id == followup.handoff_id,
            )
        )
        if owner:
            return owner
    actor = session.scalar(
        select(CampaignLead.owner_id).where(
            CampaignLead.organization_id == followup.organization_id,
            CampaignLead.campaign_id == call.campaign_id,
            CampaignLead.lead_id == call.lead_id,
            CampaignLead.owner_id.is_not(None),
        )
    )
    if actor:
        return actor
    return session.scalar(
        select(Membership.user_id)
        .where(
            Membership.organization_id == followup.organization_id,
            Membership.status == "active",
            Membership.role.in_(["owner", "operator"]),
        )
        .order_by(Membership.created_at)
        .limit(1)
    )


def process_due_booking_retries(
    session: Session, *, settings: Settings, now: datetime | None = None
) -> BookingRetryResult:
    current = _aware(now or datetime.now(UTC)).astimezone(UTC)
    rows = session.scalars(
        select(BookingFollowup)
        .where(
            BookingFollowup.status.in_(["awaiting_booking", "canceled"]),
            BookingFollowup.booking_check_at.is_not(None),
            BookingFollowup.booking_check_at <= current,
            BookingFollowup.retry_count == 0,
            BookingFollowup.retry_consent_confirmed.is_(True),
            BookingFollowup.delivery_status.in_(["sent", "simulated"]),
        )
        .order_by(BookingFollowup.booking_check_at)
        .limit(25)
        .with_for_update(skip_locked=True)
    ).all()
    dispatched = action_required = 0
    for followup in rows:
        if followup.delivery_status == "simulated" and not settings.booking_demo_mode:
            followup.status = "action_required"
            followup.last_error_code = "sms_not_delivered"
            action_required += 1
            continue
        original_call = session.scalar(
            select(Call).where(
                Call.organization_id == followup.organization_id,
                Call.id == followup.call_id,
            )
        )
        contact = session.scalar(
            select(Contact).where(
                Contact.organization_id == followup.organization_id,
                Contact.id == followup.contact_id,
            )
        )
        if original_call is None or contact is None or original_call.campaign_id is None:
            followup.status = "action_required"
            followup.last_error_code = "retry_context_missing"
            action_required += 1
            continue
        if _active_suppression(
            session,
            organization_id=followup.organization_id,
            contact=contact,
            channel="pstn_voice",
            now=current,
        ):
            followup.status = "action_required"
            followup.last_error_code = "voice_suppressed"
            action_required += 1
            continue
        actor_id = _retry_actor_id(session, followup, original_call)
        if actor_id is None:
            followup.status = "action_required"
            followup.last_error_code = "retry_owner_missing"
            action_required += 1
            continue
        campaign_lead = session.scalar(
            select(CampaignLead).where(
                CampaignLead.organization_id == followup.organization_id,
                CampaignLead.campaign_id == original_call.campaign_id,
                CampaignLead.lead_id == original_call.lead_id,
            )
        )
        if campaign_lead:
            campaign_lead.state = "retry_due"
        followup.status = "retry_due"
        followup.retry_count = 1
        result = request_call(
            session,
            organization_id=followup.organization_id,
            actor_id=actor_id,
            lead_id=original_call.lead_id,
            contact_id=original_call.contact_id,
            campaign_id=original_call.campaign_id,
            transport="omnidim",
            idempotency_key=f"calendly-retry:{followup.id}",
            settings=settings,
            now=current,
            consent_purpose="calendly_booking_retry",
        )
        followup.retry_call_id = result.call.id
        if result.call.state != "eligible":
            followup.status = "action_required"
            followup.last_error_code = "retry_eligibility_blocked"
            action_required += 1
            continue
        try:
            dispatch_omnidim_call(session, call=result.call, settings=settings)
        except Exception:
            followup.status = "action_required"
            followup.last_error_code = "retry_dispatch_failed"
            action_required += 1
            continue
        followup.status = "retry_dispatched"
        followup.last_error_code = None
        dispatched += 1
        notify_roles(
            session,
            organization_id=followup.organization_id,
            notification_type="booking_retry_dispatched",
            severity="info",
            title="Booking reminder call dispatched",
            summary="One consented booking reminder call was dispatched.",
            action_url=f"/calls/{result.call.id}",
            dedupe_key=f"booking-retry:{followup.id}",
        )
    session.commit()
    return BookingRetryResult(dispatched=dispatched, action_required=action_required)


def provider_event_id(event: str, created_at: str, invitee_uri: str, body: bytes) -> str:
    material = f"{event}|{created_at}|{invitee_uri}|".encode() + body
    return hashlib.sha256(material).hexdigest()
