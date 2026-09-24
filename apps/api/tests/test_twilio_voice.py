from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path
from time import monotonic, sleep
from types import SimpleNamespace
from uuid import UUID

from database.seeds.demo import seed_demo
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from twilio.base.exceptions import TwilioRestException
from twilio.request_validator import RequestValidator

import app.voice_main as voice_main
from app.auth import create_access_token
from app.config import Settings, get_settings
from app.db import get_session
from app.demo_ids import CAMPAIGN_ID, CONTACT_ID, LEAD_ID, ORGANIZATION_ID, USER_ID
from app.main import app
from app.persistence.models import Call, ExternalMapping, ProviderWebhookEvent, TranscriptSegment
from app.twilio_voice import (
    TwilioDispatch,
    create_twilio_call,
    public_http_url,
    public_websocket_url,
)

PROVIDER_SID = "CA11111111111111111111111111111111"


def _settings(database_url: str) -> Settings:
    return Settings(
        app_env="test",
        database_url=database_url,
        voice_transport="twilio",
        enable_outbound_pstn=True,
        public_voice_base_url="https://voice.example.test",
        twilio_account_sid="AC11111111111111111111111111111111",
        twilio_auth_token="test-auth-token",
        twilio_from_number="+12025550100",
        twilio_test_to_number="+919999999999",
        call_window_start_hour=0,
        call_window_end_hour=24,
        max_call_seconds=60,
    )


def _headers(settings: Settings, key: str | None = None) -> dict[str, str]:
    from datetime import timedelta

    token = create_access_token(
        user_id=USER_ID,
        organization_id=ORGANIZATION_ID,
        settings=settings,
        lifetime=timedelta(minutes=5),
    )
    headers = {"Authorization": f"Bearer {token}"}
    if key:
        headers["Idempotency-Key"] = key
    return headers


@contextmanager
def _api_client(
    database_path: Path,
) -> Generator[tuple[TestClient, Settings, object], None, None]:
    database_url = f"sqlite+pysqlite:///{database_path}"
    settings = _settings(database_url)
    engine = create_engine(database_url)
    from app.persistence.models import Base

    Base.metadata.create_all(engine)
    assert seed_demo(database_url)

    def session_override() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as client:
            yield client, settings, engine
    finally:
        app.dependency_overrides.clear()


def _request_payload() -> dict[str, str]:
    return {
        "lead_id": str(LEAD_ID),
        "contact_id": str(CONTACT_ID),
        "campaign_id": str(CAMPAIGN_ID),
        "transport": "twilio",
    }


def _signature(settings: Settings, url: str, params: dict[str, str]) -> str:
    assert settings.twilio_auth_token
    return RequestValidator(settings.twilio_auth_token.get_secret_value()).compute_signature(
        url, params
    )


def test_trial_parameter_restriction_falls_back_to_minimal_call_request(
    tmp_path: Path, monkeypatch
) -> None:
    settings = _settings(f"sqlite+pysqlite:///{tmp_path / 'unused.db'}")
    requests: list[dict[str, object]] = []

    class FakeCalls:
        def create(self, **kwargs: object) -> object:
            requests.append(kwargs)
            if len(requests) == 1:
                raise TwilioRestException(
                    400,
                    "/Calls.json",
                    "Invalid parameters - trial accounts have limited parameter access",
                )
            return SimpleNamespace(sid=PROVIDER_SID, status="queued")

    class FakeClient:
        def __init__(self, account_sid: str, auth_token: str) -> None:
            self.calls = FakeCalls()

    monkeypatch.setattr("app.twilio_voice.Client", FakeClient)
    result = create_twilio_call(
        settings,
        call_id=UUID("66666666-6666-6666-6666-666666666666"),
    )

    assert len(requests) == 2
    assert set(requests[1]) == {"to", "from_", "url"}
    assert result.limited_callbacks is True


def test_pstn_requires_separate_consent_then_dispatches_once_without_exposing_number(
    tmp_path: Path, monkeypatch
) -> None:
    with _api_client(tmp_path / "twilio-api.db") as (client, settings, engine):
        client.post(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/leads/{LEAD_ID}/approve",
            headers=_headers(settings),
        )
        blocked = client.post(
            "/api/v1/calls/requests",
            headers=_headers(settings, "pstn-before-consent"),
            json=_request_payload(),
        )
        consented = client.post(
            f"/api/v1/contacts/{CONTACT_ID}/pstn-consent",
            headers=_headers(settings),
            json={"attested": True},
        )
        eligible = client.post(
            "/api/v1/calls/requests",
            headers=_headers(settings, "pstn-after-consent"),
            json=_request_payload(),
        )
        monkeypatch.setattr(
            "app.twilio_voice.create_twilio_call",
            lambda settings, call_id: TwilioDispatch(sid=PROVIDER_SID, status="queued"),
        )
        dispatched = client.post(
            f"/api/v1/calls/{eligible.json()['id']}/dispatch",
            headers=_headers(settings),
        )
        repeated = client.post(
            f"/api/v1/calls/{eligible.json()['id']}/dispatch",
            headers=_headers(settings),
        )

    assert blocked.json()["state"] == "blocked"
    consent_check = next(
        item
        for item in blocked.json()["eligibility_checks"]
        if item["name"] == "active_test_consent"
    )
    assert consent_check["passed"] is False
    assert consented.status_code == 204
    assert eligible.json()["state"] == "eligible"
    assert dispatched.json()["state"] == "connecting"
    assert repeated.json()["state"] == "connecting"
    assert "+919999999999" not in dispatched.text
    assert PROVIDER_SID not in dispatched.text
    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(ExternalMapping)) == 1


def test_signed_twiml_and_conversation_relay_persist_transcript(
    tmp_path: Path, monkeypatch
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'twilio-voice.db'}"
    settings = _settings(database_url)
    engine = create_engine(database_url)
    from app.persistence.models import Base

    Base.metadata.create_all(engine)
    assert seed_demo(database_url)
    with Session(engine) as session:
        call = Call(
            organization_id=ORGANIZATION_ID,
            lead_id=LEAD_ID,
            contact_id=CONTACT_ID,
            attempt_id=UUID("22222222-2222-2222-2222-222222222222"),
            transport="twilio",
            state="connecting",
            eligibility_decision={"eligible": True, "checks": []},
            max_duration_seconds=60,
            usage={"reserved_cost_inr": "15", "reservation_status": "reserved"},
        )
        session.add(call)
        session.flush()
        call_id = call.id
        session.add(
            ExternalMapping(
                organization_id=ORGANIZATION_ID,
                provider="twilio",
                local_type="call",
                local_id=call.id,
                external_type="call",
                external_id=PROVIDER_SID,
            )
        )
        session.commit()

    monkeypatch.setattr(voice_main, "get_settings", lambda: settings)
    monkeypatch.setattr(voice_main, "get_engine", lambda: engine)
    twiml_path = f"/api/v1/twilio/calls/{call_id}/twiml"
    form = {"CallSid": PROVIDER_SID, "AccountSid": str(settings.twilio_account_sid)}
    signature = _signature(settings, public_http_url(settings, twiml_path), form)
    ws_path = f"/api/v1/twilio/conversation/{call_id}"
    ws_signature = _signature(settings, public_websocket_url(settings, ws_path), {})

    with TestClient(voice_main.app) as client:
        rejected = client.post(twiml_path, data=form, headers={"X-Twilio-Signature": "bad"})
        with Session(engine) as session:
            trial_call = session.get_one(Call, call_id)
            trial_call.usage = {
                **trial_call.usage,
                "provider_callback_mode": "trial_limited",
            }
            session.commit()
        unsigned_trial = client.post(twiml_path, data=form)
        twiml = client.post(
            twiml_path,
            data=form,
            headers={"X-Twilio-Signature": signature},
        )
        with client.websocket_connect(
            ws_path, headers={"X-Twilio-Signature": ws_signature}
        ) as websocket:
            websocket.send_json(
                {
                    "type": "setup",
                    "accountSid": settings.twilio_account_sid,
                    "callSid": PROVIDER_SID,
                    "customParameters": {"localCallId": str(call_id)},
                }
            )
            # Twilio documents that some ConversationRelay error notifications are
            # recoverable and do not end the session.
            websocket.send_json(
                {
                    "type": "error",
                    "description": "A recoverable provider warning",
                }
            )
            websocket.send_json(
                {
                    "type": "prompt",
                    "voicePrompt": "No, not now.",
                    "lang": "en-IN",
                    "last": True,
                }
            )
            reply = websocket.receive_json()
            assert reply["type"] == "text"
            assert reply["last"] is True
            ended = websocket.receive_json()
            assert ended["type"] == "end"

    assert rejected.status_code == 403
    assert unsigned_trial.status_code == 200
    assert twiml.status_code == 200
    assert "ConversationRelay" in twiml.text
    assert "wss://voice.example.test" in twiml.text
    deadline = monotonic() + 2
    stored_state = "active"
    while monotonic() < deadline:
        with Session(engine) as poll:
            stored_state = poll.get_one(Call, call_id).state
        if stored_state == "completed":
            break
        sleep(0.02)
    with Session(engine) as session:
        stored = session.get_one(Call, call_id)
        segments = session.scalars(
            select(TranscriptSegment)
            .where(TranscriptSegment.call_id == call_id)
            .order_by(TranscriptSegment.sequence)
        ).all()
        assert stored.state == "completed"
        assert [(segment.sequence, segment.speaker) for segment in segments] == [
            (0, "agent"),
            (1, "participant"),
            (2, "agent"),
        ]


def test_signed_status_callback_is_idempotent_and_releases_failed_call_budget(
    tmp_path: Path, monkeypatch
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'twilio-status.db'}"
    settings = _settings(database_url)
    engine = create_engine(database_url)
    from app.persistence.models import Base

    Base.metadata.create_all(engine)
    assert seed_demo(database_url)
    with Session(engine) as session:
        call = Call(
            organization_id=ORGANIZATION_ID,
            lead_id=LEAD_ID,
            contact_id=CONTACT_ID,
            attempt_id=UUID("33333333-3333-3333-3333-333333333333"),
            transport="twilio",
            state="connecting",
            eligibility_decision={"eligible": True, "checks": []},
            max_duration_seconds=60,
            usage={"reserved_cost_inr": "15", "reservation_status": "reserved"},
        )
        session.add(call)
        session.flush()
        call_id = call.id
        session.add(
            ExternalMapping(
                organization_id=ORGANIZATION_ID,
                provider="twilio",
                local_type="call",
                local_id=call.id,
                external_type="call",
                external_id=PROVIDER_SID,
            )
        )
        session.commit()
    monkeypatch.setattr(voice_main, "get_settings", lambda: settings)
    monkeypatch.setattr(voice_main, "get_engine", lambda: engine)
    path = "/api/v1/twilio/calls/status"
    form = {
        "AccountSid": str(settings.twilio_account_sid),
        "CallSid": PROVIDER_SID,
        "CallStatus": "no-answer",
        "SequenceNumber": "3",
    }
    signature = _signature(settings, public_http_url(settings, path), form)
    with TestClient(voice_main.app) as client:
        first = client.post(path, data=form, headers={"X-Twilio-Signature": signature})
        repeated = client.post(path, data=form, headers={"X-Twilio-Signature": signature})

    assert first.status_code == 204
    assert repeated.status_code == 204
    with Session(engine) as session:
        stored = session.get_one(Call, call_id)
        assert stored.state == "failed"
        assert stored.outcome == "twilio_no_answer"
        assert stored.usage["reservation_status"] == "released"
        assert session.scalar(select(func.count()).select_from(ProviderWebhookEvent)) == 1


def test_completed_status_recovers_when_conversation_action_callback_is_missed(
    tmp_path: Path, monkeypatch
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'twilio-completed.db'}"
    settings = _settings(database_url)
    engine = create_engine(database_url)
    from app.persistence.models import Base

    Base.metadata.create_all(engine)
    assert seed_demo(database_url)
    with Session(engine) as session:
        call = Call(
            organization_id=ORGANIZATION_ID,
            lead_id=LEAD_ID,
            contact_id=CONTACT_ID,
            attempt_id=UUID("44444444-4444-4444-4444-444444444444"),
            transport="twilio",
            state="active",
            eligibility_decision={"eligible": True, "checks": []},
            max_duration_seconds=60,
            usage={"reserved_cost_inr": "15", "reservation_status": "reserved"},
        )
        session.add(call)
        session.flush()
        call_id = call.id
        session.add(
            ExternalMapping(
                organization_id=ORGANIZATION_ID,
                provider="twilio",
                local_type="call",
                local_id=call.id,
                external_type="call",
                external_id=PROVIDER_SID,
            )
        )
        session.commit()

    monkeypatch.setattr(voice_main, "get_settings", lambda: settings)
    monkeypatch.setattr(voice_main, "get_engine", lambda: engine)
    path = "/api/v1/twilio/calls/status"
    form = {
        "AccountSid": str(settings.twilio_account_sid),
        "CallSid": PROVIDER_SID,
        "CallStatus": "completed",
        "SequenceNumber": "4",
    }
    signature = _signature(settings, public_http_url(settings, path), form)
    with TestClient(voice_main.app) as client:
        response = client.post(path, data=form, headers={"X-Twilio-Signature": signature})

    assert response.status_code == 204
    with Session(engine) as session:
        stored = session.get_one(Call, call_id)
        assert stored.state == "completed"
        assert stored.outcome == "twilio_completed"
        assert stored.usage["reservation_status"] == "consumed"


def test_failed_conversation_action_releases_budget_instead_of_marking_success(
    tmp_path: Path, monkeypatch
) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'twilio-session-failed.db'}"
    settings = _settings(database_url)
    engine = create_engine(database_url)
    from app.persistence.models import Base

    Base.metadata.create_all(engine)
    assert seed_demo(database_url)
    with Session(engine) as session:
        call = Call(
            organization_id=ORGANIZATION_ID,
            lead_id=LEAD_ID,
            contact_id=CONTACT_ID,
            attempt_id=UUID("55555555-5555-5555-5555-555555555555"),
            transport="twilio",
            state="active",
            eligibility_decision={"eligible": True, "checks": []},
            max_duration_seconds=60,
            usage={"reserved_cost_inr": "15", "reservation_status": "reserved"},
        )
        session.add(call)
        session.flush()
        call_id = call.id
        session.add(
            ExternalMapping(
                organization_id=ORGANIZATION_ID,
                provider="twilio",
                local_type="call",
                local_id=call.id,
                external_type="call",
                external_id=PROVIDER_SID,
            )
        )
        session.commit()

    monkeypatch.setattr(voice_main, "get_settings", lambda: settings)
    monkeypatch.setattr(voice_main, "get_engine", lambda: engine)
    path = f"/api/v1/twilio/calls/{call_id}/ended"
    form = {
        "AccountSid": str(settings.twilio_account_sid),
        "CallSid": PROVIDER_SID,
        "CallStatus": "in-progress",
        "SessionStatus": "failed",
        "ErrorCode": "64102",
    }
    signature = _signature(settings, public_http_url(settings, path), form)
    with TestClient(voice_main.app) as client:
        response = client.post(path, data=form, headers={"X-Twilio-Signature": signature})

    assert response.status_code == 204
    with Session(engine) as session:
        stored = session.get_one(Call, call_id)
        assert stored.state == "failed"
        assert stored.outcome == "twilio_conversation_relay_failed"
        assert stored.usage["reservation_status"] == "released"
        assert stored.usage["provider_error_code"] == "64102"
