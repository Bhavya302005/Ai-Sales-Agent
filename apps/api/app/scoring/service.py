import re
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.entity_resolution.service import normalize_geography
from app.persistence.models import (
    FieldAssertion,
    Lead,
    Product,
    ProductVersion,
    Requirement,
    ScoreSnapshot,
    SourceDocument,
)

RULE_VERSION = "score.v1"
INDIA_GEOGRAPHIES = {"gujarat", "mumbai", "delhi", "bengaluru", "india"}
WEIGHTS = {
    "icp_fit": 0.25,
    "explicit_intent": 0.25,
    "urgency": 0.10,
    "source_quality": 0.10,
    "data_confidence": 0.10,
    "engagement": 0.10,
    "freshness": 0.10,
}


@dataclass(frozen=True)
class ScoreInputs:
    requirement: Requirement
    source: SourceDocument
    product_version: ProductVersion
    assertions: tuple[FieldAssertion, ...]
    now: datetime


def _tokens(value: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", value.casefold().replace("_", " ")))


def _matches(value: str | None, approved: list[str]) -> float:
    if not value or not approved:
        return 0.0
    value_tokens = _tokens(value)
    return float(
        any(
            _tokens(item) <= value_tokens or value_tokens <= _tokens(item)
            for item in approved
        )
    )


def _assertion_value(assertions: tuple[FieldAssertion, ...], field: str) -> str | None:
    for assertion in assertions:
        if assertion.field_name == field and assertion.status not in {
            "unknown",
            "conflicted",
            "expired",
        }:
            raw = (assertion.value or {}).get("value")
            if isinstance(raw, str):
                return raw
    return None


def _icp_fit(inputs: ScoreInputs) -> float:
    icp = inputs.product_version.icp
    needs = [str(item) for item in icp.get("needs", [])]
    industries = [str(item) for item in icp.get("industries", [])]
    geographies = [str(item) for item in icp.get("geographies", [])]
    industry = _assertion_value(inputs.assertions, "industry")
    geography = inputs.requirement.geography
    geography_match = _matches(geography, geographies)
    if (
        geography
        and "India" in geographies
        and normalize_geography(geography) in INDIA_GEOGRAPHIES
    ):
        geography_match = 1.0
    dimensions = (
        _matches(
            f"{inputs.requirement.category or ''} {inputs.requirement.normalized_need}",
            needs,
        ),
        _matches(industry, industries),
        geography_match,
    )
    return round(sum(dimensions) / len(dimensions), 4)


def _urgency(requirement: Requirement, now: datetime) -> float:
    if requirement.explicit_deadline is None:
        return 0.3 if requirement.urgency else 0.0
    deadline = requirement.explicit_deadline
    if deadline.tzinfo is None:
        deadline = deadline.replace(tzinfo=UTC)
    days = (deadline - now).total_seconds() / 86_400
    if days < 0:
        return 0.0
    if days <= 30:
        return 1.0
    if days <= 90:
        return 0.7
    return 0.4


def _freshness(source: SourceDocument, now: datetime) -> float:
    timestamp = source.published_at or source.observed_at
    if timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=UTC)
    days = max(0.0, (now - timestamp).total_seconds() / 86_400)
    if days <= 30:
        return 1.0
    if days <= 90:
        return 0.7
    if days <= 180:
        return 0.4
    return 0.0


def calculate_score(inputs: ScoreInputs) -> tuple[dict[str, float], int, float]:
    assertion_fields = {
        item.field_name
        for item in inputs.assertions
        if item.status not in {"unknown", "conflicted", "expired"}
    }
    known = [
        True,
        inputs.requirement.category is not None,
        "industry" in assertion_fields,
        inputs.requirement.geography is not None,
        inputs.requirement.explicit_deadline is not None,
        "resolved_company_id" in assertion_fields,
    ]
    data_confidence = round(sum(known) / len(known), 4)
    features = {
        "icp_fit": _icp_fit(inputs),
        "explicit_intent": 1.0,
        "urgency": _urgency(inputs.requirement, inputs.now),
        "source_quality": {
            "permitted_fixture": 1.0,
            "manual_url": 0.8,
        }.get(inputs.source.source_type, 0.5),
        "data_confidence": data_confidence,
        "engagement": 0.0,
        "freshness": _freshness(inputs.source, inputs.now),
    }
    score = round(100 * sum(WEIGHTS[name] * value for name, value in features.items()))
    confidence = round((features["source_quality"] + data_confidence) / 2, 4)
    return features, score, confidence


def score_lead(
    session: Session,
    *,
    organization_id: UUID,
    lead: Lead,
    requirement: Requirement,
    source: SourceDocument,
    product_version: ProductVersion,
    now: datetime | None = None,
) -> tuple[ScoreSnapshot, bool]:
    existing = session.scalar(
        select(ScoreSnapshot).where(
            ScoreSnapshot.organization_id == organization_id,
            ScoreSnapshot.lead_id == lead.id,
            ScoreSnapshot.rule_version == RULE_VERSION,
        )
    )
    if existing:
        return existing, False
    assertions = tuple(
        session.scalars(
            select(FieldAssertion).where(
                FieldAssertion.organization_id == organization_id,
                FieldAssertion.entity_type == "requirement",
                FieldAssertion.entity_id == requirement.id,
            )
        ).all()
    )
    features, score, confidence = calculate_score(
        ScoreInputs(
            requirement=requirement,
            source=source,
            product_version=product_version,
            assertions=assertions,
            now=now or datetime.now(UTC),
        )
    )
    evidence_ids = {
        field: [str(item.id) for item in assertions if item.field_name == field]
        for field in {item.field_name for item in assertions}
    }
    snapshot = ScoreSnapshot(
        organization_id=organization_id,
        lead_id=lead.id,
        feature_values=features,
        weights=WEIGHTS,
        evidence={
            "assertions": evidence_ids,
            "source_document_id": str(source.id),
            "product_version_id": str(product_version.id),
        },
        score=score,
        confidence=Decimal(str(confidence)),
        explanation=(
            "Score uses approved ICP fit, explicit sourced intent, urgency, source quality, "
            "known-data coverage and freshness. Engagement is unknown and contributes zero."
        ),
        rule_version=RULE_VERSION,
    )
    session.add(snapshot)
    session.flush()
    return snapshot, True


def ensure_opportunity_and_score(
    session: Session,
    *,
    organization_id: UUID,
    workspace_id: UUID,
    requirement: Requirement,
    source: SourceDocument,
    company_id: UUID | None,
) -> tuple[Lead, ScoreSnapshot] | None:
    product = session.scalar(
        select(Product).where(
            Product.organization_id == organization_id,
            Product.workspace_id == workspace_id,
            Product.active_version_id.is_not(None),
        )
    )
    if product is None or product.active_version_id is None:
        return None
    product_version = session.scalar(
        select(ProductVersion).where(
            ProductVersion.id == product.active_version_id,
            ProductVersion.organization_id == organization_id,
            ProductVersion.approved_at.is_not(None),
        )
    )
    if product_version is None:
        return None
    lead = session.scalar(
        select(Lead).where(
            Lead.organization_id == organization_id,
            Lead.requirement_id == requirement.id,
            Lead.product_version_id == product_version.id,
        )
    )
    if lead is None:
        lead = Lead(
            organization_id=organization_id,
            workspace_id=workspace_id,
            requirement_id=requirement.id,
            company_id=company_id,
            product_version_id=product_version.id,
            lifecycle="discovered",
            outreach_eligible=False,
        )
        session.add(lead)
        session.flush()
    elif lead.company_id is None and company_id is not None:
        lead.company_id = company_id
    snapshot, _created = score_lead(
        session,
        organization_id=organization_id,
        lead=lead,
        requirement=requirement,
        source=source,
        product_version=product_version,
    )
    return lead, snapshot
