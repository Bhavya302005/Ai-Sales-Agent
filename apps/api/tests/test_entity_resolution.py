from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.entity_resolution.service import (
    merge_companies,
    normalize_domain,
    normalize_geography,
    normalize_name,
    refresh_assertion_statuses,
    resolve_company,
    reverse_company_merge,
)
from app.persistence.models import (
    Base,
    Company,
    FieldAssertion,
    Lead,
    Organization,
    Product,
    ProductVersion,
    Requirement,
    SourceDocument,
    Workspace,
)


def _session() -> tuple[Session, object]:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = Session(engine)
    organization_id = uuid4()
    session.add(Organization(id=organization_id, name="Resolution tenant"))
    session.flush()
    return session, organization_id


def test_normalization_is_stable_and_domain_is_exact() -> None:
    assert normalize_name("  Narmada—Manufacturing  ") == "narmada manufacturing"
    assert normalize_geography("Gujarat, India") == "gujarat"
    assert normalize_domain("HTTPS://WWW.Example.COM/path") == "example.com"


def test_repeated_identity_resolves_consistently_but_ambiguous_location_stays_separate() -> None:
    session, organization_id = _session()
    first = resolve_company(
        session,
        organization_id=organization_id,
        name="Acme Manufacturing",
        geography="Gujarat, India",
    )
    repeated = resolve_company(
        session,
        organization_id=organization_id,
        name="ACME  Manufacturing",
        geography="Gujarat",
    )
    ambiguous = resolve_company(
        session,
        organization_id=organization_id,
        name="Acme Manufacturing",
        geography="Delhi",
    )

    assert first.created is True
    assert repeated.company and repeated.company.id == first.company.id
    assert repeated.method == "exact_name_location"
    assert ambiguous.company and ambiguous.company.id != first.company.id
    assert ambiguous.method == "created_ambiguous"


def test_conflicting_assertions_are_preserved_and_marked_conflicted() -> None:
    session, organization_id = _session()
    entity_id = uuid4()
    for value in ("Gujarat", "Delhi"):
        session.add(
            FieldAssertion(
                organization_id=organization_id,
                entity_type="company",
                entity_id=entity_id,
                field_name="location",
                value={"value": value},
                source_document_id=None,
                evidence_span={"quote": value, "start": 0, "end": len(value)},
                extraction_method="test",
                confidence=Decimal("1"),
                observed_at=datetime.now(UTC),
                status="single_source",
            )
        )
    session.flush()
    refresh_assertion_statuses(
        session,
        organization_id=organization_id,
        entity_type="company",
        entity_id=entity_id,
    )

    assertions = session.scalars(select(FieldAssertion)).all()
    assert [item.value for item in assertions] == [
        {"value": "Gujarat"},
        {"value": "Delhi"},
    ]
    assert {item.status for item in assertions} == {"conflicted"}


def test_company_merge_moves_leads_and_can_be_reversed_with_audit() -> None:
    session, organization_id = _session()
    workspace = Workspace(
        organization_id=organization_id,
        name="Workspace",
        locale="en-IN",
        timezone="Asia/Kolkata",
    )
    source_company = Company(
        organization_id=organization_id,
        normalized_name="acme old",
        normalized_domain=None,
        location="Gujarat",
        merge_status="canonical",
    )
    target_company = Company(
        organization_id=organization_id,
        normalized_name="acme",
        normalized_domain="acme.example",
        location="Gujarat",
        merge_status="canonical",
    )
    product = Product(organization_id=organization_id, workspace_id=uuid4(), name="Product")
    session.add_all([workspace, source_company, target_company])
    session.flush()
    product.workspace_id = workspace.id
    session.add(product)
    session.flush()
    version = ProductVersion(
        organization_id=organization_id,
        product_id=product.id,
        version=1,
        description="Approved",
        icp={},
        exclusions=[],
        facts={},
        pricing_policy="Human approval",
    )
    document = SourceDocument(
        organization_id=organization_id,
        workspace_id=workspace.id,
        canonical_url="fixture://merge-test",
        source_type="fixture",
        rights_note="Synthetic permitted fixture",
        observed_at=datetime.now(UTC),
        content_hash="a" * 64,
        evidence_excerpt="Acme needs ERP.",
        extraction_status="completed",
    )
    session.add_all([version, document])
    session.flush()
    requirement = Requirement(
        organization_id=organization_id,
        source_document_id=document.id,
        normalized_need="ERP",
        evidence_span={"quote": "ERP", "start": 11, "end": 14},
    )
    session.add(requirement)
    session.flush()
    lead = Lead(
        organization_id=organization_id,
        workspace_id=workspace.id,
        requirement_id=requirement.id,
        company_id=source_company.id,
        product_version_id=version.id,
    )
    session.add(lead)
    session.flush()

    merge_audit = merge_companies(
        session,
        organization_id=organization_id,
        source_id=source_company.id,
        target_id=target_company.id,
        actor_id=uuid4(),
        reason="Duplicate company reviewed by owner",
        request_id="merge-test",
    )
    assert lead.company_id == target_company.id
    assert source_company.merge_status == "merged"

    reversal = reverse_company_merge(
        session,
        organization_id=organization_id,
        merge_audit_id=merge_audit.id,
        actor_id=uuid4(),
        reason="Incorrect duplicate selection",
        request_id="reverse-test",
    )
    assert reversal.action == "company_merge_reversed"
    assert lead.company_id == source_company.id
    assert source_company.merge_status == "canonical"
