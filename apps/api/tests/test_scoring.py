from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

from database.seeds.demo import seed_demo
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import Session

from app.demo_ids import LEAD_ID, ORGANIZATION_ID, PRODUCT_VERSION_ID, REQUIREMENT_ID, SOURCE_ID
from app.persistence.models import (
    Base,
    FieldAssertion,
    Lead,
    ProductVersion,
    Requirement,
    ScoreSnapshot,
    SourceDocument,
)
from app.scoring.service import ScoreInputs, calculate_score, score_lead

NOW = datetime(2026, 9, 17, tzinfo=UTC)


def test_golden_score_uses_exact_plan_formula() -> None:
    requirement = Requirement(
        organization_id=uuid4(),
        source_document_id=uuid4(),
        normalized_need="Migrate ERP workloads to a managed cloud",
        category="cloud_migration",
        geography="Gujarat",
        urgency="explicit_deadline",
        explicit_deadline=datetime(2026, 9, 30, tzinfo=UTC),
        evidence_span={"quote": "Migrate ERP", "start": 0, "end": 11},
    )
    source = SourceDocument(
        organization_id=requirement.organization_id,
        workspace_id=uuid4(),
        canonical_url="fixture://golden-score",
        source_type="permitted_fixture",
        rights_note="Synthetic permitted golden scoring fixture",
        published_at=datetime(2026, 9, 15, tzinfo=UTC),
        observed_at=NOW,
        content_hash="b" * 64,
        evidence_excerpt="Manufacturing company needs cloud migration in Gujarat.",
        extraction_status="completed",
    )
    product = ProductVersion(
        organization_id=requirement.organization_id,
        product_id=uuid4(),
        version=1,
        description="Cloud migration",
        icp={
            "needs": ["cloud migration"],
            "industries": ["manufacturing"],
            "geographies": ["India"],
        },
        exclusions=[],
        facts={},
        pricing_policy="Human approval required",
        approved_at=NOW,
    )
    assertions = (
        FieldAssertion(
            organization_id=requirement.organization_id,
            entity_type="requirement",
            entity_id=uuid4(),
            field_name="industry",
            value={"value": "manufacturing"},
            source_document_id=uuid4(),
            evidence_span={"quote": "Manufacturing", "start": 0, "end": 13},
            extraction_method="golden",
            confidence=Decimal("1"),
            observed_at=NOW,
            status="single_source",
        ),
        FieldAssertion(
            organization_id=requirement.organization_id,
            entity_type="requirement",
            entity_id=uuid4(),
            field_name="resolved_company_id",
            value={"value": str(uuid4())},
            source_document_id=uuid4(),
            evidence_span={"quote": "company", "start": 14, "end": 21},
            extraction_method="golden",
            confidence=Decimal("1"),
            observed_at=NOW,
            status="inferred",
        ),
    )

    features, score, confidence = calculate_score(
        ScoreInputs(requirement, source, product, assertions, NOW)
    )

    assert features == {
        "icp_fit": 1.0,
        "explicit_intent": 1.0,
        "urgency": 1.0,
        "source_quality": 1.0,
        "data_confidence": 1.0,
        "engagement": 0.0,
        "freshness": 1.0,
    }
    assert score == 90
    assert confidence == 1.0


def test_score_snapshot_is_evidence_backed_and_idempotent(tmp_path: Path) -> None:
    database_url = f"sqlite+pysqlite:///{tmp_path / 'score.db'}"
    Base.metadata.create_all(create_engine(database_url))
    assert seed_demo(database_url)
    engine = create_engine(database_url)
    with Session(engine) as session, session.begin():
        session.execute(delete(ScoreSnapshot))
        lead = session.get_one(Lead, LEAD_ID)
        requirement = session.get_one(Requirement, REQUIREMENT_ID)
        source = session.get_one(SourceDocument, SOURCE_ID)
        product = session.get_one(ProductVersion, PRODUCT_VERSION_ID)
        first, created = score_lead(
            session,
            organization_id=ORGANIZATION_ID,
            lead=lead,
            requirement=requirement,
            source=source,
            product_version=product,
            now=NOW,
        )
        second, created_again = score_lead(
            session,
            organization_id=ORGANIZATION_ID,
            lead=lead,
            requirement=requirement,
            source=source,
            product_version=product,
            now=NOW,
        )

        assert created is True
        assert created_again is False
        assert first.id == second.id
        assert first.evidence["source_document_id"] == str(SOURCE_ID)
        assert first.feature_values["engagement"] == 0.0
        assert lead.outreach_eligible is False
