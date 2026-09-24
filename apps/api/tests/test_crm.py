from collections.abc import Generator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from database.seeds.demo import seed_demo
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

import app.crm.service as crm_service
import app.jobs.service as jobs_service
from app.auth import create_access_token
from app.config import Settings, get_settings
from app.crm.providers import CrmPermanentError, CrmTaskPayload, HubSpotCrmProvider
from app.db import get_session
from app.demo_ids import LEAD_ID, ORGANIZATION_ID, USER_ID
from app.main import app
from app.persistence.models import Base, ExternalMapping, HandoffTask


def _setup(database_path: Path, *, crm_mode: str = "mock") -> tuple[Settings, Session]:
    database_url = f"sqlite+pysqlite:///{database_path}"
    values: dict[str, object] = {
        "app_env": "test",
        "database_url": database_url,
        "crm_mode": crm_mode,
    }
    if crm_mode == "hubspot":
        values["hubspot_access_token"] = "test-token"
    settings = Settings(**values)
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    assert seed_demo(database_url)
    return settings, Session(engine)


def _handoff(session: Session) -> HandoffTask:
    handoff = HandoffTask(
        organization_id=ORGANIZATION_ID,
        lead_id=LEAD_ID,
        call_id=None,
        owner_id=USER_ID,
        priority="high",
        reason="Positive interest requires a human follow-up.",
        due_at=datetime.now(UTC) + timedelta(hours=4),
        state="open",
        external_reference=None,
    )
    session.add(handoff)
    session.commit()
    return handoff


def _headers(settings: Settings, key: str) -> dict[str, str]:
    token = create_access_token(
        user_id=USER_ID,
        organization_id=ORGANIZATION_ID,
        settings=settings,
        lifetime=timedelta(minutes=5),
    )
    return {"Authorization": f"Bearer {token}", "Idempotency-Key": key}


def test_mock_crm_sync_is_logically_and_request_idempotent(tmp_path: Path) -> None:
    settings, session = _setup(tmp_path / "mock-crm.db")
    handoff = _handoff(session)

    def session_override() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_settings] = lambda: settings
    jobs_service.get_settings.cache_clear()
    with TestClient(app) as client:
        first = client.post(
            f"/api/v1/handoffs/{handoff.id}/sync-crm",
            headers=_headers(settings, "crm-idempotency-key"),
        )
        repeated = client.post(
            f"/api/v1/handoffs/{handoff.id}/sync-crm",
            headers=_headers(settings, "crm-idempotency-key"),
        )
    app.dependency_overrides.clear()

    session.refresh(handoff)
    assert first.status_code == 202
    assert first.json()["state"] == "completed"
    assert first.json()["created"] is True
    assert repeated.json()["event_id"] == first.json()["event_id"]
    assert repeated.json()["created"] is False
    assert handoff.external_reference is not None
    assert handoff.external_reference.startswith("mock://crm/tasks/")
    assert session.scalar(select(func.count()).select_from(ExternalMapping)) == 1
    session.close()


def test_revoked_hubspot_credentials_become_action_required(
    tmp_path: Path, monkeypatch
) -> None:
    settings, session = _setup(tmp_path / "revoked-crm.db", crm_mode="hubspot")
    handoff = _handoff(session)

    def session_override() -> Generator[Session, None, None]:
        yield session

    def rejected_sync(*args, **kwargs):
        raise CrmPermanentError("HubSpot credentials are invalid or revoked")

    monkeypatch.setattr(crm_service, "sync_handoff", rejected_sync)
    monkeypatch.setattr(jobs_service, "get_settings", lambda: settings)
    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as client:
        response = client.post(
            f"/api/v1/handoffs/{handoff.id}/sync-crm",
            headers=_headers(settings, "revoked-credential-key"),
        )
    app.dependency_overrides.clear()

    assert response.status_code == 202
    assert response.json()["state"] == "action_required"
    assert response.json()["last_error_code"] == "PermanentJobError"
    session.close()


def test_hubspot_adapter_uses_pinned_task_endpoint_and_reads_back() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.method == "POST":
            return httpx.Response(201, json={"id": "task-42", "url": "https://example/task-42"})
        return httpx.Response(200, json={"id": "task-42"})

    client = httpx.Client(
        transport=httpx.MockTransport(handler),
        base_url="https://api.hubapi.com",
    )
    adapter = HubSpotCrmProvider(access_token="secret", client=client)
    result = adapter.sync_task(
        CrmTaskPayload(
            local_id=uuid4(),
            subject="Follow up",
            body="Structured qualification only",
            due_at=datetime(2026, 9, 18, tzinfo=UTC),
            priority="high",
        )
    )

    assert result.verified is True
    assert [request.url.path for request in requests] == [
        "/crm/objects/2026-03/tasks",
        "/crm/objects/2026-03/tasks/task-42",
    ]
    assert requests[0].headers["authorization"] == "Bearer secret"
    client.close()


def test_hubspot_error_never_exposes_provider_body_or_token() -> None:
    leaked_value = "provider-secret-that-must-not-leak"

    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": leaked_value})

    client = httpx.Client(
        transport=httpx.MockTransport(handler),
        base_url="https://api.hubapi.com",
    )
    adapter = HubSpotCrmProvider(access_token=leaked_value, client=client)

    with pytest.raises(CrmPermanentError) as captured:
        adapter.sync_task(
            CrmTaskPayload(
                local_id=uuid4(),
                subject="Follow up",
                body="Structured qualification only",
                due_at=datetime(2026, 9, 18, tzinfo=UTC),
                priority="high",
            )
        )

    assert leaked_value not in str(captured.value)
    assert "credentials are invalid or revoked" in str(captured.value)
    client.close()
