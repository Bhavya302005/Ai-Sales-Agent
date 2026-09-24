from collections.abc import Generator
from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

from database.seeds.demo import seed_demo
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.auth import create_access_token
from app.config import Settings, get_settings
from app.db import get_session
from app.demo_ids import LEAD_ID, ORGANIZATION_ID, USER_ID
from app.main import app
from app.persistence.models import Base, Membership, Organization


@contextmanager
def _seeded_client(database_path: Path) -> Generator[tuple[TestClient, Settings], None, None]:
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
        yield client, settings
    app.dependency_overrides.clear()
    session.close()


def _authorization(settings: Settings, organization_id=ORGANIZATION_ID) -> dict[str, str]:
    token = create_access_token(
        user_id=USER_ID,
        organization_id=organization_id,
        settings=settings,
        lifetime=timedelta(minutes=5),
    )
    return {"Authorization": f"Bearer {token}"}


def test_seeded_lead_list_and_detail_expose_evidence_and_unknowns(tmp_path: Path) -> None:
    with _seeded_client(tmp_path / "leads.db") as (client, settings):
        headers = _authorization(settings)
        listing = client.get("/api/v1/leads", headers=headers)
        detail = client.get(f"/api/v1/leads/{LEAD_ID}", headers=headers)

    assert listing.status_code == 200
    assert len(listing.json()) == 1
    assert listing.json()[0]["score"] == 85
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["source"]["source_type"] == "permitted_fixture"
    assert payload["assertions"][0]["evidence_excerpt"]
    assert payload["unknown_fields"] == ["budget", "decision_maker", "phone_number"]
    assert sum(item["points"] for item in payload["score_detail"]["contributions"]) == 84.5
    brief = payload["pre_call_brief"]
    assert brief["opener"]["citations"][0]["kind"] == "source"
    assert brief["fit_summary"]["citations"][0]["kind"] == "product_description"
    assert brief["unknowns"] == ["budget", "decision_maker", "phone_number"]
    assert brief["qualification_questions"]
    assert brief["escalation_topics"]
    assert all(item["citations"] for item in brief["known_facts"])
    assert all(item["citations"] for item in brief["allowed_faq"])
    assert "Custom quote" not in " ".join(item["text"] for item in brief["allowed_faq"])


def test_tenant_member_cannot_read_another_tenants_lead(tmp_path: Path) -> None:
    second_organization_id = uuid4()
    with _seeded_client(tmp_path / "tenant.db") as (client, settings):
        with Session(create_engine(settings.database_url)) as session, session.begin():
            session.add(Organization(id=second_organization_id, name="Second tenant"))
            session.flush()
            session.add(
                Membership(
                    id=uuid4(),
                    organization_id=second_organization_id,
                    user_id=USER_ID,
                    role="viewer",
                    status="active",
                )
            )
        response = client.get(
            f"/api/v1/leads/{LEAD_ID}",
            headers=_authorization(settings, second_organization_id),
        )

    assert response.status_code == 404
