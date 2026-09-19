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
from app.persistence.models import AuditLog, Base, Membership


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
