from fastapi.testclient import TestClient
from pytest import MonkeyPatch

from app import main
from app.config import Settings
from app.main import app


def test_liveness() -> None:
    with TestClient(app) as client:
        response = client.get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "api", "version": "0.1.0"}
    assert response.headers["X-Request-ID"]


def test_request_id_is_preserved() -> None:
    with TestClient(app) as client:
        response = client.get("/health/live", headers={"X-Request-ID": "test-request"})

    assert response.headers["X-Request-ID"] == "test-request"


def test_readiness_reports_unavailable_dependencies(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setattr(main, "get_settings", lambda: Settings(app_env="test", async_mode="celery"))
    monkeypatch.setattr(main, "database_is_ready", lambda _: False)
    monkeypatch.setattr(main, "broker_is_ready", lambda _: False)
    with TestClient(app) as client:
        response = client.get("/health/ready")

    assert response.status_code == 503
    assert response.json()["status"] == "degraded"
    checks = {check["name"]: check["status"] for check in response.json()["checks"]}
    assert checks == {
        "configuration": "ok",
        "database": "unavailable",
        "broker": "unavailable",
    }


def test_readiness_passes_only_when_dependencies_pass(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setattr(main, "get_settings", lambda: Settings(app_env="test", async_mode="celery"))
    monkeypatch.setattr(main, "database_is_ready", lambda _: True)
    monkeypatch.setattr(main, "broker_is_ready", lambda _: True)
    with TestClient(app) as client:
        response = client.get("/health/ready")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_inline_mode_does_not_require_broker(monkeypatch: MonkeyPatch) -> None:
    monkeypatch.setattr(main, "get_settings", lambda: Settings(app_env="test", async_mode="inline"))
    monkeypatch.setattr(main, "database_is_ready", lambda _: True)
    monkeypatch.setattr(main, "broker_is_ready", lambda _: False)
    with TestClient(app) as client:
        response = client.get("/health/ready")

    assert response.status_code == 200
    checks = {check["name"]: check["status"] for check in response.json()["checks"]}
    assert checks["broker"] == "not_configured"
