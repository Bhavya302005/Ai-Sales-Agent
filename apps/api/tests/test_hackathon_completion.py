from collections.abc import Generator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path

from database.seeds.demo import seed_demo
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.auth import create_access_token
from app.config import Settings, get_settings
from app.db import get_session
from app.demo_ids import LEAD_ID, ORGANIZATION_ID, USER_ID
from app.main import app
from app.persistence.models import Base, Lead, Product, ProductVersion, Requirement, SourceDocument


@contextmanager
def _client(database_path: Path) -> Generator[tuple[TestClient, Settings, Session], None, None]:
    database_url = f"sqlite+pysqlite:///{database_path}"
    settings = Settings(
        app_env="test",
        database_url=database_url,
        twilio_test_to_number="+919876543210",
        call_window_start_hour=0,
        call_window_end_hour=24,
        exa_discovery_mode="disabled",
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


def _headers(settings: Settings) -> dict[str, str]:
    token = create_access_token(
        user_id=USER_ID,
        organization_id=ORGANIZATION_ID,
        settings=settings,
        lifetime=timedelta(minutes=5),
    )
    return {"Authorization": f"Bearer {token}"}


def test_saved_discovery_is_idempotent_and_hiring_signals_are_not_leads(tmp_path: Path) -> None:
    with _client(tmp_path / "discovery.db") as (client, settings, session):
        first = client.post("/api/v1/discovery/import-demo", headers=_headers(settings))
        second = client.post("/api/v1/discovery/import-demo", headers=_headers(settings))
        hiring_sources = session.scalars(
            select(SourceDocument).where(SourceDocument.opportunity_type == "hiring_signal")
        ).all()
        hiring_requirements = session.scalar(
            select(func.count())
            .select_from(Requirement)
            .join(SourceDocument, SourceDocument.id == Requirement.source_document_id)
            .where(SourceDocument.opportunity_type == "hiring_signal")
        )

    assert first.status_code == 200
    assert first.json()["provider_status"] == "verified_snapshot"
    assert first.json()["received"] == 8
    assert first.json()["created"] == 8
    assert second.json()["created"] == 0
    assert second.json()["duplicates"] == 8
    assert len(hiring_sources) == 4
    assert all(item.discovery_actionable is False for item in hiring_sources)
    assert hiring_requirements == 0


def test_discovery_filters_and_live_failure_keep_snapshot(tmp_path: Path) -> None:
    with _client(tmp_path / "discovery-fallback.db") as (client, settings, session):
        client.post("/api/v1/discovery/import-demo", headers=_headers(settings))
        live = client.post("/api/v1/discovery/refresh", headers=_headers(settings))
        provider_status = client.get("/api/v1/discovery/status", headers=_headers(settings))
        signals = client.get(
            "/api/v1/discovery/results?type=hiring_signal&actionable=false",
            headers=_headers(settings),
        )
        total = session.scalar(select(func.count()).select_from(SourceDocument))

    assert live.status_code == 409
    assert provider_status.json() == {
        "live_refresh_available": False,
        "provider": "not_configured",
        "label": "Connect a discovery provider",
    }
    assert "snapshot results remain available" in live.json()["detail"]
    assert signals.status_code == 200
    assert len(signals.json()) == 4
    assert total == 9  # Seed evidence plus eight canonical discovery records.


def test_profile_update_preserves_old_leads_and_rescores_duplicate_sources(
    tmp_path: Path,
) -> None:
    with _client(tmp_path / "profile-update-leads.db") as (client, settings, session):
        first = client.post("/api/v1/discovery/import-demo", headers=_headers(settings))
        assert first.status_code == 200
        old_leads = session.scalars(select(Lead)).all()
        old_ids = {lead.id for lead in old_leads}
        old_version_ids = {lead.product_version_id for lead in old_leads}

        product = session.scalar(select(Product).where(Product.active_version_id.is_not(None)))
        assert product is not None and product.active_version_id is not None
        previous = session.get(ProductVersion, product.active_version_id)
        assert previous is not None
        updated = ProductVersion(
            organization_id=previous.organization_id,
            product_id=previous.product_id,
            version=previous.version + 1,
            description=previous.description + " Updated profile evidence.",
            icp=previous.icp,
            exclusions=previous.exclusions,
            facts=previous.facts,
            pricing_policy=previous.pricing_policy,
            approved_at=datetime.now(UTC),
            approved_by=previous.approved_by,
        )
        session.add(updated)
        session.flush()
        product.active_version_id = updated.id
        session.commit()

        repeated = client.post("/api/v1/discovery/import-demo", headers=_headers(settings))
        all_leads = session.scalars(select(Lead)).all()

        assert repeated.status_code == 200
        assert repeated.json()["created"] == 0
        assert old_ids <= {lead.id for lead in all_leads}
        assert old_version_ids <= {lead.product_version_id for lead in all_leads}
        assert any(lead.product_version_id == updated.id for lead in all_leads)


def test_live_refresh_returns_honest_empty_success(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path / "empty-live-refresh.db") as (client, settings, _session):
        settings.exa_discovery_mode = "mcp"
        monkeypatch.setattr("app.discovery.api.discover_with_exa", lambda *args, **kwargs: [])

        response = client.post("/api/v1/discovery/refresh", headers=_headers(settings))

    assert response.status_code == 200
    assert response.json()["provider_status"] == "live"
    assert response.json()["received"] == 0
    assert response.json()["created"] == 0


def test_calling_only_csv_import_is_bounded_and_never_returns_phone(tmp_path: Path) -> None:
    with _client(tmp_path / "calling-only.db") as (client, settings, session):
        campaign = client.post(
            "/api/v1/campaigns",
            headers={**_headers(settings), "Content-Type": "application/json"},
            json={
                "name": "Calling only demo",
                "mode": "calling_only",
                "timezone": "Asia/Kolkata",
                "recurrence": "once",
                "max_attempts": 2,
                "daily_budget_inr": 100,
            },
        )
        csv_content = (
            "company,requirement,source_url,contact_name,phone,location,timezone,consent_basis\n"
            "Orchid Manufacturing,ERP cloud migration,https://example.com/erp,Asha,"
            "+919876543210,Mumbai,Asia/Kolkata,verified test participant\n"
        )
        imported = client.post(
            "/api/v1/leads/import",
            headers=_headers(settings),
            data={"campaign_id": campaign.json()["id"]},
            files={"file": ("leads.csv", csv_content, "text/csv")},
        )
        lead_count = session.scalar(select(func.count()).select_from(Lead))

    assert campaign.status_code == 201
    assert imported.status_code == 200
    assert imported.json()["imported"] == 1
    assert "+919876543210" not in imported.text
    assert lead_count == 2


def test_direct_discovery_lead_can_be_queued_for_campaign_once(tmp_path: Path) -> None:
    with _client(tmp_path / "lead-campaign.db") as (client, settings, session):
        client.post("/api/v1/discovery/import-demo", headers=_headers(settings))
        discovered_lead = session.scalar(select(Lead).where(Lead.id != LEAD_ID))
        assert discovered_lead is not None
        campaign = client.post(
            "/api/v1/campaigns",
            headers=_headers(settings),
            json={"name": "Discovery review", "mode": "leads_and_calling"},
        ).json()
        path = f"/api/v1/campaigns/{campaign['id']}/leads/{discovered_lead.id}"
        first = client.post(path, headers=_headers(settings))
        repeated = client.post(path, headers=_headers(settings))

    assert first.status_code == 200
    assert first.json()["state"] == "pending_review"
    assert repeated.json()["id"] == first.json()["id"]
