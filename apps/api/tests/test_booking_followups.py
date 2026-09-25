from __future__ import annotations

import hashlib
import hmac
import importlib
import json
from collections.abc import Generator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlsplit
from uuid import UUID, uuid4

import httpx
from alembic.migration import MigrationContext
from alembic.operations import Operations
from database.seeds.demo import seed_demo
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import create_engine, func, inspect, select
from sqlalchemy.orm import Session
from twilio.request_validator import RequestValidator

from app.booking_followups.providers import CalendlyClient, ProviderRetryableError
from app.booking_followups.service import process_due_booking_retries
from app.config import Settings, get_settings
from app.db import get_session
from app.demo_ids import CAMPAIGN_ID, CONTACT_ID, LEAD_ID, ORGANIZATION_ID
from app.main import app
from app.persistence.models import (
    Base,
    BookingFollowup,
    Call,
    CallbackRequest,
    Campaign,
    CampaignLead,
    ConsentRecord,
    Contact,
    ExternalMapping,
    HandoffTask,
    ProviderWebhookEvent,
    Suppression,
)


def test_booking_followup_migration_upgrade_and_downgrade(tmp_path: Path) -> None:
    migration = importlib.import_module(
        "database.migrations.versions.d4a9b8c7e6f5_add_booking_followups"
    )
    engine = create_engine(f"sqlite+pysqlite:///{tmp_path / 'migration.db'}")
    Base.metadata.create_all(engine)
    with engine.begin() as connection:
        context = MigrationContext.configure(connection)
        with Operations.context(context):
            migration.downgrade()
            assert "booking_followups" not in inspect(connection).get_table_names()
            migration.upgrade()
            assert "booking_followups" in inspect(connection).get_table_names()
            migration.downgrade()
            assert "booking_followups" not in inspect(connection).get_table_names()


def test_calendly_single_use_link_has_opaque_tracking_and_safe_retry_error() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            201,
            json={"resource": {"booking_url": "https://calendly.com/d/demo/meeting?month=2026-09"}},
        )

    settings = Settings(
        app_env="test",
        calendly_access_token="synthetic-token",
        calendly_event_type_uri="https://api.calendly.com/event_types/SYNTHETIC",
    )
    http = httpx.Client(base_url="https://api.calendly.com", transport=httpx.MockTransport(handler))
    provider = CalendlyClient(settings, client=http)
    link = provider.create_single_use_link(correlation_token="opaque-token")
    query = parse_qs(urlsplit(link).query)

    assert requests[0].url.path == "/scheduling_links"
    assert json.loads(requests[0].content) == {
        "max_event_count": 1,
        "owner": "https://api.calendly.com/event_types/SYNTHETIC",
        "owner_type": "EventType",
    }
    assert query == {
        "month": ["2026-09"],
        "utm_source": ["signalpath"],
        "utm_medium": ["sms"],
        "utm_campaign": ["human_handoff"],
        "utm_content": ["opaque-token"],
    }
    http.close()

    unavailable_http = httpx.Client(
        base_url="https://api.calendly.com",
        transport=httpx.MockTransport(lambda _: httpx.Response(503, text="private detail")),
    )
    unavailable = CalendlyClient(settings, client=unavailable_http)
    try:
        unavailable.create_single_use_link(correlation_token="opaque-token")
    except ProviderRetryableError as exc:
        assert "private detail" not in str(exc)
    else:
        raise AssertionError("Calendly 503 must be retryable")
    unavailable_http.close()


@contextmanager
def _client(path: Path) -> Generator[tuple[TestClient, Settings, Session, Call], None, None]:
    database_url = f"sqlite+pysqlite:///{path}"
    settings = Settings(
        app_env="test",
        database_url=database_url,
        voice_transport="omnidim",
        enable_outbound_pstn=True,
        omnidim_api_key="omnidim-test-key",
        omnidim_agent_id=123,
        omnidim_test_to_number="+919876543210",
        omnidim_tool_secret="provider-tool-secret",
        calendly_access_token="calendly-test-token",
        calendly_event_type_uri="https://api.calendly.com/event_types/AAAAAAAA",
        calendly_organization_uri="https://api.calendly.com/organizations/AAAAAAAA",
        calendly_webhook_signing_key="webhook-secret",
        sms_mode="mock",
        booking_demo_mode=True,
        booking_retry_delay_minutes=1440,
        call_window_start_hour=0,
        call_window_end_hour=24,
    )
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    assert seed_demo(database_url)
    session = Session(engine)
    contact = session.get(Contact, CONTACT_ID)
    assert contact is not None
    contact.demo_test_contact = True
    contact.identifier_encrypted_ref = "env:OMNIDIM_TEST_TO_NUMBER"
    call = Call(
        organization_id=ORGANIZATION_ID,
        lead_id=LEAD_ID,
        campaign_id=CAMPAIGN_ID,
        contact_id=CONTACT_ID,
        attempt_id=uuid4(),
        transport="omnidim",
        state="connecting",
        eligibility_decision={"eligible": True, "checks": []},
        max_duration_seconds=300,
        usage={"reserved_cost_inr": "5", "reservation_status": "reserved"},
    )
    session.add(call)
    session.flush()
    session.add(
        ExternalMapping(
            organization_id=ORGANIZATION_ID,
            provider="omnidim",
            local_type="call",
            local_id=call.id,
            external_type="call_request",
            external_id="provider-request-1",
        )
    )
    session.commit()

    def session_override() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as client:
        yield client, settings, session, call
    app.dependency_overrides.clear()
    session.close()


def _signature(secret: str, body: bytes, timestamp: int) -> str:
    digest = hmac.new(
        secret.encode(), str(timestamp).encode() + b"." + body, hashlib.sha256
    ).hexdigest()
    return f"t={timestamp},v1={digest}"


def test_omnidim_tool_requires_explicit_consent_and_is_idempotent(
    tmp_path: Path, monkeypatch
) -> None:
    with _client(tmp_path / "tool.db") as (client, settings, session, call):
        monkeypatch.setattr("app.jobs.service.get_settings", lambda: settings)
        monkeypatch.setattr(
            "app.booking_followups.providers.CalendlyClient.create_single_use_link",
            lambda self, correlation_token: (
                "https://calendly.com/d/example/meeting?utm_content=" + correlation_token
            ),
        )
        path = "/api/v1/provider-tools/omnidim/send-booking-link"
        denied = client.post(
            path,
            headers={"X-Omnidim-Tool-Secret": "provider-tool-secret"},
            json={
                "call_id": str(call.id),
                "sms_consent_confirmed": False,
                "retry_consent_confirmed": True,
            },
        )
        first = client.post(
            path,
            headers={"X-Omnidim-Tool-Secret": "provider-tool-secret"},
            json={
                "call_id": str(call.id),
                "sms_consent_confirmed": True,
                "retry_consent_confirmed": True,
            },
        )
        replay = client.post(
            path,
            headers={"X-Omnidim-Tool-Secret": "provider-tool-secret"},
            json={
                "call_id": str(call.id),
                "sms_consent_confirmed": True,
                "retry_consent_confirmed": True,
            },
        )

        assert denied.status_code == 409
        assert first.status_code == 200
        assert first.json()["delivery_status"] == "simulated"
        assert "simulated mode" in first.json()["safe_agent_message"]
        assert replay.json()["followup_id"] == first.json()["followup_id"]
        assert session.scalar(select(func.count()).select_from(BookingFollowup)) == 1
        purposes = set(session.scalars(select(ConsentRecord.purpose)).all())
        assert {"calendly_booking_link", "calendly_booking_retry"} <= purposes


def test_signed_calendly_webhook_books_callback_and_deduplicates(
    tmp_path: Path, monkeypatch
) -> None:
    with _client(tmp_path / "webhook.db") as (client, settings, session, call):
        monkeypatch.setattr("app.jobs.service.get_settings", lambda: settings)
        monkeypatch.setattr(
            "app.booking_followups.providers.CalendlyClient.create_single_use_link",
            lambda self, correlation_token: (
                "https://calendly.com/d/example/meeting?utm_content=" + correlation_token
            ),
        )
        tool = client.post(
            "/api/v1/provider-tools/omnidim/send-booking-link",
            headers={"X-Omnidim-Tool-Secret": "provider-tool-secret"},
            json={
                "call_id": str(call.id),
                "sms_consent_confirmed": True,
                "retry_consent_confirmed": True,
            },
        )
        followup = session.get(BookingFollowup, UUID(tool.json()["followup_id"]))
        assert followup is not None
        handoff = HandoffTask(
            organization_id=ORGANIZATION_ID,
            lead_id=LEAD_ID,
            call_id=call.id,
            owner_id=uuid4(),
            priority="high",
            reason="Human requested",
            due_at=datetime.now(UTC) + timedelta(hours=4),
            state="open",
        )
        session.add(handoff)
        session.flush()
        callback = CallbackRequest(
            organization_id=ORGANIZATION_ID,
            call_id=call.id,
            handoff_id=handoff.id,
            owner_id=handoff.owner_id,
            requested_text="Human follow-up requested",
            scheduled_for=None,
            status="awaiting_confirmation",
        )
        session.add(callback)
        session.flush()
        followup.handoff_id = handoff.id
        followup.callback_request_id = callback.id
        session.commit()
        now = datetime.now(UTC)
        envelope = {
            "event": "invitee.created",
            "created_at": now.isoformat(),
            "payload": {
                "uri": "https://api.calendly.com/scheduled_events/E/invitees/I",
                "tracking": {"utm_content": followup.correlation_token},
                "scheduled_event": {
                    "uri": "https://api.calendly.com/scheduled_events/E",
                    "start_time": (now + timedelta(days=1)).isoformat(),
                },
            },
        }
        body = json.dumps(envelope, separators=(",", ":")).encode()
        timestamp = int(now.timestamp())
        headers = {
            "Calendly-Webhook-Signature": _signature(
                settings.calendly_webhook_signing_key.get_secret_value(), body, timestamp
            ),
            "Content-Type": "application/json",
        }
        first = client.post("/api/v1/webhooks/calendly", headers=headers, content=body)
        duplicate = client.post("/api/v1/webhooks/calendly", headers=headers, content=body)
        session.refresh(followup)
        session.refresh(callback)
        session.refresh(handoff)

        assert first.status_code == 204
        assert duplicate.status_code == 204
        assert followup.status == "booked"
        assert callback.status == "scheduled"
        assert handoff.state == "scheduled"
        assert session.scalar(select(func.count()).select_from(ProviderWebhookEvent)) == 1


def test_calendly_webhook_rejects_invalid_and_expired_signatures(tmp_path: Path) -> None:
    with _client(tmp_path / "webhook-signature.db") as (client, settings, _, _):
        body = b'{"event":"invitee.created","payload":{}}'
        now = datetime.now(UTC)
        invalid = client.post(
            "/api/v1/webhooks/calendly",
            headers={"Calendly-Webhook-Signature": f"t={int(now.timestamp())},v1=bad"},
            content=body,
        )
        expired_at = int((now - timedelta(minutes=4)).timestamp())
        expired = client.post(
            "/api/v1/webhooks/calendly",
            headers={
                "Calendly-Webhook-Signature": _signature(
                    settings.calendly_webhook_signing_key.get_secret_value(),
                    body,
                    expired_at,
                )
            },
            content=body,
        )

        assert invalid.status_code == 401
        assert expired.status_code == 401


def test_rescheduled_cancellation_does_not_regress_booked_state(
    tmp_path: Path, monkeypatch
) -> None:
    with _client(tmp_path / "rescheduled.db") as (client, settings, session, call):
        monkeypatch.setattr("app.jobs.service.get_settings", lambda: settings)
        monkeypatch.setattr(
            "app.booking_followups.providers.CalendlyClient.create_single_use_link",
            lambda self, correlation_token: (
                "https://calendly.com/d/example/meeting?utm_content=" + correlation_token
            ),
        )
        tool = client.post(
            "/api/v1/provider-tools/omnidim/send-booking-link",
            headers={"X-Omnidim-Tool-Secret": "provider-tool-secret"},
            json={
                "call_id": str(call.id),
                "sms_consent_confirmed": True,
                "retry_consent_confirmed": True,
            },
        )
        followup = session.get(BookingFollowup, UUID(tool.json()["followup_id"]))
        assert followup is not None
        followup.status = "booked"
        followup.booked_at = datetime.now(UTC)
        session.commit()
        now = datetime.now(UTC)
        envelope = {
            "event": "invitee.canceled",
            "created_at": now.isoformat(),
            "payload": {
                "uri": "https://api.calendly.com/scheduled_events/E/invitees/I",
                "tracking": {"utm_content": followup.correlation_token},
                "rescheduled": True,
            },
        }
        body = json.dumps(envelope, separators=(",", ":")).encode()
        response = client.post(
            "/api/v1/webhooks/calendly",
            headers={
                "Calendly-Webhook-Signature": _signature(
                    settings.calendly_webhook_signing_key.get_secret_value(),
                    body,
                    int(now.timestamp()),
                )
            },
            content=body,
        )
        session.refresh(followup)

        assert response.status_code == 204
        assert followup.status == "booked"
        assert followup.canceled_at is None


def test_signed_twilio_stop_creates_sms_suppression(tmp_path: Path) -> None:
    with _client(tmp_path / "sms-stop.db") as (client, settings, session, _):
        sender = "+919111111111"
        contact = session.get(Contact, CONTACT_ID)
        assert contact is not None
        contact.identifier_hash = hashlib.sha256(sender.encode()).hexdigest()
        session.commit()
        settings.sms_mode = "twilio"
        settings.public_api_base_url = "https://api.example.test"
        settings.twilio_account_sid = "AC00000000000000000000000000000000"
        settings.twilio_auth_token = SecretStr("twilio-test-secret")
        settings.twilio_messaging_from_number = SecretStr("+919222222222")
        callback_url = "https://api.example.test/api/v1/webhooks/twilio/sms"
        form = {"From": sender, "Body": "STOP", "MessageSid": "SM_TEST"}
        signature = RequestValidator("twilio-test-secret").compute_signature(callback_url, form)

        response = client.post(
            "/api/v1/webhooks/twilio/sms",
            headers={"X-Twilio-Signature": signature},
            data=form,
        )

        assert response.status_code == 200
        suppression = session.scalar(
            select(Suppression).where(
                Suppression.organization_id == contact.organization_id,
                Suppression.channel == "sms",
                Suppression.identifier_hash == contact.identifier_hash,
            )
        )
        assert suppression is not None
        assert suppression.reason == "provider_stop_keyword"


def test_due_unbooked_followup_dispatches_exactly_one_safe_retry(
    tmp_path: Path, monkeypatch
) -> None:
    with _client(tmp_path / "retry.db") as (_, settings, session, call):
        now = datetime.now(UTC)
        call.state = "completed"
        call.ended_at = now - timedelta(minutes=3)
        call.outcome = "handoff_requested"
        campaign = session.get(Campaign, CAMPAIGN_ID)
        assert campaign is not None
        campaign.status = "active"
        campaign.max_attempts = 2
        campaign.daily_budget_inr = 1000
        campaign_lead = session.scalar(
            select(CampaignLead).where(
                CampaignLead.organization_id == ORGANIZATION_ID,
                CampaignLead.campaign_id == CAMPAIGN_ID,
                CampaignLead.lead_id == LEAD_ID,
            )
        )
        assert campaign_lead is not None
        campaign_lead.state = "qualified"
        campaign_lead.approved_at = campaign_lead.approved_at or now - timedelta(hours=1)
        followup = BookingFollowup(
            organization_id=ORGANIZATION_ID,
            call_id=call.id,
            campaign_id=CAMPAIGN_ID,
            contact_id=CONTACT_ID,
            correlation_token=uuid4().hex,
            calendly_link="https://calendly.com/d/example/meeting",
            delivery_mode="mock",
            delivery_status="simulated",
            status="awaiting_booking",
            retry_consent_confirmed=True,
            link_sent_at=now - timedelta(minutes=3),
            booking_check_at=now - timedelta(seconds=1),
            retry_count=0,
        )
        session.add(followup)
        session.add(
            ConsentRecord(
                organization_id=ORGANIZATION_ID,
                contact_id=CONTACT_ID,
                channel="pstn_voice",
                purpose="calendly_booking_retry",
                scope="one_retry_within_48_hours",
                source="explicit_in_call_confirmation",
                status="active",
                recorded_at=now - timedelta(minutes=3),
                expires_at=now + timedelta(hours=47),
            )
        )
        session.commit()

        def fake_dispatch(session: Session, *, call: Call, settings: Settings):
            del settings
            call.state = "connecting"
            session.flush()
            return object()

        monkeypatch.setattr("app.booking_followups.service.dispatch_omnidim_call", fake_dispatch)
        first = process_due_booking_retries(session, settings=settings, now=now)
        second = process_due_booking_retries(session, settings=settings, now=now)
        session.refresh(followup)

        assert first.dispatched == 1
        assert second.dispatched == 0
        assert followup.status == "retry_dispatched"
        assert followup.retry_count == 1
        assert followup.retry_call_id is not None


def test_textbee_sms_sender(monkeypatch) -> None:
    from app.booking_followups.providers import TextBeeSmsSender, ProviderPermanentError
    import httpx

    settings = Settings(
        database_url="sqlite://",
        textbee_api_key=SecretStr("fake-key"),
        textbee_device_id="device-123",
    )

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("x-api-key") == "fake-key"
        if "device-123" in str(request.url):
            return httpx.Response(200, json={"data": {"id": "msg-999"}}, headers={"content-type": "application/json"})
        return httpx.Response(400, text="Bad device")

    client = httpx.Client(transport=httpx.MockTransport(handler), base_url="https://api.textbee.dev/api/v1")
    sender = TextBeeSmsSender(settings, client=client)
    res = sender.send(destination="+917984781611", body="Test SMS", idempotency_key="idemp-1")
    assert res.provider == "textbee"
    assert res.provider_message_id == "msg-999"
    assert res.simulated is False

