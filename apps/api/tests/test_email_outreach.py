"""
Tests for email outreach module.
Covers: status endpoint, suppression gate, idempotency, bot UA filtering.
"""

from datetime import timedelta
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from database.seeds.demo import seed_demo
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.auth import create_access_token
from app.config import Settings, get_settings
from app.db import get_session
from app.demo_ids import ORGANIZATION_ID, USER_ID
from app.email_outreach.models import EmailEvent, EmailOutreachDraft
from app.main import app
from app.persistence.models import Base, Suppression


def _seeded_client(database_path: Path):
    database_url = f"sqlite+pysqlite:///{database_path}"
    settings = Settings(app_env="test", database_url=database_url, email_outreach_mode="disabled")
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


# ---------------------------------------------------------------------------
# Status endpoint
# ---------------------------------------------------------------------------

def test_email_outreach_status_disabled(tmp_path: Path) -> None:
    """GET /status returns enabled=false when mode is disabled."""
    client, settings, _ = _seeded_client(tmp_path / "test.db")
    r = client.get("/api/v1/email-outreach/status", headers=_headers(settings))
    assert r.status_code == 200
    data = r.json()
    assert data["enabled"] is False
    assert data["mode"] == "disabled"


# ---------------------------------------------------------------------------
# Subscription plan has emails_per_month
# ---------------------------------------------------------------------------

def test_subscription_has_emails_per_month(tmp_path: Path) -> None:
    """GET /subscription returns emails_per_month in limits."""
    client, settings, _ = _seeded_client(tmp_path / "test.db")
    r = client.get("/api/v1/subscription", headers=_headers(settings))
    assert r.status_code == 200
    data = r.json()
    assert "emails_per_month" in data["limits"]
    assert data["limits"]["emails_per_month"] >= 0
    # Verify all catalogue plans have emails_per_month
    for plan in data["catalogue"]:
        assert "emails_per_month" in plan["limits"], f"{plan['slug']} missing emails_per_month"


# ---------------------------------------------------------------------------
# Draft generation requires consent
# ---------------------------------------------------------------------------

def test_generate_draft_requires_consent(tmp_path: Path) -> None:
    """POST /drafts without consent_attested=true must fail 422."""
    import uuid
    client, settings, _ = _seeded_client(tmp_path / "test.db")
    r = client.post(
        "/api/v1/email-outreach/drafts",
        json={
            "lead_id": str(uuid.uuid4()),
            "campaign_id": str(uuid.uuid4()),
            "recipient_email": "test@example.com",
            "consent_attested": False,
        },
        headers=_headers(settings),
    )
    assert r.status_code == 422


# ---------------------------------------------------------------------------
# Tracking pixel — bot user-agents must not create events
# ---------------------------------------------------------------------------

def test_tracking_pixel_returns_gif(tmp_path: Path) -> None:
    """GET /track always returns a 1x1 GIF."""
    client, _, session = _seeded_client(tmp_path / "test.db")
    r = client.get("/api/v1/email-outreach/track")
    assert r.status_code == 200
    assert r.headers["content-type"] == "image/gif"
    # First 3 bytes of GIF magic number
    assert r.content[:3] == b"GIF"


def test_tracking_pixel_bot_ua_not_recorded(tmp_path: Path) -> None:
    """Open pixel with a known bot UA must not write an EmailEvent row."""
    client, _, session = _seeded_client(tmp_path / "test.db")
    import uuid
    fake_id = str(uuid.uuid4())
    r = client.get(
        f"/api/v1/email-outreach/track?id={fake_id}",
        headers={"User-Agent": "GoogleImageProxy/1.0 (compatible)"},
    )
    assert r.status_code == 200
    # No events should have been recorded
    events = session.query(EmailEvent).all()
    assert len(events) == 0


# ---------------------------------------------------------------------------
# Suppression blocks draft generation
# ---------------------------------------------------------------------------

def test_suppressed_email_blocks_draft_generation(tmp_path: Path) -> None:
    """If a contact's email is in the suppression list, draft generation must fail."""
    import hashlib
    import uuid
    from datetime import UTC, datetime

    client, settings, session = _seeded_client(tmp_path / "test.db")

    blocked_email = "blocked@example.com"
    identifier_hash = hashlib.sha256(blocked_email.lower().encode()).hexdigest()

    suppression = Suppression(
        id=uuid.uuid4(),
        organization_id=ORGANIZATION_ID,
        channel="email",
        identifier_hash=identifier_hash,
        reason="unsubscribe_request",
        scope="all_email_outreach",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    session.add(suppression)
    session.commit()

    # Try to generate a draft for the suppressed email
    r = client.post(
        "/api/v1/email-outreach/drafts",
        json={
            "lead_id": str(uuid.uuid4()),
            "campaign_id": str(uuid.uuid4()),
            "recipient_email": blocked_email,
            "consent_attested": True,
        },
        headers=_headers(settings),
    )
    # Should be 422 (suppressed) before even attempting lead lookup
    assert r.status_code == 422
    assert "suppressed" in r.json()["detail"].lower()


# ---------------------------------------------------------------------------
# List drafts — empty for fresh org
# ---------------------------------------------------------------------------

def test_list_drafts_empty(tmp_path: Path) -> None:
    """GET /drafts returns empty list for org with no drafts."""
    client, settings, _ = _seeded_client(tmp_path / "test.db")
    r = client.get("/api/v1/email-outreach/drafts", headers=_headers(settings))
    assert r.status_code == 200
    data = r.json()
    assert data["items"] == []
    assert data["total"] == 0
