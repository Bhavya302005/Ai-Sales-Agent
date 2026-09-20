from pathlib import Path
from uuid import UUID

import httpx
import pytest
from database.seeds.demo import seed_demo
from pydantic import SecretStr
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.demo_ids import CAMPAIGN_ID, CONTACT_ID, LEAD_ID, ORGANIZATION_ID
from app.omnidim_voice import (
    OmniDimClient,
    OmniDimDispatch,
    OmniDimPermanentError,
    OmniDimRetryableError,
    dispatch_omnidim_call,
)
from app.persistence.models import Base, Call, ExternalMapping

CALL_ID = UUID("00000000-0000-0000-0000-000000000099")


def _settings() -> Settings:
    return Settings(
        app_env="test",
        voice_transport="omnidim",
        enable_outbound_pstn=True,
        omnidim_api_key=SecretStr("synthetic-key"),
        omnidim_agent_id=158910,
        omnidim_test_to_number=SecretStr("+919876543210"),
    )


def test_dispatch_uses_safe_context_and_numeric_request_id() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v1/calls/dispatch"
        payload = __import__("json").loads(request.content)
        assert payload["agent_id"] == 158910
        assert payload["to_number"] == "+919876543210"
        assert payload["metadata"]["source"] == "signalpath_demo"
        return httpx.Response(
            200,
            json={"success": True, "status": "dispatched", "requestId": 3166940},
        )

    http = httpx.Client(
        base_url="https://backend.omnidim.io/api/v1",
        transport=httpx.MockTransport(handler),
    )
    provider = OmniDimClient(_settings(), client=http)
    result = provider.dispatch(call_id=CALL_ID, context={"company": "Synthetic Co"})
    assert result.request_id == "3166940"
    http.close()


@pytest.mark.parametrize(
    ("status", "error_type"),
    [(401, OmniDimPermanentError), (429, OmniDimRetryableError), (503, OmniDimRetryableError)],
)
def test_dispatch_sanitizes_provider_errors(status: int, error_type: type[Exception]) -> None:
    http = httpx.Client(
        base_url="https://backend.omnidim.io/api/v1",
        transport=httpx.MockTransport(
            lambda _: httpx.Response(status, text="secret provider details")
        ),
    )
    provider = OmniDimClient(_settings(), client=http)
    with pytest.raises(error_type) as caught:
        provider.dispatch(call_id=CALL_ID, context={})
    assert "secret provider details" not in str(caught.value)
    http.close()


def test_result_matches_request_and_bounds_provider_data() -> None:
    http = httpx.Client(
        base_url="https://backend.omnidim.io/api/v1",
        transport=httpx.MockTransport(
            lambda _: httpx.Response(
                200,
                json={
                    "call_log_data": [
                        {
                            "call_request_id": {"id": 3166940},
                            "call_status": "completed",
                            "call_duration_in_seconds": 42,
                            "aggregated_estimated_cost": 0.04,
                            "sentiment_score": "Positive",
                            "sentiment_analysis_details": "The prospect requested a follow-up.",
                            "internal_recording_url": "https://omnidim.io/recordings/synthetic.mp3",
                            "extracted_variables": {"interest": "confirmed"},
                            "interactions": [{"user_query": "Yes", "bot_response": "Thank you"}],
                        }
                    ]
                },
            )
        ),
    )
    provider = OmniDimClient(_settings(), client=http)
    result = provider.result("3166940")
    assert result is not None
    assert result.status == "completed"
    assert result.duration_seconds == 42
    assert result.extracted_variables == {"interest": "confirmed"}
    assert result.summary == "The prospect requested a follow-up."
    assert result.recording_url == "https://omnidim.io/recordings/synthetic.mp3"
    http.close()


def test_recording_download_is_bounded_to_omnidim_audio() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/v1/calls/logs":
            return httpx.Response(
                200,
                json={
                    "call_log_data": [
                        {
                            "call_request_id": {"id": 3166940},
                            "call_status": "completed",
                            "internal_recording_url": (
                                "https://media.omnidim.io/recordings/synthetic.mp3"
                            ),
                        }
                    ]
                },
            )
        assert request.url.host == "media.omnidim.io"
        return httpx.Response(200, content=b"synthetic-audio", headers={"content-type": "audio/mpeg"})

    http = httpx.Client(
        base_url="https://backend.omnidim.io/api/v1",
        transport=httpx.MockTransport(handler),
    )
    provider = OmniDimClient(_settings(), client=http)

    assert provider.recording("3166940") == (b"synthetic-audio", "audio/mpeg")
    http.close()


def test_database_dispatch_is_idempotent(tmp_path: Path) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'omnidim.db'}"
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    assert seed_demo(database_url)
    with Session(engine) as session:
        call = Call(
            id=CALL_ID,
            organization_id=ORGANIZATION_ID,
            lead_id=LEAD_ID,
            campaign_id=CAMPAIGN_ID,
            contact_id=CONTACT_ID,
            attempt_id=CALL_ID,
            transport="omnidim",
            state="eligible",
            eligibility_decision={"eligible": True, "checks": []},
            max_duration_seconds=300,
            usage={},
        )
        session.add(call)
        session.commit()

        class FakeClient:
            calls = 0

            def dispatch(self, **_: object) -> OmniDimDispatch:
                self.calls += 1
                return OmniDimDispatch(request_id="3166940", status="dispatched")

        fake = FakeClient()
        first = dispatch_omnidim_call(session, call=call, settings=_settings(), client=fake)
        second = dispatch_omnidim_call(session, call=call, settings=_settings(), client=fake)

        assert first.request_id == second.request_id == "3166940"
        assert fake.calls == 1
        assert (
            session.scalar(
                select(func.count())
                .select_from(ExternalMapping)
                .where(ExternalMapping.provider == "omnidim")
            )
            == 1
        )
