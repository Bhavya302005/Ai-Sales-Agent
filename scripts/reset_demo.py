import argparse

from database.seeds.demo import seed_demo
from sqlalchemy import create_engine, delete
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.config import get_settings
from app.demo_ids import ORGANIZATION_ID
from app.discovery.ingestion import ingest_source
from app.discovery.service import load_demo_snapshot
from app.extraction.service import extract_source
from app.persistence.models import Base, Organization


def reset_demo() -> None:
    settings = get_settings()
    url = make_url(settings.database_url)
    local_hosts = {None, "localhost", "127.0.0.1", "::1"}
    if settings.app_env not in {"development", "test"} or url.host not in local_hosts:
        raise RuntimeError("Demo reset is restricted to a local development/test database")
    engine = create_engine(settings.database_url)
    with engine.begin() as connection:
        for table in reversed(Base.metadata.sorted_tables):
            if table.name == Organization.__tablename__:
                continue
            if "organization_id" in table.c:
                connection.execute(
                    delete(table).where(table.c.organization_id == ORGANIZATION_ID)
                )
        connection.execute(
            delete(Organization.__table__).where(Organization.id == ORGANIZATION_ID)
        )
    if not seed_demo(settings.database_url):
        raise RuntimeError("Demo tenant could not be reseeded")
    with Session(engine) as session, session.begin():
        for item in load_demo_snapshot():
            ingestion = ingest_source(session, ORGANIZATION_ID, item.fetched_source())
            if ingestion.created:
                extract_source(
                    session,
                    organization_id=ORGANIZATION_ID,
                    source=ingestion.document,
                )
    print("demo reset complete: approved offering, discovery, campaign, and test contact")


def main() -> None:
    parser = argparse.ArgumentParser(description="Reset only the fixed local demo tenant")
    parser.add_argument("--confirm-local-demo-reset", action="store_true")
    args = parser.parse_args()
    if not args.confirm_local_demo_reset:
        parser.error("pass --confirm-local-demo-reset to reset the fixed demo tenant")
    reset_demo()


if __name__ == "__main__":
    main()
