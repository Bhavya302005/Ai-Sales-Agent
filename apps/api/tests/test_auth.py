import importlib
from collections.abc import Generator
from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path
from uuid import UUID, uuid4

from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.auth import create_access_token
from app.config import Settings, get_settings
from app.db import get_session
from app.demo_ids import ORGANIZATION_ID, USER_ID, WORKSPACE_ID
from app.main import app
from app.persistence.models import (
    Base,
    Membership,
    Organization,
    Product,
    RateLimitBucket,
    UserAccount,
    Workspace,
)

SECOND_ORGANIZATION_ID = UUID("20000000-0000-4000-8000-000000000001")


def test_user_account_migration_upgrade_and_downgrade(tmp_path: Path) -> None:
    migration = importlib.import_module(
        "database.migrations.versions.e5b6c7d8a9f0_add_user_accounts"
    )
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'account-migration.db'}")
    with engine.begin() as connection:
        context = MigrationContext.configure(connection)
        with Operations.context(context):
            migration.upgrade()
            assert "user_accounts" in inspect(connection).get_table_names()
            migration.downgrade()
            assert "user_accounts" not in inspect(connection).get_table_names()


def _test_dependencies() -> tuple[Settings, Session]:
    settings = Settings(app_env="test", database_url="sqlite+pysqlite:///:memory:")
    engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=ON"))
    Base.metadata.create_all(
        engine,
        tables=[
            Organization.__table__,
            UserAccount.__table__,
            Workspace.__table__,
            Membership.__table__,
            Product.__table__,
            RateLimitBucket.__table__,
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


def test_signup_creates_an_isolated_empty_workspace_and_login_reuses_it() -> None:
    with _client() as (client, _):
        signup = client.post(
            "/api/v1/auth/signup",
            json={"email": "new-owner@example.com", "password": "safe-password-123"},
        )
        signup_headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}
        me = client.get("/api/v1/me", headers=signup_headers)
        workspace = client.get("/api/v1/workspaces/current", headers=signup_headers)
        retried_signup = client.post(
            "/api/v1/auth/signup",
            json={"email": "new-owner@example.com", "password": "safe-password-123"},
        )
        retry_me = client.get(
            "/api/v1/me",
            headers={"Authorization": f"Bearer {retried_signup.json()['access_token']}"},
        )

        login = client.post(
            "/api/v1/auth/login",
            json={"email": "NEW-OWNER@example.com", "password": "safe-password-123"},
        )
        login_me = client.get(
            "/api/v1/me",
            headers={"Authorization": f"Bearer {login.json()['access_token']}"},
        )

    assert signup.status_code == 201
    assert me.status_code == 200
    assert me.json()["organization_id"] != str(ORGANIZATION_ID)
    assert workspace.status_code == 200
    assert workspace.json()["name"] == "My Sales Workspace"
    assert retried_signup.status_code == 201
    assert retry_me.json() == me.json()
    assert login.status_code == 200
    assert login_me.json() == me.json()


def test_signups_are_tenant_isolated_and_duplicate_email_is_rejected() -> None:
    with _client() as (client, _):
        first = client.post(
            "/api/v1/auth/signup",
            json={"email": "first@example.com", "password": "safe-password-123"},
        )
        second = client.post(
            "/api/v1/auth/signup",
            json={"email": "second@example.com", "password": "safe-password-456"},
        )
        duplicate = client.post(
            "/api/v1/auth/signup",
            json={"email": "FIRST@example.com", "password": "safe-password-789"},
        )
        first_me = client.get(
            "/api/v1/me",
            headers={"Authorization": f"Bearer {first.json()['access_token']}"},
        )
        second_me = client.get(
            "/api/v1/me",
            headers={"Authorization": f"Bearer {second.json()['access_token']}"},
        )

    assert first.status_code == 201
    assert second.status_code == 201
    assert duplicate.status_code == 409
    assert first_me.json()["organization_id"] != second_me.json()["organization_id"]


def test_account_login_rejects_wrong_password() -> None:
    with _client() as (client, _):
        client.post(
            "/api/v1/auth/signup",
            json={"email": "owner@example.com", "password": "safe-password-123"},
        )
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "owner@example.com", "password": "wrong-password"},
        )

    assert response.status_code == 401


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
