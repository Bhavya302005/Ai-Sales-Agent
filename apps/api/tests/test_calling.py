from collections.abc import Generator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

from database.seeds.demo import seed_demo
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.auth import create_access_token
from app.config import Settings, get_settings
from app.db import get_session
from app.demo_ids import (
    CAMPAIGN_ID,
    CONTACT_ID,
    LEAD_ID,
    ORGANIZATION_ID,
    USER_ID,
)
from app.main import app
from app.persistence.models import (
    Base,
    Call,
    Campaign,
    ConsentRecord,
    Contact,
    Lead,
    Product,
    Suppression,
)


@contextmanager
def _client(
    database_path: Path, *, kill_switch: bool = False
) -> Generator[tuple[TestClient, Settings, Session], None, None]:
    database_url = f"sqlite+pysqlite:///{database_path}"
    settings = Settings(
        app_env="test",
        database_url=database_url,
        call_window_start_hour=0,
        call_window_end_hour=24,
        calls_kill_switch=kill_switch,
    )
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    assert seed_demo(database_url)
    session = Session(engine)

    def session_override() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as client:
        yield client, settings, session
    app.dependency_overrides.clear()
    session.close()


def _headers(settings: Settings, key: str | None = None) -> dict[str, str]:
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


def _payload() -> dict[str, str]:
    return {
        "lead_id": str(LEAD_ID),
        "contact_id": str(CONTACT_ID),
        "campaign_id": str(CAMPAIGN_ID),
    }


def test_unapproved_campaign_is_blocked_with_human_readable_reason_and_stable_attempt(
    tmp_path: Path,
) -> None:
    with _client(tmp_path / "blocked.db") as (client, settings, session):
        headers = _headers(settings, "blocked-call-request")
        first = client.post("/api/v1/calls/requests", headers=headers, json=_payload())
        repeated = client.post("/api/v1/calls/requests", headers=headers, json=_payload())
        call_count = session.scalar(select(func.count()).select_from(Call))

    assert first.status_code == 201
    assert first.json()["state"] == "blocked"
    assert first.json()["eligible"] is False
    campaign_check = next(
        item for item in first.json()["eligibility_checks"] if item["name"] == "campaign_approval"
    )
    assert campaign_check["passed"] is False
    assert "approve" in campaign_check["reason"]
    assert repeated.json()["id"] == first.json()["id"]
    assert repeated.json()["attempt_id"] == first.json()["attempt_id"]
    assert repeated.json()["created"] is False
    assert call_count == 1


def test_approved_consenting_demo_lead_reserves_budget_and_stop_is_immediate(
    tmp_path: Path,
) -> None:
    with _client(tmp_path / "eligible.db") as (client, settings, session):
        approved = client.post(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/leads/{LEAD_ID}/approve",
            headers=_headers(settings),
        )
        created = client.post(
            "/api/v1/calls/requests",
            headers=_headers(settings, "eligible-call-request"),
            json=_payload(),
        )
        stopped = client.post(
            f"/api/v1/calls/{created.json()['id']}/stop",
            headers=_headers(settings),
        )
        lead = session.get_one(Lead, LEAD_ID)

    assert approved.status_code == 200
    assert created.status_code == 201
    assert created.json()["state"] == "eligible"
    assert all(item["passed"] for item in created.json()["eligibility_checks"])
    assert created.json()["usage"]["reservation_status"] == "reserved"
    assert created.json()["max_duration_seconds"] == settings.max_call_seconds
    assert lead.outreach_eligible is True
    assert stopped.json()["state"] == "ending"
    assert stopped.json()["outcome"] == "stop_requested"


def test_already_eligible_campaign_lead_can_prepare_another_rehearsal(
    tmp_path: Path,
) -> None:
    with _client(tmp_path / "repeat-rehearsal.db") as (client, settings, session):
        client.post(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/leads/{LEAD_ID}/approve",
            headers=_headers(settings),
        )
        first = client.post(
            "/api/v1/calls/requests",
            headers=_headers(settings, "first-rehearsal"),
            json=_payload(),
        )
        first_call = session.get_one(Call, UUID(first.json()["id"]))
        first_call.state = "completed"
        first_call.usage = {**first_call.usage, "reservation_status": "released"}
        session.commit()
        second = client.post(
            "/api/v1/calls/requests",
            headers=_headers(settings, "second-rehearsal"),
            json=_payload(),
        )

    assert first.json()["state"] == "eligible"
    assert second.json()["state"] == "eligible"
    assert second.json()["id"] != first.json()["id"]
    assert all(item["passed"] for item in second.json()["eligibility_checks"])


def test_provider_dispatch_failure_does_not_consume_the_only_call_attempt(
    tmp_path: Path,
) -> None:
    with _client(tmp_path / "dispatch-retry.db") as (client, settings, session):
        campaign = session.get_one(Campaign, CAMPAIGN_ID)
        campaign.max_attempts = 1
        session.commit()
        client.post(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/leads/{LEAD_ID}/approve",
            headers=_headers(settings),
        )
        first = client.post(
            "/api/v1/calls/requests",
            headers=_headers(settings, "failed-provider-dispatch"),
            json=_payload(),
        )
        first_call = session.get_one(Call, UUID(first.json()["id"]))
        first_call.state = "failed"
        first_call.outcome = "provider_dispatch_failed"
        first_call.usage = {**first_call.usage, "reservation_status": "released"}
        session.commit()
        second = client.post(
            "/api/v1/calls/requests",
            headers=_headers(settings, "retry-after-provider-dispatch"),
            json=_payload(),
        )

    assert first.json()["state"] == "eligible"
    assert second.json()["state"] == "eligible"
    assert second.json()["id"] != first.json()["id"]


def test_suppression_overrides_approval_and_consent(tmp_path: Path) -> None:
    with _client(tmp_path / "suppressed.db") as (client, settings, session):
        contact = session.get_one(Contact, CONTACT_ID)
        session.add(
            Suppression(
                organization_id=ORGANIZATION_ID,
                channel="browser_voice",
                identifier_hash=contact.identifier_hash,
                reason="Test participant opted out",
                scope="all_campaigns",
                expires_at=None,
            )
        )
        campaign = session.get_one(Campaign, CAMPAIGN_ID)
        session.commit()
        assert campaign.status == "active"
        client.post(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/leads/{LEAD_ID}/approve",
            headers=_headers(settings),
        )
        response = client.post(
            "/api/v1/calls/requests",
            headers=_headers(settings, "suppressed-call-request"),
            json=_payload(),
        )

    suppression_check = next(
        item for item in response.json()["eligibility_checks"] if item["name"] == "not_suppressed"
    )
    assert response.json()["state"] == "blocked"
    assert suppression_check["passed"] is False


def test_global_kill_switch_blocks_call(tmp_path: Path) -> None:
    with _client(tmp_path / "kill-switch.db", kill_switch=True) as (client, settings, _):
        client.post(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/leads/{LEAD_ID}/approve",
            headers=_headers(settings),
        )
        response = client.post(
            "/api/v1/calls/requests",
            headers=_headers(settings, "kill-switch-request"),
            json=_payload(),
        )

    kill_check = next(
        item for item in response.json()["eligibility_checks"] if item["name"] == "kill_switch"
    )
    assert response.json()["state"] == "blocked"
    assert kill_check["passed"] is False


def test_expired_consent_blocks_call_even_after_campaign_approval(tmp_path: Path) -> None:
    with _client(tmp_path / "expired-consent.db") as (client, settings, session):
        consent = session.scalar(
            select(ConsentRecord).where(ConsentRecord.contact_id == CONTACT_ID)
        )
        assert consent is not None
        consent.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        session.commit()
        client.post(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/leads/{LEAD_ID}/approve",
            headers=_headers(settings),
        )
        response = client.post(
            "/api/v1/calls/requests",
            headers=_headers(settings, "expired-consent-request"),
            json=_payload(),
        )

    check = next(
        item for item in response.json()["eligibility_checks"]
        if item["name"] == "active_test_consent"
    )
    assert response.json()["state"] == "blocked"
    assert check["passed"] is False


def test_inactive_product_version_blocks_call(tmp_path: Path) -> None:
    with _client(tmp_path / "inactive-product.db") as (client, settings, session):
        product = session.scalar(select(Product).where(Product.organization_id == ORGANIZATION_ID))
        assert product is not None
        product.active_version_id = None
        session.commit()
        client.post(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/leads/{LEAD_ID}/approve",
            headers=_headers(settings),
        )
        response = client.post(
            "/api/v1/calls/requests",
            headers=_headers(settings, "inactive-product-request"),
            json=_payload(),
        )

    check = next(
        item for item in response.json()["eligibility_checks"]
        if item["name"] == "approved_product"
    )
    assert response.json()["state"] == "blocked"
    assert check["passed"] is False


def test_exhausted_campaign_budget_blocks_call_without_reserving_spend(tmp_path: Path) -> None:
    with _client(tmp_path / "exhausted-budget.db") as (client, settings, session):
        campaign = session.get_one(Campaign, CAMPAIGN_ID)
        campaign.daily_budget_inr = 0
        session.commit()
        client.post(
            f"/api/v1/campaigns/{CAMPAIGN_ID}/leads/{LEAD_ID}/approve",
            headers=_headers(settings),
        )
        response = client.post(
            "/api/v1/calls/requests",
            headers=_headers(settings, "exhausted-budget-request"),
            json=_payload(),
        )

    check = next(
        item for item in response.json()["eligibility_checks"]
        if item["name"] == "remaining_budget"
    )
    assert response.json()["state"] == "blocked"
    assert response.json()["usage"]["reservation_status"] == "not_reserved"
    assert check["passed"] is False
