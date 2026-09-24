from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.jobs import service
from app.jobs.service import IdempotencyConflict, due_event_ids, enqueue_once, process_event
from app.persistence.models import Base, IdempotencyRecord, Organization, OutboxEvent


def _session() -> tuple[Session, UUID, UUID]:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = Session(engine)
    organization_id, actor_id = uuid4(), uuid4()
    session.add(Organization(id=organization_id, name="Job tenant"))
    session.commit()
    return session, organization_id, actor_id


def _enqueue(session: Session, organization_id: UUID, actor_id: UUID) -> OutboxEvent:
    result = enqueue_once(
        session,
        organization_id=organization_id,
        actor_id=actor_id,
        route="POST:/test",
        idempotency_key="test-job-once",
        event_type="test.job.v1",
        aggregate_type="test",
        aggregate_id=uuid4(),
        payload_ref=f"test:{uuid4()}",
    )
    session.commit()
    return result.event


def test_outbox_and_idempotency_record_rollback_with_domain_transaction() -> None:
    session, organization_id, actor_id = _session()
    enqueue_once(
        session,
        organization_id=organization_id,
        actor_id=actor_id,
        route="POST:/test",
        idempotency_key="transactional-job",
        event_type="test.job.v1",
        aggregate_type="test",
        aggregate_id=uuid4(),
        payload_ref=f"test:{uuid4()}",
    )
    session.rollback()

    assert session.scalar(select(func.count()).select_from(OutboxEvent)) == 0
    assert session.scalar(select(func.count()).select_from(IdempotencyRecord)) == 0


def test_same_key_replays_same_job_and_conflicting_payload_is_rejected() -> None:
    session, organization_id, actor_id = _session()
    aggregate_id = uuid4()
    first = enqueue_once(
        session,
        organization_id=organization_id,
        actor_id=actor_id,
        route="POST:/test",
        idempotency_key="same-request-key",
        event_type="test.job.v1",
        aggregate_type="test",
        aggregate_id=aggregate_id,
        payload_ref=f"test:{aggregate_id}",
    )
    session.commit()
    replay = enqueue_once(
        session,
        organization_id=organization_id,
        actor_id=actor_id,
        route="POST:/test",
        idempotency_key="same-request-key",
        event_type="test.job.v1",
        aggregate_type="test",
        aggregate_id=aggregate_id,
        payload_ref=f"test:{aggregate_id}",
    )
    assert replay.event.event_id == first.event.event_id
    assert replay.created is False

    with pytest.raises(IdempotencyConflict):
        enqueue_once(
            session,
            organization_id=organization_id,
            actor_id=actor_id,
            route="POST:/test",
            idempotency_key="same-request-key",
            event_type="test.job.v1",
            aggregate_type="test",
            aggregate_id=uuid4(),
            payload_ref=f"test:{uuid4()}",
        )


def test_failures_back_off_then_remain_visible_as_action_required(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session, organization_id, actor_id = _session()
    event = _enqueue(session, organization_id, actor_id)

    def fail(_session: Session, _event: OutboxEvent) -> None:
        raise RuntimeError("sensitive provider detail must not be persisted")

    monkeypatch.setitem(service.HANDLERS, "test.job.v1", fail)
    states: list[str] = []
    for _ in range(service.MAX_ATTEMPTS):
        result = process_event(session, event.event_id)
        states.append(result.state)
        current = session.scalar(select(OutboxEvent).where(OutboxEvent.id == event.id))
        assert current is not None
        if current.next_attempt_at is not None:
            current.next_attempt_at = datetime.now(UTC) - timedelta(seconds=1)
            session.commit()

    current = session.scalar(select(OutboxEvent).where(OutboxEvent.id == event.id))
    assert current is not None
    assert states == ["retry_wait"] * 4 + ["action_required"]
    assert current.attempts == service.MAX_ATTEMPTS
    assert current.last_error_code == "RuntimeError"
    assert "sensitive" not in (current.last_error_code or "")


def test_stale_processing_job_is_discovered_and_completed_after_restart(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    session, organization_id, actor_id = _session()
    event = _enqueue(session, organization_id, actor_id)
    event.state = "processing"
    event.attempts = 1
    event.updated_at = datetime.now(UTC) - service.STALE_PROCESSING_AFTER - timedelta(seconds=1)
    session.commit()
    monkeypatch.setitem(service.HANDLERS, "test.job.v1", lambda _session, _event: None)

    assert event.event_id in due_event_ids(session)
    result = process_event(session, event.event_id)

    assert result.state == "completed"
    assert result.attempts == 2
