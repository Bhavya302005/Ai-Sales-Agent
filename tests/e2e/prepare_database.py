"""Create an isolated, deterministic SQLite database for browser tests."""

from pathlib import Path
import sys

from sqlalchemy import create_engine

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "apps" / "api"))

from app.persistence.models import Base  # noqa: E402
from database.seeds.demo import seed_demo  # noqa: E402

DATABASE_PATH = Path("/tmp/ai-sales-agent-playwright.db")
DATABASE_URL = f"sqlite+pysqlite:////{DATABASE_PATH.as_posix().lstrip('/')}"


def main() -> None:
    if DATABASE_PATH.exists():
        DATABASE_PATH.unlink()
    engine = create_engine(DATABASE_URL)
    Base.metadata.create_all(engine)
    engine.dispose()
    if not seed_demo(DATABASE_URL):
        raise RuntimeError("isolated Playwright database was not seeded")
    print("Playwright database prepared with synthetic demo fixtures.")


if __name__ == "__main__":
    main()
