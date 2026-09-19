from collections.abc import Generator
from contextlib import contextmanager
from datetime import timedelta
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import create_access_token
from app.config import Settings, get_settings
from app.db import get_session
from app.demo_ids import ORGANIZATION_ID, USER_ID, WORKSPACE_ID
from app.main import app
from app.persistence.models import Base, Membership, Organization, Workspace

SECOND_ORGANIZATION_ID = UUID("20000000-0000-4000-8000-000000000001")


def _test_dependencies() -> tuple[Settings, Session]:
    settings = Settings(app_env="test", database_url="sqlite+pysqlite:///:memory:")
    engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(
        engine,
        tables=[
            Organization.__table__,
            Workspace.__table__,
            Membership.__table__,
        ],
    )
    session = Session(engine)
    session.add_all(
        [
            Organization(id=ORGANIZATION_ID, name="Primary"),
            Organization(id=SECOND_ORGANIZATION_ID, name="Other tenant"),
        ]
    )
    session.flush()
    session.add_all(
        [
            Workspace(
                id=WORKSPACE_ID,
                organization_id=ORGANIZATION_ID,
                name="Primary workspace",
                locale="en-IN",
                timezone="Asia/Kolkata",
            ),
            Membership(
                id=uuid4(),
                organization_id=ORGANIZATION_ID,
                user_id=USER_ID,
                role="owner",
                status="active",
            ),
            Membership(
                id=uuid4(),
                organization_id=SECOND_ORGANIZATION_ID,
                user_id=USER_ID,
                role="viewer",
                status="active",
            ),
        ]
    )
    session.commit()
    return settings, session


@contextmanager
def _client() -> Generator[tuple[TestClient, Settings], None, None]:
    settings, session = _test_dependencies()

    def session_override() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as client:
        yield client, settings
    app.dependency_overrides.clear()
    session.close()


def test_missing_token_is_rejected() -> None:
    with _client() as (client, _):
        response = client.get("/api/v1/me")
    assert response.status_code == 401


def test_dev_session_resolves_active_membership() -> None:
    with _client() as (client, _):
        login = client.post("/api/v1/auth/dev-session")
        response = client.get(
            "/api/v1/me", headers={"Authorization": f"Bearer {login.json()['access_token']}"}
        )

    assert login.status_code == 200
    assert response.status_code == 200
    assert response.json() == {
        "user_id": str(USER_ID),
        "organization_id": str(ORGANIZATION_ID),
        "role": "owner",
    }


def test_workspace_query_cannot_cross_token_tenant() -> None:
    with _client() as (client, settings):
        other_token = create_access_token(
            user_id=USER_ID,
            organization_id=SECOND_ORGANIZATION_ID,
            settings=settings,
            lifetime=timedelta(minutes=5),
        )
        response = client.get(
            "/api/v1/workspaces/current",
            headers={"Authorization": f"Bearer {other_token}"},
        )

    assert response.status_code == 404


def test_unsigned_or_malformed_token_is_rejected() -> None:
    with _client() as (client, _):
        response = client.get(
            "/api/v1/me", headers={"Authorization": "Bearer not-a-valid-token"}
        )
    assert response.status_code == 401
