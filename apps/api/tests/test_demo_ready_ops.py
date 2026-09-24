from collections.abc import Generator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import httpx
import pytest
from database.seeds.demo import seed_demo
from fastapi.testclient import TestClient
from pydantic import SecretStr
from pytest import MonkeyPatch
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

import app.hubspot_import as hubspot_import
from app.auth import create_access_token
from app.campaign_ops import process_due_campaigns
from app.config import Settings, get_settings
from app.crm.providers import (
    CrmPermanentError,
    CrmRetryableError,
    HubSpotContact,
    HubSpotCrmProvider,
)
from app.db import get_session
from app.demo_ids import CAMPAIGN_ID, CONTACT_ID, LEAD_ID, ORGANIZATION_ID, USER_ID
from app.main import app
from app.notifications import notify_roles
from app.persistence.models import (
    Base,
    Call,
    CallbackRequest,
    Campaign,
    CampaignLead,
    CampaignRun,
    Contact,
    ExternalMapping,
    Membership,
    Notification,
    OrganizationControl,
    Suppression,
)
from app.rate_limits import enforce_rate_limit


@contextmanager
def _client(
    path: Path, *, hubspot: bool = False
) -> Generator[tuple[TestClient, Settings, Session], None, None]:
    database_url = f"sqlite+pysqlite:///{path}"
    settings = Settings(
        app_env="test",
        database_url=database_url,
        call_window_start_hour=0,
        call_window_end_hour=24,
        crm_mode="hubspot" if hubspot else "mock",
        hubspot_access_token=SecretStr("sandbox-token") if hubspot else None,
        twilio_test_to_number="+919876543210",
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


def _headers(settings: Settings, user_id: UUID = USER_ID) -> dict[str, str]:
    token = create_access_token(
        user_id=user_id,
        organization_id=ORGANIZATION_ID,
        settings=settings,
        lifetime=timedelta(minutes=5),
    )
    return {"Authorization": f"Bearer {token}"}


def test_notifications_are_targeted_deduplicated_and_readable(tmp_path: Path) -> None:
    with _client(tmp_path / "notifications.db") as (client, settings, session):
        first = notify_roles(
            session,
            organization_id=ORGANIZATION_ID,
            notification_type="test_event",
            severity="info",
            title="Safe title",
            summary="No contact data",
            action_url="/campaigns",
            dedupe_key="event:1",
        )
        second = notify_roles(
            session,
            organization_id=ORGANIZATION_ID,
            notification_type="test_event",
            severity="info",
            title="Safe title",
            summary="No contact data",
            action_url="/campaigns",
            dedupe_key="event:1",
        )
        session.commit()
        feed = client.get("/api/v1/notifications", headers=_headers(settings))
        notification_id = feed.json()["items"][0]["id"]
        marked = client.patch(
            f"/api/v1/notifications/{notification_id}/read", headers=_headers(settings)
        )

        assert first == 1
        assert second == 0
        assert feed.json()["unread_count"] == 1
        assert marked.json()["read_at"] is not None
        assert session.scalar(select(func.count()).select_from(Notification)) == 1


def test_admin_prevents_removing_final_owner_and_persists_call_pause(tmp_path: Path) -> None:
    with _client(tmp_path / "admin.db") as (client, settings, session):
        members = client.get("/api/v1/admin/members", headers=_headers(settings))
        member_id = members.json()[0]["id"]
        blocked = client.patch(
            f"/api/v1/admin/members/{member_id}",
            headers=_headers(settings),
            json={"role": "viewer", "status": "active"},
        )
        paused = client.patch(
            "/api/v1/admin/runtime-controls",
            headers=_headers(settings),
            json={"calls_paused": True},
        )
        security = client.get("/api/v1/admin/security-overview", headers=_headers(settings))

        assert blocked.status_code == 409
        assert paused.json()["effective_calls_paused"] is True
        assert security.json()["posture"] == "clear"
        assert security.json()["active_suppressions"] == 0
        assert "predictive fraud model" in security.json()["label"]
        control = session.scalar(
            select(OrganizationControl).where(
                OrganizationControl.organization_id == ORGANIZATION_ID
            )
        )
        assert control is not None and control.calls_paused is True


def test_due_campaign_runs_and_retries_are_idempotent_without_dialing(tmp_path: Path) -> None:
    with _client(tmp_path / "scheduler.db") as (_, _, session):
        campaign = session.get(Campaign, CAMPAIGN_ID)
        item = session.scalar(
            select(CampaignLead).where(CampaignLead.campaign_id == CAMPAIGN_ID)
        )
        assert campaign is not None and item is not None
        now = datetime(2026, 9, 19, 12, tzinfo=UTC)
        campaign.scheduled_start_at = now - timedelta(days=2)
        campaign.recurrence = "daily"
        campaign.retry_delay_minutes = 60
        campaign.max_attempts = 3
        item.approved_at = now - timedelta(days=3)
        item.approved_by = USER_ID
        item.state = "approved"
        session.add(
            Call(
                organization_id=ORGANIZATION_ID,
                lead_id=LEAD_ID,
                campaign_id=CAMPAIGN_ID,
                contact_id=CONTACT_ID,
                attempt_id=uuid4(),
                transport="twilio",
                state="failed",
                eligibility_decision={"eligible": True, "checks": []},
                max_duration_seconds=300,
                ended_at=now - timedelta(hours=2),
                usage={"reservation_status": "released"},
                outcome="busy",
            )
        )
        session.commit()

        first = process_due_campaigns(session, now=now)
        call_count = session.scalar(select(func.count()).select_from(Call))
        second = process_due_campaigns(session, now=now)

        assert first.runs_ready == 3
        assert first.retries_ready == 1
        assert second.runs_ready == 0
        assert second.retries_ready == 0
        assert item.state == "retry_due"
        assert call_count == 1
        assert session.scalar(select(func.count()).select_from(CampaignRun)) == 4
        assert (
            session.scalar(
                select(func.count())
                .select_from(CampaignRun)
                .where(CampaignRun.state == "scheduled")
            )
            == 1
        )


def test_suppressed_contact_never_becomes_retry_due(tmp_path: Path) -> None:
    with _client(tmp_path / "suppressed-retry.db") as (_, _, session):
        campaign = session.get(Campaign, CAMPAIGN_ID)
        item = session.scalar(
            select(CampaignLead).where(CampaignLead.campaign_id == CAMPAIGN_ID)
        )
        contact = session.get(Contact, CONTACT_ID)
        assert campaign is not None and item is not None and contact is not None
        now = datetime(2026, 9, 19, 12, tzinfo=UTC)
        campaign.scheduled_start_at = now + timedelta(days=1)
        item.approved_at = now - timedelta(days=1)
        item.state = "approved"
        session.add(
            Call(
                organization_id=ORGANIZATION_ID,
                lead_id=LEAD_ID,
                campaign_id=CAMPAIGN_ID,
                contact_id=CONTACT_ID,
                attempt_id=uuid4(),
                transport="twilio",
                state="failed",
                eligibility_decision={"eligible": True, "checks": []},
                max_duration_seconds=300,
                ended_at=now - timedelta(hours=2),
                usage={},
                outcome="no_answer",
            )
        )
        session.add(
            Suppression(
                organization_id=ORGANIZATION_ID,
                channel="all",
                identifier_hash=contact.identifier_hash,
                reason="participant opted out",
                scope="all_outreach",
                expires_at=None,
            )
        )
        session.commit()

        result = process_due_campaigns(session, now=now)

        assert result.retries_ready == 0
        assert item.state == "approved"


def test_callback_can_be_scheduled_then_completed(tmp_path: Path) -> None:
    with _client(tmp_path / "callbacks.db") as (client, settings, session):
        callback = CallbackRequest(
            organization_id=ORGANIZATION_ID,
            call_id=uuid4(),
            handoff_id=None,
            owner_id=USER_ID,
            requested_text="Human follow-up requested",
            scheduled_for=None,
            status="awaiting_confirmation",
        )
        call = Call(
            id=callback.call_id,
            organization_id=ORGANIZATION_ID,
            lead_id=LEAD_ID,
            campaign_id=CAMPAIGN_ID,
            contact_id=CONTACT_ID,
            attempt_id=uuid4(),
            transport="browser",
            state="completed",
            eligibility_decision={"eligible": True, "checks": []},
            max_duration_seconds=300,
            usage={},
            outcome="handoff_requested",
        )
        session.add(call)
        session.flush()
        session.add(callback)
        session.commit()
        scheduled_for = datetime.now(UTC) + timedelta(days=1)
        scheduled = client.patch(
            f"/api/v1/callbacks/{callback.id}",
            headers=_headers(settings),
            json={"status": "scheduled", "scheduled_for": scheduled_for.isoformat()},
        )
        completed = client.patch(
            f"/api/v1/callbacks/{callback.id}",
            headers=_headers(settings),
            json={"status": "completed"},
        )

        assert scheduled.json()["status"] == "scheduled"
        assert completed.json()["status"] == "completed"


def test_hubspot_preview_masks_phone_and_import_requires_review(
    tmp_path: Path, monkeypatch: MonkeyPatch
) -> None:
    class FakeHubSpot:
        def __init__(self, **_: object) -> None:
            pass

        def list_contacts(self, **_: object) -> object:
            return type(
                "Page",
                (),
                {
                    "contacts": [
                        HubSpotContact("123", "Synthetic Buyer", "Orchid Systems", "+919876543210")
                    ],
                    "next_after": None,
                },
            )()

        def get_contact(self, external_id: str) -> HubSpotContact:
            assert external_id == "123"
            return HubSpotContact("123", "Synthetic Buyer", "Orchid Systems", "+919876543210")

        def close(self) -> None:
            pass

    monkeypatch.setattr(hubspot_import, "HubSpotCrmProvider", FakeHubSpot)
    with _client(tmp_path / "hubspot.db", hubspot=True) as (client, settings, session):
        campaign = session.get(Campaign, CAMPAIGN_ID)
        assert campaign is not None
        campaign.mode = "calling_only"
        session.commit()
        preview = client.get(
            "/api/v1/integrations/hubspot/contacts", headers=_headers(settings)
        )
        imported = client.post(
            "/api/v1/integrations/hubspot/import",
            headers={**_headers(settings), "Idempotency-Key": "hubspot-import-test"},
            json={
                "external_contact_id": "123",
                "campaign_id": str(CAMPAIGN_ID),
                "requirement": "SharePoint implementation and Microsoft 365 migration",
                "consent_basis": "synthetic sandbox participant agreement",
                "consent_attested": True,
            },
        )

        assert "+919876543210" not in preview.text
        assert preview.json()["contacts"][0]["masked_phone"] == "••••10"
        assert imported.status_code == 201
        assert imported.json()["outreach_eligible"] is False
        mapping = session.scalar(
            select(ExternalMapping).where(
                ExternalMapping.provider == "hubspot",
                ExternalMapping.external_id == "123",
            )
        )
        contact = session.scalar(
            select(Contact).where(Contact.id == mapping.local_id if mapping else False)
        )
        assert mapping is not None
        assert contact is not None
        assert contact.identifier_encrypted_ref == "env:TWILIO_TEST_TO_NUMBER"


def test_rate_limit_and_security_headers(tmp_path: Path) -> None:
    with _client(tmp_path / "security.db") as (client, _, session):
        fixed = datetime(2026, 9, 19, 12, tzinfo=UTC)
        enforce_rate_limit(session, identity="actor", category="test", limit=1, now=fixed)
        try:
            enforce_rate_limit(session, identity="actor", category="test", limit=1, now=fixed)
        except Exception as exc:
            assert getattr(exc, "status_code", None) == 429
            assert getattr(exc, "headers", {}).get("Retry-After") == "60"
        else:
            raise AssertionError("rate limit did not reject the second request")
        response = client.get("/health/live", headers={"X-Request-ID": "invalid id with spaces"})

        assert response.headers["x-frame-options"] == "DENY"
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["x-request-id"] != "invalid id with spaces"


def test_operator_cannot_access_owner_admin(tmp_path: Path) -> None:
    with _client(tmp_path / "admin-rbac.db") as (client, settings, session):
        operator_id = uuid4()
        session.add(
            Membership(
                organization_id=ORGANIZATION_ID,
                user_id=operator_id,
                role="operator",
                status="active",
            )
        )
        session.commit()
        response = client.get("/api/v1/admin/members", headers=_headers(settings, operator_id))
        security = client.get(
            "/api/v1/admin/security-overview", headers=_headers(settings, operator_id)
        )
        assert response.status_code == 403
        assert security.status_code == 403


def test_hubspot_provider_uses_versioned_contacts_and_cursor() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/crm/objects/2026-03/contacts"
        assert request.url.params["after"] == "cursor-1"
        assert request.url.params["limit"] == "50"
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": "contact-1",
                        "properties": {
                            "firstname": "Synthetic",
                            "lastname": "Buyer",
                            "company": "Orchid Systems",
                            "phone": "+919876543210",
                        },
                    }
                ],
                "paging": {"next": {"after": "cursor-2"}},
            },
        )

    client = httpx.Client(
        base_url="https://api.hubapi.com", transport=httpx.MockTransport(handler)
    )
    provider = HubSpotCrmProvider(access_token="synthetic-token", client=client)
    page = provider.list_contacts(after="cursor-1", limit=500)

    assert page.next_after == "cursor-2"
    assert page.contacts[0].external_id == "contact-1"
    assert page.contacts[0].phone == "+919876543210"
    client.close()


@pytest.mark.parametrize(
    ("status", "expected"),
    [(401, CrmPermanentError), (429, CrmRetryableError), (503, CrmRetryableError)],
)
def test_hubspot_provider_sanitizes_failures(
    status: int, expected: type[Exception]
) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(status, text="provider details must not escape")

    client = httpx.Client(
        base_url="https://api.hubapi.com", transport=httpx.MockTransport(handler)
    )
    provider = HubSpotCrmProvider(access_token="synthetic-token", client=client)
    with pytest.raises(expected) as caught:
        provider.list_contacts()
    assert "provider details" not in str(caught.value)
    client.close()


def test_hubspot_provider_rejects_malformed_page() -> None:
    client = httpx.Client(
        base_url="https://api.hubapi.com",
        transport=httpx.MockTransport(
            lambda _: httpx.Response(200, json={"results": "not-a-list"})
        ),
    )
    provider = HubSpotCrmProvider(access_token="synthetic-token", client=client)
    with pytest.raises(CrmRetryableError, match="invalid contact page"):
        provider.list_contacts()
    client.close()
