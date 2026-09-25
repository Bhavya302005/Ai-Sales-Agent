from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.persistence.models import Call, TranscriptSegment, UsageEvent


def record_usage_once(
    session: Session,
    *,
    organization_id: UUID,
    provider_event_id: str,
    provider: str,
    quantity: Decimal,
    unit: str,
    estimated_cost_inr: Decimal = Decimal("0"),
    actual_cost_inr: Decimal | None = None,
    occurred_at: datetime | None = None,
) -> UsageEvent:
    existing = session.scalar(
        select(UsageEvent).where(
            UsageEvent.provider == provider,
            UsageEvent.provider_event_id == provider_event_id,
        )
    )
    if existing:
        if existing.organization_id != organization_id:
            raise ValueError("usage provider event belongs to another tenant")
        return existing
    event = UsageEvent(
        organization_id=organization_id,
        provider_event_id=provider_event_id,
        provider=provider,
        quantity=quantity,
        unit=unit,
        estimated_cost_inr=estimated_cost_inr,
        actual_cost_inr=actual_cost_inr,
        occurred_at=occurred_at or datetime.now(UTC),
    )
    session.add(event)
    session.flush()
    return event


def record_call_usage(
    session: Session,
    *,
    call: Call,
    segments: list[TranscriptSegment],
) -> None:
    occurred_at = call.ended_at or datetime.now(UTC)
    seconds = Decimal(str(call.usage.get("actual_call_seconds", 0)))
    reserved_cost = Decimal(str(call.usage.get("reserved_cost_inr", 0)))
    participant_ms = sum(
        max(0, segment.ended_ms - segment.started_ms)
        for segment in segments
        if segment.speaker == "participant"
    )
    tts_characters = sum(
        len(segment.text) for segment in segments if segment.speaker == "agent"
    )
    call_provider = (
        "omnidimension_voice"
        if call.transport == "omnidim"
        else "twilio_voice"
        if call.transport == "twilio"
        else "browser_voice"
    )
    actual_call_cost = (
        (seconds / Decimal("60") * Decimal("7.00")).quantize(Decimal("0.01"))
        if call.transport == "omnidim" and seconds > 0
        else None
    )
    record_usage_once(
        session,
        organization_id=call.organization_id,
        provider_event_id=f"{call.id}:call_seconds",
        provider=call_provider,
        quantity=seconds,
        unit="call_seconds",
        estimated_cost_inr=reserved_cost,
        actual_cost_inr=actual_call_cost,
        occurred_at=occurred_at,
    )
    record_usage_once(
        session,
        organization_id=call.organization_id,
        provider_event_id=f"{call.id}:stt_seconds",
        provider="browser_speech_recognition",
        quantity=Decimal(participant_ms) / Decimal(1000),
        unit="stt_seconds",
        occurred_at=occurred_at,
    )
    record_usage_once(
        session,
        organization_id=call.organization_id,
        provider_event_id=f"{call.id}:tts_characters",
        provider="browser_speech_synthesis",
        quantity=Decimal(tts_characters),
        unit="tts_characters",
        occurred_at=occurred_at,
    )
