import socket
from functools import lru_cache
from urllib.parse import urlparse

from sqlalchemy import Engine, create_engine, text


@lru_cache(maxsize=4)
def _engine(database_url: str) -> Engine:
    return create_engine(database_url, pool_pre_ping=True, pool_size=1, max_overflow=0)


def database_is_ready(database_url: str) -> bool:
    try:
        with _engine(database_url).connect() as connection:
            connection.execute(text("SELECT 1"))
        return True
    except Exception:  # The readiness contract returns a safe boolean, never driver details.
        return False


def broker_is_ready(rabbitmq_url: str) -> bool:
    parsed = urlparse(rabbitmq_url)
    host = parsed.hostname
    port = parsed.port or 5672
    if not host:
        return False
    try:
        with socket.create_connection((host, port), timeout=1.0):
            return True
    except OSError:
        return False

