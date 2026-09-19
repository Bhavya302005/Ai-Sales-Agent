from collections.abc import Generator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from database.seeds.demo import seed_demo
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.auth import create_access_token
from app.config import Settings, get_settings
from app.db import get_session
from app.demo_ids import CONTACT_ID, LEAD_ID, ORGANIZATION_ID, SOURCE_ID, USER_ID
from app.main import app
from app.persistence.models import (
    Base,
    Call,
    HandoffTask,
    Membership,
    Organization,
    OutboxEvent,
)


def test_second_tenant_cannot_read_or_mutate_first_tenant_resources(tmp_path: Path) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'tenant-matrix.db'}"
    settings = Settings(
        app_env="test",
        database_url=database_url,
        call_window_start_hour=0,
        call_window_end_hour=24,
    )
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    assert seed_demo(database_url)
    second_organization_id = uuid4()
    second_user_id = uuid4()
    call_id = uuid4()
    handoff_id = uuid4()
    event_id = uuid4()
    with Session(engine) as setup:
        setup.add(Organization(id=second_organization_id, name="Isolated tenant"))
        setup.flush()
        setup.add(
            Membership(
                organization_id=second_organization_id,
                user_id=second_user_id,
                role="owner",
                status="active",
            )
        )
        setup.add(
            Call(
                id=call_id,
                organization_id=ORGANIZATION_ID,
                lead_id=LEAD_ID,
                contact_id=CONTACT_ID,
                attempt_id=uuid4(),
                transport="browser",
                state="completed",
                eligibility_decision={"eligible": True, "checks": []},
                max_duration_seconds=60,
                started_at=datetime.now(UTC),
                ended_at=datetime.now(UTC),
                usage={"actual_call_seconds": 1},
                outcome="qualified",
            )
        )
        setup.flush()
        setup.add(
            HandoffTask(
                id=handoff_id,
                organization_id=ORGANIZATION_ID,
                lead_id=LEAD_ID,
                call_id=call_id,
                owner_id=USER_ID,
                priority="high",
                reason="Tenant-private reason",
                due_at=datetime.now(UTC) + timedelta(hours=1),
                state="pending",
            )
        )
        setup.add(
            OutboxEvent(
                organization_id=ORGANIZATION_ID,
                event_id=event_id,
                event_type="crm.sync_requested.v1",
                aggregate_type="handoff_task",
                aggregate_id=handoff_id,
                payload_ref=f"handoff:{handoff_id}",
                correlation_id=uuid4(),
                schema_version=1,
                attempts=0,
                state="pending",
            )
        )
        setup.commit()

    def session_override() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_settings] = lambda: settings
    token = create_access_token(
        user_id=second_user_id,
        organization_id=second_organization_id,
        settings=settings,
        lifetime=timedelta(minutes=5),
    )
    headers = {"Authorization": f"Bearer {token}"}

    try:
        with TestClient(app) as client:
            hidden_responses = [
                client.get(f"/api/v1/leads/{LEAD_ID}", headers=headers),
                client.get(f"/api/v1/calls/{call_id}", headers=headers),
                client.get(f"/api/v1/calls/{call_id}/detail", headers=headers),
                client.post(f"/api/v1/calls/{call_id}/stop", headers=headers),
                client.get(f"/api/v1/jobs/{event_id}", headers=headers),
                client.post(
                    f"/api/v1/handoffs/{handoff_id}/sync-crm",
                    headers={**headers, "Idempotency-Key": "tenant-isolation-sync"},
                ),
                client.post(
                    f"/api/v1/sources/{SOURCE_ID}/extract",
                    headers={**headers, "Idempotency-Key": "tenant-isolation-extract"},
                ),
                client.get("/api/v1/knowledge/offering", headers=headers),
            ]
            empty_lists = [
                client.get("/api/v1/leads", headers=headers),
                client.get("/api/v1/sources", headers=headers),
                client.get("/api/v1/campaigns", headers=headers),
            ]
            funnel = client.get("/api/v1/analytics/funnel", headers=headers)
            usage = client.get("/api/v1/analytics/usage", headers=headers)
    finally:
        app.dependency_overrides.clear()

    assert all(response.status_code == 404 for response in hidden_responses)
    assert all(response.status_code == 200 and response.json() == [] for response in empty_lists)
    assert funnel.json() == {
        "discovered": 0,
        "reviewed": 0,
        "approved": 0,
        "called": 0,
        "qualified": 0,
        "handed_off": 0,
    }
    assert usage.json()["total_estimated_cost_inr"] == "0"
    serialized = " ".join(response.text for response in [*hidden_responses, *empty_lists])
    assert "Narmada" not in serialized
    assert str(call_id) not in serialized
    assert str(handoff_id) not in serialized
