from dataclasses import dataclass
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse
from uuid import UUID
from xml.etree.ElementTree import Element, SubElement, tostring

from sqlalchemy import select
from sqlalchemy.orm import Session
from twilio.base.exceptions import TwilioRestException
from twilio.request_validator import RequestValidator
from twilio.rest import Client

from app.config import Settings
from app.persistence.models import Call, ExternalMapping


@dataclass(frozen=True)
class TwilioDispatch:
    sid: str
    status: str
    limited_callbacks: bool = False


def public_http_url(settings: Settings, path: str) -> str:
    if not settings.public_voice_base_url:
        raise ValueError("public voice URL is not configured")
    return urljoin(settings.public_voice_base_url.rstrip("/") + "/", path.lstrip("/"))


def public_websocket_url(settings: Settings, path: str) -> str:
    parsed = urlparse(public_http_url(settings, path))
    scheme = "wss" if parsed.scheme == "https" else "ws"
    return urlunparse(parsed._replace(scheme=scheme))


def validate_twilio_request(
    settings: Settings,
    *,
    url: str,
    params: Any,
    signature: str | None,
) -> bool:
    if not settings.twilio_auth_token or not signature:
        return False
    validator = RequestValidator(settings.twilio_auth_token.get_secret_value())
    return bool(validator.validate(url, params, signature))


def create_twilio_call(settings: Settings, *, call_id: UUID) -> TwilioDispatch:
    account_sid = settings.twilio_account_sid
    auth_token = settings.twilio_auth_token
    from_number = settings.twilio_from_number
    to_number = settings.twilio_test_to_number
    if not account_sid or not auth_token or not from_number or not to_number:
        raise ValueError("Twilio credentials and test numbers are not configured")
    client = Client(
        account_sid,
        auth_token.get_secret_value(),
    )
    twiml_url = public_http_url(settings, f"/api/v1/twilio/calls/{call_id}/twiml")
    try:
        call = client.calls.create(
            to=to_number.get_secret_value(),
            from_=from_number.get_secret_value(),
            url=twiml_url,
            method="POST",
            status_callback=public_http_url(settings, "/api/v1/twilio/calls/status"),
            status_callback_method="POST",
            status_callback_event=["initiated", "ringing", "answered", "completed"],
            timeout=20,
            record=False,
        )
        limited_callbacks = False
    except TwilioRestException as exc:
        trial_restriction = "trial accounts have limited parameter access"
        if exc.status != 400 or trial_restriction not in str(exc.msg or "").casefold():
            raise
        # Current Twilio trials allow the Console's minimal To/From/Url request but reject
        # production callback controls. ConversationRelay's signed TwiML, WebSocket, and
        # Connect action still provide the connected-call lifecycle.
        call = client.calls.create(
            to=to_number.get_secret_value(),
            from_=from_number.get_secret_value(),
            url=twiml_url,
        )
        limited_callbacks = True
    return TwilioDispatch(
        sid=str(call.sid),
        status=str(call.status or "queued"),
        limited_callbacks=limited_callbacks,
    )


def end_twilio_call(settings: Settings, *, provider_call_sid: str) -> None:
    if not settings.twilio_account_sid or not settings.twilio_auth_token:
        raise ValueError("Twilio credentials are not configured")
    client = Client(
        settings.twilio_account_sid,
        settings.twilio_auth_token.get_secret_value(),
    )
    client.calls(provider_call_sid).update(status="completed")


def provider_mapping(session: Session, *, call_id: UUID) -> ExternalMapping | None:
    return session.scalar(
        select(ExternalMapping).where(
            ExternalMapping.provider == "twilio",
            ExternalMapping.local_type == "call",
            ExternalMapping.local_id == call_id,
            ExternalMapping.external_type == "call",
        )
    )


def dispatch_twilio_call(
    session: Session,
    *,
    call: Call,
    settings: Settings,
) -> TwilioDispatch:
    if call.transport != "twilio" or call.state not in {"eligible", "connecting"}:
        raise ValueError("only an eligible Twilio call can be dispatched")
    # Serialize dispatches for this local call. A browser double-submit can otherwise make
    # two provider calls before either request has persisted the external mapping.
    locked_call = session.scalar(
        select(Call)
        .where(
            Call.id == call.id,
            Call.organization_id == call.organization_id,
        )
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if locked_call is None:
        raise ValueError("call no longer exists")
    call = locked_call
    existing = provider_mapping(session, call_id=call.id)
    if existing:
        call.state = "connecting"
        session.commit()
        return TwilioDispatch(sid=existing.external_id, status="existing")
    try:
        result = create_twilio_call(settings, call_id=call.id)
    except Exception:
        call.state = "failed"
        call.outcome = "provider_dispatch_failed"
        call.usage = {**call.usage, "reservation_status": "released"}
        session.commit()
        raise
    session.add(
        ExternalMapping(
            organization_id=call.organization_id,
            provider="twilio",
            local_type="call",
            local_id=call.id,
            external_type="call",
            external_id=result.sid,
        )
    )
    call.state = "connecting"
    call.usage = {
        **call.usage,
        "provider_status": result.status,
        "provider_callback_mode": "trial_limited" if result.limited_callbacks else "full",
    }
    session.commit()
    return result


def build_conversation_relay_twiml(
    settings: Settings,
    *,
    call_id: UUID,
    welcome_greeting: str,
) -> str:
    response = Element("Response")
    connect = SubElement(
        response,
        "Connect",
        {"action": public_http_url(settings, f"/api/v1/twilio/calls/{call_id}/ended")},
    )
    relay = SubElement(
        connect,
        "ConversationRelay",
        {
            "url": public_websocket_url(
                settings, f"/api/v1/twilio/conversation/{call_id}"
            ),
            "welcomeGreeting": welcome_greeting,
            "welcomeGreetingInterruptible": "speech",
            "language": settings.twilio_conversation_language,
            "interruptible": "speech",
            "preemptible": "true",
        },
    )
    SubElement(relay, "Parameter", {"name": "localCallId", "value": str(call_id)})
    SubElement(response, "Hangup")
    return '<?xml version="1.0" encoding="UTF-8"?>' + tostring(
        response, encoding="unicode", short_empty_elements=True
    )
