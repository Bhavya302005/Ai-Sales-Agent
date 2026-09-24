from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from app.config import get_settings


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    return create_engine(get_settings().database_url, pool_pre_ping=True)


def get_session() -> Generator[Session, None, None]:
    with Session(get_engine()) as session:
        yield session

