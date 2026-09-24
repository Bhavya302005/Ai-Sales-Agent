import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.voice_main import app


def test_voice_liveness() -> None:
    with TestClient(app) as client:
        response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "voice", "version": "0.1.0"}


def test_tts_requires_session_cookie() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/voice/tts",
            json={"text": "Hello", "language_code": "en-IN"},
        )

    assert response.status_code == 401


def test_voice_websocket_requires_session_cookie() -> None:
    with TestClient(app) as client:
        with pytest.raises(WebSocketDisconnect) as exc_info:
            with client.websocket_connect("/api/v1/voice/stream"):
                pass

    assert exc_info.value.code == 4401
