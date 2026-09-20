from collections.abc import Generator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from database.seeds.demo import seed_demo
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.auth import create_access_token
from app.config import Settings, get_settings
from app.db import get_session
from app.demo_ids import (
    CAMPAIGN_LEAD_ID,
    CONTACT_ID,
    LEAD_ID,
    ORGANIZATION_ID,
    USER_ID,
)
from app.main import app
from app.outcomes.service import finalize_completed_call
from app.persistence.models import Base, Call, CampaignLead, TranscriptSegment, UsageEvent


def test_funnel_and_usage_reconcile_to_stored_records(tmp_path: Path) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'analytics.db'}"
    settings = Settings(app_env="test", database_url=database_url)
    engine = create_engine(database_url)
    Base.metadata.create_all(engine)
    assert seed_demo(database_url)
    session = Session(engine)
    campaign_lead = session.get_one(CampaignLead, CAMPAIGN_LEAD_ID)
    campaign_lead.approved_at = datetime.now(UTC)
    campaign_lead.approved_by = USER_ID
    campaign_lead.state = "approved"
    now = datetime.now(UTC)
    call = Call(
        organization_id=ORGANIZATION_ID,
        lead_id=LEAD_ID,
        contact_id=CONTACT_ID,
        attempt_id=uuid4(),
        transport="browser",
        state="completed",
        eligibility_decision={"eligible": True, "checks": []},
        max_duration_seconds=300,
        started_at=now - timedelta(seconds=20),
        ended_at=now,
        usage={
            "actual_call_seconds": 20,
            "reserved_cost_inr": "5",
            "reservation_status": "consumed",
            "voice_latency_ms": [420, 580],
        },
        outcome="handoff_requested",
    )
    session.add(call)
    session.flush()
    session.add_all(
        [
            TranscriptSegment(
                organization_id=ORGANIZATION_ID,
                call_id=call.id,
                sequence=0,
                speaker="agent",
                started_ms=0,
                ended_ms=1000,
                text="Which ERP workloads are in scope?",
                language="en-IN",
                is_final=True,
            ),
            TranscriptSegment(
                organization_id=ORGANIZATION_ID,
                call_id=call.id,
                sequence=1,
                speaker="participant",
                started_ms=1000,
                ended_ms=3500,
                text="We need ERP finance migration.",
                language="en-IN",
                is_final=True,
            ),
        ]
    )
    session.commit()
    finalize_completed_call(session, organization_id=ORGANIZATION_ID, call_id=call.id)
    session.commit()

    def session_override() -> Generator[Session, None, None]:
        yield session

    token = create_access_token(
        user_id=USER_ID,
        organization_id=ORGANIZATION_ID,
        settings=settings,
        lifetime=timedelta(minutes=5),
    )
    headers = {"Authorization": f"Bearer {token}"}
    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as client:
        funnel = client.get("/api/v1/analytics/funnel", headers=headers)
        usage = client.get("/api/v1/analytics/usage", headers=headers)
    app.dependency_overrides.clear()

    assert funnel.json() == {
        "discovered": 1,
        "reviewed": 1,
        "approved": 1,
        "called": 1,
        # 'qualified' is now 0 because the test transcript has no positive interest
        # signal ("We need ERP finance migration" doesn't indicate confirmed interest,
        # budget_known, or authority_known). This is the correct behaviour after the fix.
        "qualified": 0,
        "handed_off": 1,
    }
    totals = {item["unit"]: item for item in usage.json()["totals"]}
    assert totals["call_seconds"]["quantity"] == "20.0000"
    assert totals["stt_seconds"]["quantity"] == "2.5000"
    assert totals["tts_characters"]["quantity"] == "33.0000"
    assert totals["llm_tokens"]["quantity"] == "0"
    assert totals["enrichment_units"]["quantity"] == "1.0000"
    assert usage.json()["total_estimated_cost_inr"] == "5.0000"
    assert usage.json()["total_actual_cost_inr"] is None
    assert usage.json()["average_voice_latency_ms"] == 500
    assert session.scalar(select(func.count()).select_from(UsageEvent)) == 4
    finalize_completed_call(session, organization_id=ORGANIZATION_ID, call_id=call.id)
    assert session.scalar(select(func.count()).select_from(UsageEvent)) == 4
    session.close()
