from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import AuthContext
from app.config import Settings
from app.persistence.models import Call, TranscriptSegment


class BrowserVoiceMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event: Literal[
        "speech.start",
        "speech.end",
        "transcript.partial",
        "transcript.final",
        "playback.started",
        "playback.ended",
        "silence",
        "end",
        "ping",
    ]
    text: str | None = Field(default=None, max_length=1000)
    language: Literal["en-IN", "hi-IN"] | None = None
    sequence: int | None = Field(default=None, ge=0, le=100)
    started_ms: int | None = Field(default=None, ge=0)
    ended_ms: int | None = Field(default=None, ge=0)
    latency_ms: int | None = Field(default=None, ge=0, le=60_000)


@dataclass(frozen=True)
class VoiceCallContext:
    call_id: UUID
    organization_id: UUID
    transport: str
    max_duration_seconds: int
    started_at: datetime


def start_voice_call(
    session: Session,
    *,
    call_id: UUID,
    auth: AuthContext,
    settings: Settings,
) -> VoiceCallContext:
    call = session.scalar(
        select(Call).where(Call.id == call_id, Call.organization_id == auth.organization_id)
    )
    if call is None:
        raise LookupError("call not found")
    if settings.calls_kill_switch:
        call.state = "blocked"
        call.outcome = "kill_switch"
        session.commit()
        raise PermissionError("global call kill switch is active")
    if call.state != "eligible":
        raise PermissionError(f"call is not eligible to start (state={call.state})")
    if not bool(call.eligibility_decision.get("eligible")):
        raise PermissionError("stored eligibility decision does not allow this call")
    call.state = "connecting"
    session.flush()
    call.state = "active"
    call.started_at = datetime.now(UTC)
    session.commit()
    return VoiceCallContext(
        call_id=call.id,
        organization_id=call.organization_id,
        transport=call.transport,
        max_duration_seconds=call.max_duration_seconds,
        started_at=call.started_at,
    )


def start_provider_voice_call(
    session: Session,
    *,
    call_id: UUID,
    provider_call_sid: str,
    settings: Settings,
) -> VoiceCallContext:
    """Activate a provider call only when the stored Twilio mapping matches."""
    from app.persistence.models import ExternalMapping

    row = session.execute(
        select(Call, ExternalMapping)
        .join(
            ExternalMapping,
            (ExternalMapping.local_id == Call.id)
            & (ExternalMapping.organization_id == Call.organization_id),
        )
        .where(
            Call.id == call_id,
            Call.transport == "twilio",
            ExternalMapping.provider == "twilio",
            ExternalMapping.local_type == "call",
            ExternalMapping.external_type == "call",
            ExternalMapping.external_id == provider_call_sid,
        )
    ).one_or_none()
    if row is None:
        raise LookupError("provider call mapping not found")
    call, _ = row
    if settings.calls_kill_switch:
        call.state = "blocked"
        call.outcome = "kill_switch"
        session.commit()
        raise PermissionError("global call kill switch is active")
    if call.state not in {"connecting", "active"}:
        raise PermissionError(f"provider call cannot start (state={call.state})")
    if not bool(call.eligibility_decision.get("eligible")):
        raise PermissionError("stored eligibility decision does not allow this call")
    if call.started_at is None:
        call.started_at = datetime.now(UTC)
    call.state = "active"
    session.commit()
    return VoiceCallContext(
        call_id=call.id,
        organization_id=call.organization_id,
        transport=call.transport,
        max_duration_seconds=call.max_duration_seconds,
        started_at=call.started_at,
    )


def record_final_segment(
    session: Session,
    *,
    context: VoiceCallContext,
    sequence: int,
    speaker: Literal["agent", "participant"],
    text: str,
    language: Literal["en-IN", "hi-IN"],
    started_ms: int,
    ended_ms: int,
) -> TranscriptSegment:
    cleaned = " ".join(text.split()).strip()
    if not cleaned:
        raise ValueError("final transcript cannot be empty")
    if ended_ms < started_ms or ended_ms > context.max_duration_seconds * 1000:
        raise ValueError("transcript timing is outside the bounded call")
    existing = session.scalar(
        select(TranscriptSegment).where(
            TranscriptSegment.organization_id == context.organization_id,
            TranscriptSegment.call_id == context.call_id,
            TranscriptSegment.sequence == sequence,
        )
    )
    if existing:
        if existing.text != cleaned or existing.speaker != speaker:
            raise ValueError("transcript sequence conflicts with stored final segment")
        return existing
    segment = TranscriptSegment(
        organization_id=context.organization_id,
        call_id=context.call_id,
        sequence=sequence,
        speaker=speaker,
        started_ms=started_ms,
        ended_ms=ended_ms,
        text=cleaned,
        language=language,
        is_final=True,
    )
    session.add(segment)
    session.commit()
    return segment


def should_stop_call(session: Session, context: VoiceCallContext, settings: Settings) -> bool:
    if settings.calls_kill_switch:
        return True
    state = session.scalar(
        select(Call.state).where(
            Call.id == context.call_id,
            Call.organization_id == context.organization_id,
        )
    )
    return state in {"ending", "completed", "failed", "blocked"}


def record_voice_latency(
    session: Session,
    *,
    context: VoiceCallContext,
    latency_ms: int,
) -> None:
    call = session.scalar(
        select(Call).where(
            Call.id == context.call_id,
            Call.organization_id == context.organization_id,
            Call.state == "active",
        )
    )
    if call is None:
        return
    samples = [int(value) for value in call.usage.get("voice_latency_ms", [])][-19:]
    call.usage = {**call.usage, "voice_latency_ms": [*samples, latency_ms]}
    session.commit()


def complete_voice_call(
    session: Session,
    *,
    context: VoiceCallContext,
    outcome: str,
) -> None:
    call = session.scalar(
        select(Call).where(
            Call.id == context.call_id,
            Call.organization_id == context.organization_id,
        )
    )
    if call is None or call.state in {"completed", "failed", "blocked"}:
        return
    ended_at = datetime.now(UTC)
    started_at = call.started_at or context.started_at
    if started_at.tzinfo is None:
        started_at = started_at.replace(tzinfo=UTC)
    elapsed = min(
        call.max_duration_seconds,
        max(0, round((ended_at - started_at).total_seconds())),
    )
    call.state = "completed"
    call.ended_at = ended_at
    call.outcome = outcome
    call.usage = {
        **call.usage,
        "reservation_status": "consumed",
        "actual_call_seconds": elapsed,
    }
    session.flush()
    # Import locally so the voice lifecycle remains independent from outcome schemas.
    from app.outcomes.service import finalize_completed_call

    finalize_completed_call(
        session,
        organization_id=context.organization_id,
        call_id=context.call_id,
        now=ended_at,
    )
    session.commit()


def parse_browser_voice_message(payload: Any) -> BrowserVoiceMessage:
    message = BrowserVoiceMessage.model_validate(payload)
    if message.latency_ms is not None and message.event != "playback.started":
        raise ValueError("latency_ms is allowed only for playback.started")
    if message.event in {"transcript.partial", "transcript.final"} and not message.text:
        raise ValueError(f"{message.event} requires text")
    if message.event == "transcript.final" and (
        message.sequence is None
        or message.language is None
        or message.started_ms is None
        or message.ended_ms is None
    ):
        raise ValueError("final transcript requires sequence, language, and timing")
    return message
