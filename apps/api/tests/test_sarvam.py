import base64
from urllib.parse import parse_qs, urlparse

import pytest

from app.sarvam import provider_close, realtime_url, validate_browser_message


def test_realtime_url_uses_bounded_voice_configuration() -> None:
    parsed = urlparse(realtime_url("hi-IN"))
    query = parse_qs(parsed.query)

    assert parsed.scheme == "wss"
    assert parsed.path == "/speech-to-text-realtime/ws"
    assert query["language_code"] == ["hi-IN"]
    assert query["encoding"] == ["linear16"]
    assert query["sample_rate"] == ["16000"]
    assert query["stream_type"] == ["fast"]


def test_realtime_url_rejects_unapproved_languages() -> None:
    query = parse_qs(urlparse(realtime_url("fr-FR")).query)
    assert query["language_code"] == ["auto"]


def test_audio_message_validation() -> None:
    encoded = base64.b64encode(b"\x01\x02").decode()
    assert validate_browser_message({"event": "audio_input", "audio": encoded}) == {
        "event": "audio_input",
        "audio": encoded,
    }


@pytest.mark.parametrize(
    "message",
    [
        {"event": "audio_input", "audio": "not base64"},
        {"event": "audio_input", "audio": ""},
        {"event": "config.update"},
    ],
)
def test_invalid_browser_messages_are_rejected(message: dict[str, str]) -> None:
    with pytest.raises(ValueError):
        validate_browser_message(message)


def test_provider_quota_error_maps_to_clean_application_close() -> None:
    assert provider_close(
        {"event": "error", "code": "quota_exceeded", "is_fatal": True, "status_code": 402}
    ) == (4002, "provider credits exhausted")


def test_nonfatal_provider_error_keeps_session_open() -> None:
    assert provider_close({"event": "error", "code": "temporary", "is_fatal": False}) is None
