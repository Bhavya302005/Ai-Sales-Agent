import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.crm.providers import CrmPermanentError
from app.extraction.service import extract_source
from app.notifications import notify_roles
from app.persistence.models import (
    IdempotencyRecord,
    Lead,
    OutboxEvent,
    ProductVersion,
    Requirement,
    SourceDocument,
)
from app.scoring.service import score_lead

MAX_ATTEMPTS = 5
MAX_BACKOFF_SECONDS = 300
STALE_PROCESSING_AFTER = timedelta(minutes=2)


class IdempotencyConflict(ValueError):
    pass


class PermanentJobError(ValueError):
    pass


@dataclass(frozen=True)
class EnqueueResult:
    event: OutboxEvent
    created: bool


@dataclass(frozen=True)
class ProcessResult:
    event_id: UUID
    state: str
    attempts: int
    retry_after_seconds: int | None = None


def enqueue_once(
    session: Session,
    *,
    organization_id: UUID,
    actor_id: UUID,
    route: str,
    idempotency_key: str,
    event_type: str,
    aggregate_type: str,
    aggregate_id: UUID,
    payload_ref: str,
) -> EnqueueResult:
    fingerprint = hashlib.sha256(
        f"{event_type}|{aggregate_type}|{aggregate_id}|{payload_ref}".encode()
    ).hexdigest()
    existing_key = session.scalar(
        select(IdempotencyRecord).where(
            IdempotencyRecord.organization_id == organization_id,
            IdempotencyRecord.actor_id == actor_id,
            IdempotencyRecord.route == route,
            IdempotencyRecord.key == idempotency_key,
        )
    )
    if existing_key is not None:
        if existing_key.request_fingerprint != fingerprint:
            raise IdempotencyConflict("idempotency key was already used for another request")
        response = existing_key.response_body or {}
        event_id = response.get("event_id")
        event = session.scalar(
            select(OutboxEvent).where(
                OutboxEvent.organization_id == organization_id,
                OutboxEvent.event_id == UUID(str(event_id)),
            )
        )
        if event is None:
            raise PermanentJobError("idempotency record references a missing job")
        return EnqueueResult(event=event, created=False)

    event_id = uuid4()
    event = OutboxEvent(
        organization_id=organization_id,
        event_id=event_id,
        event_type=event_type,
        aggregate_type=aggregate_type,
        aggregate_id=aggregate_id,
        payload_ref=payload_ref,
        correlation_id=event_id,
        causation_id=None,
        schema_version=1,
        attempts=0,
        next_attempt_at=None,
        state="pending",
        last_error_code=None,
    )
    session.add(event)
    session.flush()
    session.add(
        IdempotencyRecord(
            organization_id=organization_id,
            actor_id=actor_id,
            route=route,
            key=idempotency_key,
            request_fingerprint=fingerprint,
            response_status=202,
            response_body={"event_id": str(event_id)},
            expires_at=datetime.now(UTC) + timedelta(hours=24),
        )
    )
    session.flush()
    return EnqueueResult(event=event, created=True)


def _payload_id(event: OutboxEvent, prefix: str) -> UUID:
    expected = f"{prefix}:"
    if not event.payload_ref.startswith(expected):
        raise PermanentJobError("invalid payload reference")
    try:
        return UUID(event.payload_ref.removeprefix(expected))
    except ValueError as exc:
        raise PermanentJobError("invalid payload identifier") from exc


def _handle_extraction(session: Session, event: OutboxEvent) -> None:
    source_id = _payload_id(event, "source")
    source = session.scalar(
        select(SourceDocument).where(
            SourceDocument.organization_id == event.organization_id,
            SourceDocument.id == source_id,
        )
    )
    if source is None:
        raise PermanentJobError("source does not exist")
    extract_source(session, organization_id=event.organization_id, source=source)


def _handle_scoring(session: Session, event: OutboxEvent) -> None:
    lead_id = _payload_id(event, "lead")
    row = session.execute(
        select(Lead, Requirement, SourceDocument, ProductVersion)
        .join(Requirement, Requirement.id == Lead.requirement_id)
        .join(SourceDocument, SourceDocument.id == Requirement.source_document_id)
        .join(ProductVersion, ProductVersion.id == Lead.product_version_id)
        .where(
            Lead.organization_id == event.organization_id,
            Lead.id == lead_id,
            Requirement.organization_id == event.organization_id,
            SourceDocument.organization_id == event.organization_id,
            ProductVersion.organization_id == event.organization_id,
        )
    ).one_or_none()
    if row is None:
        raise PermanentJobError("lead scoring graph does not exist")
    lead, requirement, source, product_version = row
    score_lead(
        session,
        organization_id=event.organization_id,
        lead=lead,
        requirement=requirement,
        source=source,
        product_version=product_version,
    )


def _handle_crm_sync(session: Session, event: OutboxEvent) -> None:
    handoff_id = _payload_id(event, "handoff")
    from app.crm.service import sync_handoff

    try:
        sync_handoff(
            session,
            organization_id=event.organization_id,
            handoff_id=handoff_id,
            settings=get_settings(),
        )
    except (CrmPermanentError, LookupError, ValueError) as exc:
        raise PermanentJobError(str(exc)) from exc


HANDLERS = {
    "lead.extraction_requested.v1": _handle_extraction,
    "lead.scoring_requested.v1": _handle_scoring,
    "crm.sync_requested.v1": _handle_crm_sync,
}


def process_event(session: Session, event_id: UUID) -> ProcessResult:
    event = session.scalar(
        select(OutboxEvent)
        .where(OutboxEvent.event_id == event_id)
        .with_for_update(skip_locked=True)
    )
    if event is None:
        raise LookupError("job not found or already claimed")
    if event.state == "completed":
        return ProcessResult(event.event_id, event.state, event.attempts)
    if event.state == "action_required":
        return ProcessResult(event.event_id, event.state, event.attempts)
    now = datetime.now(UTC)
    updated_at = event.updated_at
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=UTC)
    if event.state == "processing" and now - updated_at < STALE_PROCESSING_AFTER:
        return ProcessResult(event.event_id, event.state, event.attempts)
    next_attempt_at = event.next_attempt_at
    if next_attempt_at is not None and next_attempt_at.tzinfo is None:
        next_attempt_at = next_attempt_at.replace(tzinfo=UTC)
    if next_attempt_at is not None and next_attempt_at > now:
        seconds = max(1, round((next_attempt_at - now).total_seconds()))
        return ProcessResult(event.event_id, event.state, event.attempts, seconds)
    handler = HANDLERS.get(event.event_type)
    if handler is None:
        event.state = "action_required"
        event.last_error_code = "unsupported_event_type"
        session.commit()
        return ProcessResult(event.event_id, event.state, event.attempts)
    event.attempts += 1
    attempt = event.attempts
    event.state = "processing"
    event.next_attempt_at = None
    if event.aggregate_type == "source":
        processing_source = session.scalar(
            select(SourceDocument).where(
                SourceDocument.organization_id == event.organization_id,
                SourceDocument.id == event.aggregate_id,
            )
        )
        if processing_source:
            processing_source.extraction_status = "processing"
    session.commit()
    try:
        event = session.scalar(
            select(OutboxEvent).where(OutboxEvent.event_id == event_id).with_for_update()
        )
        if event is None:
            raise PermanentJobError("job disappeared during processing")
        handler(session, event)
        if event.event_type == "crm.sync_requested.v1":
            notify_roles(
                session,
                organization_id=event.organization_id,
                notification_type="crm_sync_succeeded",
                severity="success",
                title="CRM sync succeeded",
                summary="The handoff was verified in the configured CRM.",
                action_url="/settings/integrations",
                dedupe_key=f"crm-sync-success:{event.event_id}",
            )
        event.state = "completed"
        event.next_attempt_at = None
        event.last_error_code = None
        session.commit()
        return ProcessResult(event.event_id, event.state, event.attempts)
    except Exception as exc:
        session.rollback()
        failed = session.scalar(
            select(OutboxEvent).where(OutboxEvent.event_id == event_id).with_for_update()
        )
        if failed is None:
            raise
        permanent = isinstance(exc, PermanentJobError)
        if permanent or attempt >= MAX_ATTEMPTS:
            failed.state = "action_required"
            failed.next_attempt_at = None
        else:
            delay = min(2**attempt, MAX_BACKOFF_SECONDS)
            failed.state = "retry_wait"
            failed.next_attempt_at = now + timedelta(seconds=delay)
        failed.last_error_code = type(exc).__name__
        if failed.aggregate_type == "source":
            source = session.scalar(
                select(SourceDocument).where(
                    SourceDocument.organization_id == failed.organization_id,
                    SourceDocument.id == failed.aggregate_id,
                )
            )
            if source:
                source.extraction_status = failed.state
        if failed.event_type == "crm.sync_requested.v1" and failed.state == "action_required":
            notify_roles(
                session,
                organization_id=failed.organization_id,
                notification_type="crm_sync_action_required",
                severity="error",
                title="CRM sync needs attention",
                summary="The bounded CRM retry policy was exhausted or rejected.",
                action_url="/settings/integrations",
                dedupe_key=f"crm-sync-failed:{failed.event_id}",
            )
        session.commit()
        retry_after = None
        if failed.next_attempt_at is not None:
            retry_at = failed.next_attempt_at
            if retry_at.tzinfo is None:
                retry_at = retry_at.replace(tzinfo=UTC)
            retry_after = max(1, round((retry_at - now).total_seconds()))
        return ProcessResult(failed.event_id, failed.state, failed.attempts, retry_after)


def due_event_ids(session: Session, *, limit: int = 50) -> list[UUID]:
    now = datetime.now(UTC)
    return list(
        session.scalars(
            select(OutboxEvent.event_id)
            .where(
                or_(
                    (
                        OutboxEvent.state.in_(["pending", "retry_wait"])
                        & or_(
                            OutboxEvent.next_attempt_at.is_(None),
                            OutboxEvent.next_attempt_at <= now,
                        )
                    ),
                    (
                        (OutboxEvent.state == "processing")
                        & (OutboxEvent.updated_at <= now - STALE_PROCESSING_AFTER)
                    ),
                ),
            )
            .order_by(OutboxEvent.created_at)
            .limit(limit)
        ).all()
    )
