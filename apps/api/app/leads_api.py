from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import Auth
from app.briefing.service import build_pre_call_brief
from app.db import get_session
from app.lead_schemas import (
    AssertionResponse,
    LeadDetailResponse,
    LeadSummaryResponse,
    OfferingResponse,
    ScoreContributionResponse,
    ScoreDetailResponse,
    SourceResponse,
)
from app.persistence.models import ScoreSnapshot
from app.repositories.leads import LeadRecord, LeadRepository

router = APIRouter(prefix="/api/v1/leads", tags=["leads"])


def _summary(record: LeadRecord) -> LeadSummaryResponse:
    return LeadSummaryResponse(
        id=record.lead.id,
        product_version_id=record.lead.product_version_id,
        lifecycle=record.lead.lifecycle,
        company_name=record.company.normalized_name if record.company else None,
        normalized_need=record.requirement.normalized_need,
        source_url=record.source.canonical_url,
        published_at=record.source.published_at,
        score=record.score.score if record.score else None,
        score_confidence=float(record.score.confidence) if record.score else None,
    )


def _score_detail(score: ScoreSnapshot | None) -> ScoreDetailResponse | None:
    if score is None:
        return None
    feature_values: dict[str, Any] = score.feature_values
    weights: dict[str, Any] = score.weights
    contributions = [
        ScoreContributionResponse(
            feature=feature,
            value=float(value),
            weight=float(weights.get(feature, 0)),
            points=round(float(value) * float(weights.get(feature, 0)) * 100, 1),
        )
        for feature, value in feature_values.items()
    ]
    return ScoreDetailResponse(
        total=score.score,
        confidence=float(score.confidence),
        explanation=score.explanation,
        rule_version=score.rule_version,
        contributions=contributions,
    )


@router.get("", response_model=list[LeadSummaryResponse])
def list_leads(
    auth: Auth, session: Annotated[Session, Depends(get_session)]
) -> list[LeadSummaryResponse]:
    records = LeadRepository(session, auth.organization_id).list_records()
    return [_summary(record) for record in records]


@router.get("/{lead_id}", response_model=LeadDetailResponse)
def get_lead(
    lead_id: UUID,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> LeadDetailResponse:
    repository = LeadRepository(session, auth.organization_id)
    record = repository.get(lead_id)
    if record is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")
    assertion_rows = repository.assertions(record)
    assertions = [
        AssertionResponse(
            id=assertion.id,
            field_name=assertion.field_name,
            value=assertion.value,
            status=assertion.status,
            confidence=float(assertion.confidence),
            evidence_excerpt=(assertion.evidence_span or {}).get("quote")
            or (assertion.evidence_span or {}).get("excerpt"),
            observed_at=assertion.observed_at,
            source_url=source.canonical_url if source else None,
        )
        for assertion, source in assertion_rows
    ]
    asserted_fields = {assertion.field_name for assertion, _ in assertion_rows}
    unknown_fields = [
        field
        for field in ("budget", "decision_maker", "phone_number")
        if field not in asserted_fields
    ]
    brief = (
        build_pre_call_brief(record, unknown_fields)
        if record.product_version.approved_at is not None
        else None
    )
    return LeadDetailResponse(
        **_summary(record).model_dump(),
        source=SourceResponse(
            url=record.source.canonical_url,
            source_type=record.source.source_type,
            rights_note=record.source.rights_note,
            published_at=record.source.published_at,
            observed_at=record.source.observed_at,
            evidence_excerpt=record.source.evidence_excerpt,
        ),
        assertions=assertions,
        score_detail=_score_detail(record.score),
        offering=OfferingResponse.model_validate(record.product_version),
        unknown_fields=unknown_fields,
        pre_call_brief=brief,
    )
