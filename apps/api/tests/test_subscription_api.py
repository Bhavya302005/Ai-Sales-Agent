from datetime import timedelta
from pathlib import Path

from database.seeds.demo import seed_demo
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.auth import create_access_token
from app.config import Settings, get_settings
from app.db import get_session
from app.demo_ids import ORGANIZATION_ID, USER_ID
from app.main import app
from app.persistence.models import Base


def _seeded_client(database_path: Path):
    database_url = f"sqlite+pysqlite:///{database_path}"
    settings = Settings(app_env="test", database_url=database_url)
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    assert seed_demo(database_url)
    session = Session(engine)

    def session_override():
        yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_settings] = lambda: settings
    client = TestClient(app)
    return client, settings, session


def _headers(settings: Settings) -> dict[str, str]:
    token = create_access_token(
        user_id=USER_ID,
        organization_id=ORGANIZATION_ID,
        settings=settings,
        lifetime=timedelta(minutes=5),
    )
    return {"Authorization": f"Bearer {token}"}


def test_get_subscription(tmp_path: Path):
    client, settings, session = _seeded_client(tmp_path / "sub.db")
    try:
        response = client.get("/api/v1/subscription", headers=_headers(settings))
        assert response.status_code == 200
        data = response.json()
        assert data["plan"] == "starter"
        assert "limits" in data
        assert "catalogue" in data
        assert data["cancel_requested"] is False
    finally:
        app.dependency_overrides.clear()
        session.close()


def test_cancel_subscription(tmp_path: Path):
    client, settings, session = _seeded_client(tmp_path / "sub_cancel.db")
    try:
        response = client.post("/api/v1/subscription/cancel", headers=_headers(settings))
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "cancel_requested"
        assert "cancellation request" in data["message"].lower()
    finally:
        app.dependency_overrides.clear()
        session.close()
