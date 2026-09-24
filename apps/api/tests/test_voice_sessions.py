from datetime import timedelta
from pathlib import Path
from time import monotonic, sleep
from uuid import uuid4

import pytest
from database.seeds.demo import seed_demo
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

import app.voice_main as voice_main
from app.auth import AuthContext, create_access_token
from app.config import Settings
from app.demo_ids import CONTACT_ID, LEAD_ID, ORGANIZATION_ID, USER_ID
from app.persistence.models import Base, Call, TranscriptSegment
from app.voice_sessions import (
    complete_voice_call,
    parse_browser_voice_message,
    record_final_segment,
    should_stop_call,
    start_voice_call,
)


def _setup(database_path: Path) -> tuple[Settings, object, Session]:
    database_url = f"sqlite+pysqlite:///{database_path}"
    settings = Settings(
        app_env="test",
        database_url=database_url,
        call_window_start_hour=0,
        call_window_end_hour=24,
        max_call_seconds=60,
    )
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    assert seed_demo(database_url)
    return settings, engine, Session(engine)


def _eligible_call(session: Session) -> Call:
    call = Call(
        organization_id=ORGANIZATION_ID,
        lead_id=LEAD_ID,
        contact_id=CONTACT_ID,
        attempt_id=uuid4(),
        transport="browser",
        state="eligible",
        eligibility_decision={"eligible": True, "checks": []},
        max_duration_seconds=60,
        usage={"reserved_cost_inr": "5", "reservation_status": "reserved"},
    )
    session.add(call)
    session.commit()
    return call


def _auth() -> AuthContext:
    return AuthContext(
        user_id=USER_ID,
        organization_id=ORGANIZATION_ID,
        membership_id=USER_ID,
        role="owner",
    )


def test_voice_session_starts_only_eligible_call_and_persists_final_segments(
    tmp_path: Path,
) -> None:
    settings, _, session = _setup(tmp_path / "voice-service.db")
    call = _eligible_call(session)

    context = start_voice_call(session, call_id=call.id, auth=_auth(), settings=settings)
    first = record_final_segment(
        session,
        context=context,
        sequence=1,
        speaker="participant",
        text="  We need   an ERP migration. ",
        language="en-IN",
        started_ms=100,
        ended_ms=900,
    )
    repeated = record_final_segment(
        session,
        context=context,
        sequence=1,
        speaker="participant",
        text="We need an ERP migration.",
        language="en-IN",
        started_ms=100,
        ended_ms=900,
    )

    assert session.get_one(Call, call.id).state == "active"
    assert first.id == repeated.id
    assert session.scalar(select(func.count()).select_from(TranscriptSegment)) == 1
    with pytest.raises(ValueError, match="conflicts"):
        record_final_segment(
            session,
            context=context,
            sequence=1,
            speaker="participant",
            text="Different claim",
            language="en-IN",
            started_ms=100,
            ended_ms=900,
        )
    with pytest.raises(ValueError, match="outside"):
        record_final_segment(
            session,
            context=context,
            sequence=3,
            speaker="participant",
            text="Too late",
            language="en-IN",
            started_ms=60_001,
            ended_ms=60_002,
        )
    session.close()


def test_stop_and_completion_are_bounded_and_idempotent(tmp_path: Path) -> None:
    settings, _, session = _setup(tmp_path / "voice-stop.db")
    call = _eligible_call(session)
    context = start_voice_call(session, call_id=call.id, auth=_auth(), settings=settings)
    stored = session.get_one(Call, call.id)
    stored.state = "ending"
    session.commit()

    assert should_stop_call(session, context, settings) is True
    complete_voice_call(session, context=context, outcome="stop_requested")
    complete_voice_call(session, context=context, outcome="ignored_repeat")
    session.refresh(stored)
    assert stored.state == "completed"
    assert stored.outcome == "stop_requested"
    assert 0 <= stored.usage["actual_call_seconds"] <= 60
    session.close()


def test_browser_message_schema_requires_final_timing_and_rejects_extra_fields() -> None:
    with pytest.raises(ValueError, match="requires sequence"):
        parse_browser_voice_message({"event": "transcript.final", "text": "hello"})
    with pytest.raises(ValidationError):
        parse_browser_voice_message({"event": "ping", "unexpected": True})


def test_call_websocket_persists_transcript_and_cancels_playback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings, engine, session = _setup(tmp_path / "voice-websocket.db")
    call = _eligible_call(session)
    call_id = call.id
    session.close()
    monkeypatch.setattr(voice_main, "get_settings", lambda: settings)
    monkeypatch.setattr(voice_main, "get_engine", lambda: engine)
    token = create_access_token(
        user_id=USER_ID,
        organization_id=ORGANIZATION_ID,
        settings=settings,
        lifetime=timedelta(minutes=5),
    )

    with TestClient(voice_main.app) as client:
        client.cookies.set("sales_agent_session", token)
        with client.websocket_connect(f"/api/v1/voice/calls/{call_id}") as websocket:
            started = websocket.receive_json()
            assert started["event"] == "session.started"
            assert started["conversation_policy_version"] == "conversation-policy.v1"
            assert websocket.receive_json()["event"] == "agent.response"
            websocket.send_json({"event": "playback.started", "latency_ms": 180})
            assert websocket.receive_json() == {"event": "state.changed", "state": "speaking"}
            websocket.send_json({"event": "speech.start"})
            assert websocket.receive_json() == {
                "event": "playback.cancel",
                "state": "interrupted",
            }
            assert websocket.receive_json() == {"event": "state.changed", "state": "listening"}
            websocket.send_json(
                {
                    "event": "transcript.final",
                    "text": "We need ERP migration this quarter.",
                    "language": "en-IN",
                    "sequence": 1,
                    "started_ms": 100,
                    "ended_ms": 900,
                }
            )
            assert websocket.receive_json()["event"] == "transcript.final"
            assert websocket.receive_json()["event"] == "agent.response"
            websocket.send_json({"event": "end"})
            completed = websocket.receive_json()
            assert completed == {"event": "session.completed", "outcome": "participant_ended"}

    with Session(engine) as verification:
        stored = verification.get_one(Call, call_id)
        segments = verification.scalars(
            select(TranscriptSegment)
            .where(TranscriptSegment.call_id == call_id)
            .order_by(TranscriptSegment.sequence)
        ).all()
        assert stored.state == "completed"
        assert stored.outcome == "participant_ended"
        assert stored.usage["voice_latency_ms"] == [180]
        assert [(segment.sequence, segment.speaker) for segment in segments] == [
            (0, "agent"),
            (1, "participant"),
            (2, "agent"),
        ]


def test_browser_message_rejects_latency_on_unrelated_event() -> None:
    with pytest.raises(ValueError, match="only for playback.started"):
        parse_browser_voice_message({"event": "ping", "latency_ms": 10})


def test_websocket_disconnect_finalizes_call(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings, engine, session = _setup(tmp_path / "voice-disconnect.db")
    call = _eligible_call(session)
    call_id = call.id
    session.close()
    monkeypatch.setattr(voice_main, "get_settings", lambda: settings)
    monkeypatch.setattr(voice_main, "get_engine", lambda: engine)
    token = create_access_token(
        user_id=USER_ID,
        organization_id=ORGANIZATION_ID,
        settings=settings,
        lifetime=timedelta(minutes=5),
    )

    with TestClient(voice_main.app) as client:
        client.cookies.set("sales_agent_session", token)
        with client.websocket_connect(f"/api/v1/voice/calls/{call_id}") as websocket:
            assert websocket.receive_json()["event"] == "session.started"
            assert websocket.receive_json()["event"] == "agent.response"
            websocket.close()
            deadline = monotonic() + 2
            while monotonic() < deadline:
                with Session(engine) as observation:
                    if observation.get_one(Call, call_id).state == "completed":
                        break
                sleep(0.01)

    with Session(engine) as verification:
        stored = verification.get_one(Call, call_id)
        assert stored.state == "completed"
        assert stored.outcome == "client_disconnected"


def test_websocket_enforces_maximum_duration(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    settings, engine, session = _setup(tmp_path / "voice-duration.db")
    call = _eligible_call(session)
    call.max_duration_seconds = 0
    session.commit()
    call_id = call.id
    session.close()
    monkeypatch.setattr(voice_main, "get_settings", lambda: settings)
    monkeypatch.setattr(voice_main, "get_engine", lambda: engine)
    token = create_access_token(
        user_id=USER_ID,
        organization_id=ORGANIZATION_ID,
        settings=settings,
        lifetime=timedelta(minutes=5),
    )

    with TestClient(voice_main.app) as client:
        client.cookies.set("sales_agent_session", token)
        with client.websocket_connect(f"/api/v1/voice/calls/{call_id}") as websocket:
            assert websocket.receive_json()["event"] == "session.started"
            assert websocket.receive_json()["event"] == "agent.response"
            assert websocket.receive_json() == {
                "event": "session.ending",
                "reason": "max_duration_reached",
            }
            assert websocket.receive_json() == {
                "event": "session.completed",
                "outcome": "max_duration_reached",
            }

    with Session(engine) as verification:
        stored = verification.get_one(Call, call_id)
        assert stored.state == "completed"
        assert stored.outcome == "max_duration_reached"
