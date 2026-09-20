from collections.abc import Generator
from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path

from database.seeds.demo import seed_demo
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.auth import create_access_token
from app.config import Settings, get_settings
from app.db import get_session
from app.demo_ids import ORGANIZATION_ID, USER_ID
from app.main import app
from app.persistence.models import AuditLog, Base, Membership, ModelRun, Product


@contextmanager
def _client(database_path: Path) -> Generator[tuple[TestClient, Settings, Session], None, None]:
    database_url = f"sqlite+pysqlite:///{database_path}"
    settings = Settings(app_env="test", database_url=database_url)
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


def _draft_payload() -> dict[str, object]:
    return {
        "description": (
            "Approved ERP discovery and implementation support for Indian manufacturers."
        ),
        "icp": {
            "geographies": ["India"],
            "industries": ["manufacturing"],
            "needs": ["ERP modernization"],
        },
        "exclusions": ["Unmanaged staffing"],
        "facts": {"delivery": "Discovery and implementation are available after scope review."},
        "pricing_policy": "Never quote a price; route pricing requests to a human owner.",
        "qualification_questions": ["Which ERP is currently in use?"],
        "handoff_conditions": ["The lead requests pricing or a proposal."],
    }


def test_seeded_approved_version_is_callable(tmp_path: Path) -> None:
    with _client(tmp_path / "knowledge.db") as (client, settings, _):
        response = client.get("/api/v1/knowledge/offering", headers=_headers(settings))

    assert response.status_code == 200
    active = response.json()["versions"][0]
    assert active["is_active"] is True
    assert active["is_callable"] is True
    assert active["qualification_questions"]


def test_search_returns_only_relevant_approved_knowledge(tmp_path: Path) -> None:
    with _client(tmp_path / "search.db") as (client, settings, _):
        matched = client.get(
            "/api/v1/knowledge/search?q=security", headers=_headers(settings)
        )
        missing = client.get(
            "/api/v1/knowledge/search?q=unapproved-gadget", headers=_headers(settings)
        )

    assert matched.status_code == 200
    assert len(matched.json()) == 1
    assert matched.json()[0]["matched_facts"] == {
        "security": (
            "Permissions, retention, compliance, and security requirements are reviewed by a "
            "human solution architect."
        )
    }
    assert missing.status_code == 200
    assert missing.json() == []


def test_draft_is_not_callable_until_owner_approval(tmp_path: Path) -> None:
    with _client(tmp_path / "approval.db") as (client, settings, session):
        headers = _headers(settings)
        created = client.post(
            "/api/v1/knowledge/offering/versions", headers=headers, json=_draft_payload()
        )
        assert created.status_code == 201
        draft = created.json()
        assert draft["version"] == 2
        assert draft["is_callable"] is False

        approved = client.post(
            f"/api/v1/knowledge/offering/versions/{draft['id']}/approve",
            headers=headers,
            json={"reason": "Reviewed against the approved sales and pricing policy."},
        )

        assert approved.status_code == 200
        assert approved.json()["is_active"] is True
        assert approved.json()["is_callable"] is True
        actions = session.scalars(select(AuditLog.action).order_by(AuditLog.occurred_at)).all()
        assert actions == ["product_version_created", "product_version_approved"]


def test_operator_can_draft_but_cannot_approve(tmp_path: Path) -> None:
    with _client(tmp_path / "roles.db") as (client, settings, session):
        membership = session.scalar(select(Membership).where(Membership.user_id == USER_ID))
        assert membership is not None
        membership.role = "operator"
        session.commit()
        headers = _headers(settings)
        created = client.post(
            "/api/v1/knowledge/offering/versions", headers=headers, json=_draft_payload()
        )
        response = client.post(
            f"/api/v1/knowledge/offering/versions/{created.json()['id']}/approve",
            headers=headers,
            json={"reason": "Operator must not be allowed to self-approve this version."},
        )

    assert created.status_code == 201
    assert response.status_code == 403


def test_business_profile_analysis_and_confirmation_are_reviewed_and_versioned(
    tmp_path: Path,
) -> None:
    with _client(tmp_path / "business-profile.db") as (client, settings, session):
        headers = _headers(settings)
        analyzed = client.post(
            "/api/v1/knowledge/business-profile/analyze",
            headers=headers,
            data={
                "company_name": "Northstar Systems",
                "business_details": (
                    "We help regulated companies modernize document management and collaboration."
                ),
                "services": "SharePoint migration\nMicrosoft 365 consulting",
            },
            files={
                "documents": (
                    "capabilities.txt",
                    b"Our services include employee intranets and governance workshops.",
                    "text/plain",
                )
            },
        )
        assert analyzed.status_code == 200
        profile = analyzed.json()
        assert profile["analysis_method"] == "deterministic"
        assert profile["services"] == [
            "SharePoint migration",
            "Microsoft 365 consulting",
        ]
        assert len(profile["sources"]) == 2
        assert profile["warning"]

        confirmation_payload = {
            **{key: value for key, value in profile.items() if key != "warning"},
            "workflow_mode": "leads_and_calling",
            "confirmed": True,
        }
        confirmed = client.post(
            "/api/v1/knowledge/business-profile/confirm",
            headers=headers,
            json=confirmation_payload,
        )
        repeated = client.post(
            "/api/v1/knowledge/business-profile/confirm",
            headers=headers,
            json=confirmation_payload,
        )
        assert confirmed.status_code == 201
        assert repeated.status_code == 201
        assert repeated.json()["id"] == confirmed.json()["id"]
        body = confirmed.json()
        assert body["version"] == 2
        assert body["is_active"] is True
        assert body["is_callable"] is True
        assert body["services"] == profile["services"]
        assert body["profile_source_count"] == 2
        assert all(not key.startswith("_") for key in body["facts"])
        product = session.scalar(select(Product))
        assert product is not None
        assert product.name == "Northstar Systems"
        model_run = session.scalar(
            select(ModelRun).where(ModelRun.purpose == "business_profile_analysis")
        )
        assert model_run is not None
        assert model_run.result_status == "fallback"
        actions = set(session.scalars(select(AuditLog.action)).all())
        assert {"business_profile_analyzed", "business_profile_confirmed"} <= actions


def test_business_profile_rejects_unsupported_file_and_operator_confirmation(
    tmp_path: Path,
) -> None:
    with _client(tmp_path / "business-profile-policy.db") as (client, settings, session):
        headers = _headers(settings)
        rejected = client.post(
            "/api/v1/knowledge/business-profile/analyze",
            headers=headers,
            data={"company_name": "Northstar", "business_details": "Consulting services"},
            files={"documents": ("payload.exe", b"not a document", "application/octet-stream")},
        )
        assert rejected.status_code == 422
        assert "TXT" in rejected.json()["detail"]

        membership = session.scalar(select(Membership).where(Membership.user_id == USER_ID))
        assert membership is not None
        membership.role = "operator"
        session.commit()
        denied = client.post(
            "/api/v1/knowledge/business-profile/confirm",
            headers=headers,
            json={
                **_draft_payload(),
                "company_name": "Northstar",
                "company_url": None,
                "services": ["Consulting"],
                "target_customers": ["Regulated companies"],
                "sources": [],
                "analysis_method": "manual",
                "analysis_token": "invalid-analysis-token-value",
                "workflow_mode": "calling_only",
                "confirmed": True,
            },
        )
        assert denied.status_code == 403
