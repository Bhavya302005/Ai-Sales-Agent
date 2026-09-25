from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

from app.config import Settings


class ProviderRetryableError(RuntimeError):
    pass


class ProviderPermanentError(ValueError):
    pass


@dataclass(frozen=True)
class SmsDelivery:
    provider: str
    provider_message_id: str
    simulated: bool


class SmsSender(Protocol):
    def send(self, *, destination: str, body: str, idempotency_key: str) -> SmsDelivery: ...


class MockSmsSender:
    def send(self, *, destination: str, body: str, idempotency_key: str) -> SmsDelivery:
        del destination, body
        return SmsDelivery(
            provider="mock",
            provider_message_id=f"mock:{idempotency_key}",
            simulated=True,
        )


class TwilioSmsSender:
    def __init__(self, settings: Settings) -> None:
        account_sid = settings.twilio_account_sid
        auth_token = settings.twilio_auth_token
        from_number = settings.twilio_messaging_from_number
        if not account_sid or not auth_token or not from_number:
            raise ProviderPermanentError("Twilio messaging is not configured")
        self._client = Client(
            account_sid,
            auth_token.get_secret_value(),
        )
        self._from_number = from_number.get_secret_value()

    def send(self, *, destination: str, body: str, idempotency_key: str) -> SmsDelivery:
        del idempotency_key
        try:
            message = self._client.messages.create(
                to=destination,
                from_=self._from_number,
                body=body,
            )
        except TwilioRestException as exc:
            if exc.status in {400, 401, 403, 404, 422}:
                raise ProviderPermanentError("Twilio rejected the SMS request") from exc
            raise ProviderRetryableError("Twilio messaging is temporarily unavailable") from exc
        except Exception as exc:
            raise ProviderRetryableError("Twilio messaging is temporarily unavailable") from exc
        return SmsDelivery(provider="twilio", provider_message_id=str(message.sid), simulated=False)


class TextBeeSmsSender:
    def __init__(self, settings: Settings, *, client: httpx.Client | None = None) -> None:
        if not settings.textbee_api_key or not settings.textbee_device_id:
            raise ProviderPermanentError("TextBee API key or device ID is not configured")
        self._api_key = settings.textbee_api_key.get_secret_value()
        self._device_id = settings.textbee_device_id
        self._owns_client = client is None
        self._client = client or httpx.Client(
            base_url="https://api.textbee.dev/api/v1",
            timeout=httpx.Timeout(20, connect=10),
        )
        self._client.headers.update({"x-api-key": self._api_key, "User-Agent": "curl/8.7.1"})

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def send(self, *, destination: str, body: str, idempotency_key: str) -> SmsDelivery:
        del idempotency_key
        try:
            response = self._client.post(
                f"/gateway/devices/{self._device_id}/send-sms",
                json={"recipients": [destination], "message": body},
            )
        except httpx.HTTPError as exc:
            raise ProviderRetryableError("TextBee messaging is temporarily unavailable") from exc
        if response.status_code in {400, 401, 403, 404, 422}:
            raise ProviderPermanentError(f"TextBee rejected the SMS: {response.text}")
        if response.status_code >= 500 or response.status_code == 429:
            raise ProviderRetryableError("TextBee messaging is temporarily unavailable")
        data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
        message_id = str(data.get("data", {}).get("id") or data.get("id") or "textbee-sent")
        return SmsDelivery(provider="textbee", provider_message_id=message_id, simulated=False)


def sms_sender(settings: Settings) -> SmsSender:
    if settings.sms_mode == "mock":
        return MockSmsSender()
    if settings.sms_mode == "twilio":
        return TwilioSmsSender(settings)
    if settings.sms_mode == "textbee":
        return TextBeeSmsSender(settings)
    raise ProviderPermanentError("SMS delivery is disabled")


class CalendlyClient:
    def __init__(self, settings: Settings, *, client: httpx.Client | None = None) -> None:
        if not settings.calendly_access_token or not settings.calendly_event_type_uri:
            raise ProviderPermanentError("Calendly is not configured")
        self._event_type_uri = settings.calendly_event_type_uri
        self._owns_client = client is None
        self._client = client or httpx.Client(
            base_url="https://api.calendly.com",
            headers={
                "Authorization": f"Bearer {settings.calendly_access_token.get_secret_value()}",
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(10, connect=5),
        )

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def create_single_use_link(self, *, correlation_token: str) -> str:
        try:
            response = self._client.post(
                "/scheduling_links",
                json={
                    "max_event_count": 1,
                    "owner": self._event_type_uri,
                    "owner_type": "EventType",
                },
            )
        except httpx.HTTPError as exc:
            raise ProviderRetryableError("Calendly is temporarily unavailable") from exc
        if response.status_code in {400, 401, 403, 404, 422}:
            raise ProviderPermanentError("Calendly rejected the scheduling-link request")
        if response.status_code == 429 or response.status_code >= 500:
            raise ProviderRetryableError("Calendly is temporarily unavailable")
        try:
            booking_url = str(response.json()["resource"]["booking_url"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ProviderPermanentError("Calendly returned an invalid scheduling link") from exc
        parsed = urlsplit(booking_url)
        host = (parsed.hostname or "").lower()
        trusted_host = host == "calendly.com" or host.endswith(".calendly.com")
        if parsed.scheme != "https" or not trusted_host:
            raise ProviderPermanentError("Calendly returned an untrusted scheduling link")
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        query.update(
            {
                "utm_source": "signalpath",
                "utm_medium": "sms",
                "utm_campaign": "human_handoff",
                "utm_content": correlation_token,
            }
        )
        return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query), ""))
