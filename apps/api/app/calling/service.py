import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Literal
from uuid import NAMESPACE_URL, UUID, uuid5
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, not_, or_, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.jobs.service import IdempotencyConflict
from app.persistence.models import (
    Call,
    Campaign,
    CampaignLead,
    ConsentRecord,
    Contact,
    IdempotencyRecord,
    Lead,
    OrganizationControl,
    Product,
    ProductVersion,
    Suppression,
)

ACTIVE_CALL_STATES = ("eligible", "connecting", "active", "ending")


@dataclass(frozen=True)
class CallRequestResult:
    call: Call
    created: bool


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=UTC)


def _reserved_today(
    session: Session, organization_id: UUID, now: datetime, timezone: ZoneInfo
) -> Decimal:
    local_start = now.astimezone(timezone).replace(hour=0, minute=0, second=0, microsecond=0)
    utc_start = local_start.astimezone(UTC)
    calls = session.scalars(
        select(Call).where(
            Call.organization_id == organization_id,
            Call.created_at >= utc_start,
        )
    ).all()
    return sum(
        (Decimal(str(call.usage.get("reserved_cost_inr", "0"))) for call in calls),
        start=Decimal("0"),
    )


def request_call(
    session: Session,
    *,
    organization_id: UUID,
    actor_id: UUID,
    lead_id: UUID,
    contact_id: UUID,
    campaign_id: UUID,
    transport: Literal["browser", "twilio", "omnidim"] = "browser",
    idempotency_key: str,
    settings: Settings,
    now: datetime | None = None,
) -> CallRequestResult:
    now = now or datetime.now(UTC)
    route = "POST:/api/v1/calls/requests"
    fingerprint = hashlib.sha256(
        f"{lead_id}|{contact_id}|{campaign_id}|{transport}".encode()
    ).hexdigest()
    existing_key = session.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.organization_id == organization_id,
            IdempotencyRecord.actor_id == actor_id,
            IdempotencyRecord.route == route,
            IdempotencyRecord.key == idempotency_key,
        )
    )
    if existing_key:
        if existing_key.request_fingerprint != fingerprint:
            raise IdempotencyConflict("idempotency key was already used for another call request")
        body = existing_key.response_body or {}
        existing_call = session.scalar(
            select(Call).where(
                Call.organization_id == organization_id,
                Call.id == UUID(str(body.get("call_id"))),
            )
        )
        if existing_call is None:
            raise ValueError("idempotency record references a missing call")
        return CallRequestResult(existing_call, False)

    lead = session.scalar(
        select(Lead).where(Lead.id == lead_id, Lead.organization_id == organization_id)
    )
    contact = session.scalar(
        select(Contact).where(
            Contact.id == contact_id,
            Contact.organization_id == organization_id,
        )
    )
    campaign = session.scalar(
        select(Campaign).where(
            Campaign.id == campaign_id,
            Campaign.organization_id == organization_id,
        )
    )
    if lead is None or contact is None or campaign is None:
        raise LookupError("lead, contact, or campaign not found")
    if lead.company_id is None or contact.company_id != lead.company_id:
        raise ValueError("contact is not attached to the lead company")

    checks: list[dict[str, str | bool]] = []

    def check(name: str, passed: bool, reason: str) -> None:
        checks.append({"name": name, "passed": passed, "reason": reason})

    product_is_approved = session.scalar(
        select(ProductVersion.id)
        .join(
            Product,
            (Product.id == ProductVersion.product_id)
            & (Product.organization_id == organization_id),
        )
        .where(
            ProductVersion.id == lead.product_version_id,
            ProductVersion.organization_id == organization_id,
            ProductVersion.approved_at.is_not(None),
            Product.active_version_id == ProductVersion.id,
        )
    )
    check(
        "approved_product",
        product_is_approved is not None,
        "The lead must use the active approved product version.",
    )
    campaign_lead = session.scalar(
        select(CampaignLead).where(
            CampaignLead.organization_id == organization_id,
            CampaignLead.campaign_id == campaign.id,
            CampaignLead.lead_id == lead.id,
        )
    )
    campaign_approved = bool(
        campaign.status == "active"
        and campaign_lead
        and campaign_lead.approved_at
        and campaign_lead.state in {"approved", "eligible"}
    )
    check(
        "campaign_approval",
        campaign_approved,
        "An operator must approve this lead in an active campaign.",
    )
    scheduled = campaign.scheduled_start_at
    schedule_open = scheduled is None or _aware(scheduled) <= _aware(now)
    check(
        "scheduled_start",
        schedule_open,
        "The campaign scheduled start time has not been reached.",
    )
    previous_attempts = session.scalar(
        select(func.count())
        .select_from(Call)
        .where(
            Call.organization_id == organization_id,
            Call.campaign_id == campaign.id,
            Call.lead_id == lead.id,
            Call.state != "blocked",
            not_(
                and_(
                    Call.state == "failed",
                    Call.outcome == "provider_dispatch_failed",
                )
            ),
        )
    ) or 0
    check(
        "maximum_attempts",
        previous_attempts < campaign.max_attempts,
        "The campaign maximum attempts limit has been reached for this lead.",
    )
    consent_channel = "browser_voice" if transport == "browser" else "pstn_voice"
    consent = session.scalar(
        select(ConsentRecord)
        .where(
            ConsentRecord.organization_id == organization_id,
            ConsentRecord.contact_id == contact.id,
            ConsentRecord.channel == consent_channel,
            ConsentRecord.purpose == "hackathon_demo_qualification",
            ConsentRecord.status == "active",
            or_(ConsentRecord.expires_at.is_(None), ConsentRecord.expires_at > now),
        )
        .order_by(ConsentRecord.recorded_at.desc())
        .limit(1)
    )
    valid_test_consent = bool(contact.demo_test_contact and consent)
    check(
        "active_test_consent",
        valid_test_consent,
        (
            "Browser voice requires an active consent record for a verified test participant."
            if transport == "browser"
            else "PSTN voice requires separately attested consent for the test participant."
        ),
    )
    suppression = session.scalar(
        select(Suppression).where(
            Suppression.organization_id == organization_id,
            Suppression.identifier_hash == contact.identifier_hash,
            Suppression.channel.in_([consent_channel, "all"]),
            or_(Suppression.expires_at.is_(None), Suppression.expires_at > now),
        )
    )
    check("not_suppressed", suppression is None, "The contact is suppressed for this channel.")
    try:
        campaign_timezone = ZoneInfo(campaign.timezone)
        local_hour = now.astimezone(campaign_timezone).hour
        in_window = settings.call_window_start_hour <= local_hour < settings.call_window_end_hour
    except (KeyError, ValueError):
        campaign_timezone = ZoneInfo("UTC")
        in_window = False
    check(
        "allowed_window",
        in_window,
        (
            f"Calls are allowed from {settings.call_window_start_hour:02d}:00 to "
            f"{settings.call_window_end_hour:02d}:00 in the campaign timezone."
        ),
    )
    if transport == "twilio":
        check(
            "transport_enabled",
            settings.voice_transport == "twilio",
            "Twilio is not the selected voice transport.",
        )
        check(
            "outbound_pstn_enabled",
            settings.enable_outbound_pstn,
            "Outbound PSTN is disabled by configuration.",
        )
        configured = all(
            (
                settings.twilio_account_sid,
                settings.twilio_auth_token,
                settings.twilio_from_number,
                settings.twilio_test_to_number,
                settings.public_voice_base_url,
            )
        )
        check(
            "provider_configured",
            configured,
            "Twilio and the public HTTPS voice URL must be configured.",
        )
    elif transport == "omnidim":
        check(
            "transport_enabled",
            settings.voice_transport == "omnidim",
            "OmniDimension is not the selected voice transport.",
        )
        check(
            "outbound_pstn_enabled",
            settings.enable_outbound_pstn,
            "Outbound PSTN is disabled by configuration.",
        )
        check(
            "provider_configured",
            bool(
                settings.omnidim_api_key
                and settings.omnidim_agent_id
                and settings.omnidim_test_to_number
            ),
            "OmniDimension API key, agent, and consenting test number must be configured.",
        )
    reservation = Decimal(
        str(
            settings.estimated_browser_call_cost_inr
            if transport == "browser"
            else settings.estimated_pstn_call_cost_inr
        )
    )
    budget_limit = min(campaign.daily_budget_inr, Decimal(settings.daily_spend_limit_inr))
    budget_ok = (
        _reserved_today(session, organization_id, now, campaign_timezone) + reservation
        <= budget_limit
    )
    check("remaining_budget", budget_ok, "The daily call budget has been exhausted.")
    active_count = len(
        session.scalars(
            select(Call.id).where(
                Call.organization_id == organization_id,
                Call.state.in_(ACTIVE_CALL_STATES),
            )
        ).all()
    )
    concurrency_ok = active_count < settings.max_concurrent_calls
    check("concurrency_slot", concurrency_ok, "No call concurrency slot is available.")
    persistent_control = session.scalar(
        select(OrganizationControl).where(
            OrganizationControl.organization_id == organization_id
        )
    )
    calls_paused = settings.calls_kill_switch or bool(
        persistent_control and persistent_control.calls_paused
    )
    check("kill_switch", not calls_paused, "Calling is paused by an administrator.")
    eligible = all(bool(item["passed"]) for item in checks)
    attempt_id = uuid5(
        NAMESPACE_URL,
        f"{organization_id}:{transport}-call:{lead.id}:{contact.id}:{campaign.id}:{idempotency_key}",
    )
    call = Call(
        organization_id=organization_id,
        lead_id=lead.id,
        campaign_id=campaign.id,
        contact_id=contact.id,
        attempt_id=attempt_id,
        transport=transport,
        state="eligible" if eligible else "blocked",
        eligibility_decision={
            "eligible": eligible,
            "checks": checks,
            "evaluated_at": now.isoformat(),
        },
        max_duration_seconds=settings.max_call_seconds,
        usage=(
            {
                "reserved_cost_inr": str(reservation),
                "reservation_status": "reserved",
            }
            if eligible
            else {"reserved_cost_inr": "0", "reservation_status": "not_reserved"}
        ),
        outcome=None if eligible else "eligibility_blocked",
    )
    session.add(call)
    session.flush()
    lead.outreach_eligible = eligible
    if campaign_lead and eligible:
        campaign_lead.state = "eligible"
    session.add(
        IdempotencyRecord(
            organization_id=organization_id,
            actor_id=actor_id,
            route=route,
            key=idempotency_key,
            request_fingerprint=fingerprint,
            response_status=201,
            response_body={"call_id": str(call.id), "attempt_id": str(attempt_id)},
            expires_at=_aware(now).astimezone(UTC) + timedelta(hours=24),
        )
    )
    session.flush()
    return CallRequestResult(call, True)
