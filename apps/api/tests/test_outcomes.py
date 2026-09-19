from collections.abc import Generator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

from database.seeds.demo import seed_demo
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.auth import create_access_token
from app.config import Settings, get_settings
from app.db import get_session
from app.demo_ids import CONTACT_ID, LEAD_ID, ORGANIZATION_ID, USER_ID
from app.main import app
from app.outcomes.service import finalize_completed_call
from app.persistence.models import Base, Call, HandoffTask, Qualification, TranscriptSegment


def _setup(database_path: Path) -> tuple[Settings, Session]:
    database_url = f"sqlite+pysqlite:///{database_path}"
    settings = Settings(app_env="test", database_url=database_url)
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    assert seed_demo(database_url)
    return settings, Session(engine)


def _completed_call(session: Session, *, outcome: str = "handoff_requested") -> Call:
    now = datetime.now(UTC)
    call = Call(
        organization_id=ORGANIZATION_ID,
        lead_id=LEAD_ID,
        contact_id=CONTACT_ID,
        attempt_id=uuid4(),
        transport="browser",
        state="completed",
        eligibility_decision={"eligible": True, "checks": []},
        max_duration_seconds=300,
        started_at=now - timedelta(minutes=2),
        ended_at=now,
        usage={"actual_call_seconds": 120, "reservation_status": "consumed"},
        outcome=outcome,
    )
    session.add(call)
    session.flush()
    texts = [
        (0, "agent", "Hello, I am an AI assistant. Is now a good time?"),
        (1, "participant", "yes"),
        (2, "agent", "Which ERP workloads and business processes are in scope?"),
        (3, "participant", "We need SAP ERP finance and inventory migration."),
        (
            4,
            "agent",
            "What does your current environment look like—cloud, on-premises, or "
            "hybrid—and roughly how many users, locations, and key integrations are "
            "involved?",
        ),
        (5, "participant", "Hybrid, 300 users across three locations, with four integrations."),
        (
            6,
            "agent",
            "What outcome would make this project successful, and which requirements "
            "are most important?",
        ),
        (7, "participant", "Minimal downtime, security, and a supported handover are essential."),
        (8, "agent", "What deadline or business event is driving the migration?"),
        (9, "participant", "Before the September deadline."),
        (10, "agent", "Who owns the technical evaluation and commercial decision?"),
        (11, "participant", "I own the technical evaluation and our CFO owns commercial."),
        (12, "agent", "Has a budget range been approved or is it under review?"),
        (13, "participant", "The budget range is under review."),
        (
            14,
            "agent",
            "Do you confirm that a human specialist may follow up using the verified test contact?",
        ),
        (15, "participant", "That works for me, please proceed."),
    ]
    for sequence, speaker, text in texts:
        session.add(
            TranscriptSegment(
                organization_id=ORGANIZATION_ID,
                call_id=call.id,
                sequence=sequence,
                speaker=speaker,
                started_ms=sequence * 1000,
                ended_ms=sequence * 1000 + 500,
                text=text,
                language="en-IN",
                is_final=True,
            )
        )
    session.commit()
    return call


def _headers(settings: Settings) -> dict[str, str]:
    token = create_access_token(
        user_id=USER_ID,
        organization_id=ORGANIZATION_ID,
        settings=settings,
        lifetime=timedelta(minutes=5),
    )
    return {"Authorization": f"Bearer {token}"}


def test_finalization_derives_only_transcript_backed_fields_and_one_handoff(
    tmp_path: Path,
) -> None:
    _, session = _setup(tmp_path / "outcomes.db")
    call = _completed_call(session)
    fixed_now = datetime(2026, 9, 17, 12, 0, tzinfo=UTC)

    first = finalize_completed_call(
        session,
        organization_id=ORGANIZATION_ID,
        call_id=call.id,
        now=fixed_now,
    )
    session.commit()
    repeated = finalize_completed_call(
        session,
        organization_id=ORGANIZATION_ID,
        call_id=call.id,
        now=fixed_now,
    )

    qualification = first.qualification
    assert qualification.need == "We need SAP ERP finance and inventory migration."
    assert qualification.scope == (
        "Hybrid, 300 users across three locations, with four integrations."
    )
    assert qualification.timeline == "Before the September deadline."
    assert qualification.authority_known is True
    assert qualification.budget_known is True
    assert qualification.interest is None
    assert qualification.requested_next_step == (
        "Human specialist follow-up using the verified test contact"
    )
    assert qualification.objections[0]["type"] == "delivery_requirement"
    assert len(qualification.evidence_segment_ids) == 7
    assert first.handoff is not None
    assert first.handoff.priority == "normal"
    assert first.handoff.due_at.replace(tzinfo=UTC) == fixed_now + timedelta(days=1)
    assert first.qualification_created is True
    assert first.handoff_created is True
    assert repeated.qualification_created is False
    assert repeated.handoff_created is False
    assert session.scalar(select(func.count()).select_from(Qualification)) == 1
    assert session.scalar(select(func.count()).select_from(HandoffTask)) == 1
    session.close()


def test_pricing_question_is_evidence_backed_and_high_priority(tmp_path: Path) -> None:
    _, session = _setup(tmp_path / "pricing-outcome.db")
    call = _completed_call(session)
    session.add(
        TranscriptSegment(
            organization_id=ORGANIZATION_ID,
            call_id=call.id,
            sequence=17,
            speaker="participant",
            started_ms=17_000,
            ended_ms=17_500,
            text="Can you guarantee a discounted price?",
            language="en-IN",
            is_final=True,
        )
    )
    session.commit()

    result = finalize_completed_call(
        session,
        organization_id=ORGANIZATION_ID,
        call_id=call.id,
    )

    assert result.handoff is not None
    assert result.handoff.priority == "high"
    pricing = next(
        item
        for item in result.qualification.objections
        if item["type"] == "pricing_or_commitment"
    )
    assert pricing == {
        "type": "pricing_or_commitment",
        "text": "Can you guarantee a discounted price?",
        "evidence_segment_id": str(
            session.scalar(
                select(TranscriptSegment.id).where(
                    TranscriptSegment.call_id == call.id,
                    TranscriptSegment.sequence == 17,
                )
            )
        ),
    }
    session.close()


def test_call_detail_api_returns_transcript_evidence_and_handoff(tmp_path: Path) -> None:
    settings, session = _setup(tmp_path / "outcome-api.db")
    call = _completed_call(session)
    finalize_completed_call(
        session,
        organization_id=ORGANIZATION_ID,
        call_id=call.id,
    )
    session.commit()

    def session_override() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as client:
        response = client.get(f"/api/v1/calls/{call.id}/detail", headers=_headers(settings))
        missing = client.get(f"/api/v1/calls/{UUID(int=0)}/detail", headers=_headers(settings))
    app.dependency_overrides.clear()

    body = response.json()
    assert response.status_code == 200
    assert body["state"] == "completed"
    assert len(body["transcript"]) == 16
    assert body["qualification"]["budget_known"] is True
    assert len(body["qualification"]["evidence_segment_ids"]) == 7
    assert body["handoff"]["state"] == "open"
    assert body["handoff"]["external_reference"] is None
    assert missing.status_code == 404
    session.close()
