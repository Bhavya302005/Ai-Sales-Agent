from fastapi.testclient import TestClient

from app.voice_main import app as voice_app
from app.worker import ping


def test_voice_liveness() -> None:
    with TestClient(voice_app) as client:
        response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "voice", "version": "0.1.0"}


def test_worker_ping_contract() -> None:
    assert ping.run() == "pong"

