import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.entity_resolution.service import ResolutionResult, resolve_requirement_company
from app.extraction.adapter import DeterministicExtractionAdapter
from app.extraction.schemas import EvidenceClaim, ExtractionResult
from app.persistence.models import (
    FieldAssertion,
    Lead,
    ModelRun,
    Requirement,
    ScoreSnapshot,
    SourceDocument,
)
from app.scoring.service import ensure_opportunity_and_score


@dataclass(frozen=True)
class ExtractionOutcome:
    result: ExtractionResult
    requirement: Requirement | None
    company_resolution: ResolutionResult | None
    lead: Lead | None
    score: ScoreSnapshot | None
    created: bool


def _span(claim: EvidenceClaim) -> dict[str, int | str]:
    return {"quote": claim.quote, "start": claim.start, "end": claim.end}


def _extract_live_summary(excerpt: str) -> EvidenceClaim:
    for line in excerpt.splitlines():
        line = line.strip()
        if len(line) >= 20 and not line.startswith("http") and not line.startswith("URL:"):
            for sentence in re.split(r"(?<=[.!?])\s+", line):
                sentence = sentence.strip()
                if 15 <= len(sentence) <= 400:
                    idx = excerpt.find(sentence)
                    if idx >= 0:
                        return EvidenceClaim(
                            value=sentence,
                            quote=sentence,
                            start=idx,
                            end=idx + len(sentence),
                        )
    cleaned = excerpt.strip()[:300].strip()
    idx = excerpt.find(cleaned)
    if idx < 0:
        cleaned = excerpt[:min(100, len(excerpt))]
        idx = 0
    return EvidenceClaim(
        value=cleaned,
        quote=cleaned,
        start=idx,
        end=idx + len(cleaned),
    )


def extract_source(
    session: Session, *, organization_id: UUID, source: SourceDocument
) -> ExtractionOutcome:
    existing = session.scalar(
        select(Requirement).where(
            Requirement.organization_id == organization_id,
            Requirement.source_document_id == source.id,
        )
    )
    adapter = DeterministicExtractionAdapter()
    result, latency_ms = adapter.extract(source.evidence_excerpt, observed_at=source.observed_at)
    if not result.actionable and (
        source.source_type == "exa_live_search"
        or source.discovery_actionable is True
        or (source.canonical_url and not source.canonical_url.startswith("fixture://"))
    ):
        summary = _extract_live_summary(source.evidence_excerpt)
        category = adapter._keyword_claim(
            source.evidence_excerpt,
            (
                ("cloud migration", "cloud_migration"),
                ("migrate", "cloud_migration"),
                ("crm", "crm"),
                ("erp", "erp"),
                ("automation", "automation"),
                ("digital", "automation"),
                ("transformation", "automation"),
                ("software", "automation"),
                ("ai", "automation"),
                ("consulting", "automation"),
            ),
        )
        industry = adapter._keyword_claim(
            source.evidence_excerpt,
            (
                ("manufacturing", "manufacturing"),
                ("healthcare", "healthcare"),
                ("retail", "retail"),
                ("fintech", "financial_services"),
                ("hospital", "healthcare"),
                ("technology", "technology"),
                ("it", "technology"),
                ("enterprise", "technology"),
            ),
        )
        geography = adapter._keyword_claim(
            source.evidence_excerpt,
            tuple(
                (place, place)
                for place in (
                    "Gujarat",
                    "Mumbai",
                    "Delhi",
                    "Bengaluru",
                    "India",
                    "UK",
                    "US",
                    "Australia",
                )
            ),
            flags=re.IGNORECASE,
        )
        company_clue = None
        if source.discovery_company and source.discovery_company in source.evidence_excerpt:
            c_idx = source.evidence_excerpt.find(source.discovery_company)
            company_clue = EvidenceClaim(
                value=source.discovery_company,
                quote=source.discovery_company,
                start=c_idx,
                end=c_idx + len(source.discovery_company),
            )
        result = ExtractionResult(
            classification="buyer_requirement",
            actionable=True,
            requirement_summary=summary,
            category=category,
            industry=industry,
            geography=geography,
            company_clues=(company_clue,) if company_clue else (),
            unknown_fields=(),
        )
        result.validate_evidence(source.evidence_excerpt)
    if existing is not None:
        resolution = resolve_requirement_company(
            session,
            organization_id=organization_id,
            requirement_id=existing.id,
            source=source,
            company_claim=result.company_clues[0] if result.company_clues else None,
            geography_claim=result.geography,
        )
        opportunity = ensure_opportunity_and_score(
            session,
            organization_id=organization_id,
            workspace_id=source.workspace_id,
            requirement=existing,
            source=source,
            company_id=resolution.company.id if resolution.company else None,
        )
        return ExtractionOutcome(
            result=result,
            requirement=existing,
            company_resolution=resolution,
            lead=opportunity[0] if opportunity else None,
            score=opportunity[1] if opportunity else None,
            created=False,
        )
    if source.extraction_status in {"not_actionable", "completed"}:
        return ExtractionOutcome(
            result=result,
            requirement=None,
            company_resolution=None,
            lead=None,
            score=None,
            created=False,
        )

    payload = result.model_dump(mode="json")
    source.discovery_actionable = result.actionable
    if source.opportunity_type is None:
        source.opportunity_type = (
            "hiring_signal" if result.classification == "job_posting" else result.classification
        )
    session.add(
        ModelRun(
            organization_id=organization_id,
            purpose="requirement_extraction",
            prompt_version=adapter.prompt_version,
            schema_version=result.schema_version,
            provider=adapter.provider,
            model=adapter.model,
            latency_ms=latency_ms,
            input_tokens=0,
            output_tokens=0,
            result_status="valid",
            response_hash=hashlib.sha256(
                json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
            ).hexdigest(),
        )
    )
    if not result.actionable or result.requirement_summary is None:
        source.extraction_status = "not_actionable"
        session.flush()
        return ExtractionOutcome(
            result=result,
            requirement=None,
            company_resolution=None,
            lead=None,
            score=None,
            created=True,
        )

    deadline = (
        datetime.fromisoformat(result.explicit_deadline.value)
        if result.explicit_deadline is not None
        else None
    )
    requirement = Requirement(
        organization_id=organization_id,
        source_document_id=source.id,
        normalized_need=result.requirement_summary.value,
        category=result.category.value if result.category else None,
        geography=result.geography.value if result.geography else None,
        urgency=result.urgency.value if result.urgency else None,
        explicit_deadline=deadline,
        evidence_span=_span(result.requirement_summary),
    )
    session.add(requirement)
    session.flush()
    claims: list[tuple[str, EvidenceClaim]] = [
        (name, claim)
        for name, claim in (
            ("normalized_need", result.requirement_summary),
            ("category", result.category),
            ("industry", result.industry),
            ("geography", result.geography),
            ("urgency", result.urgency),
            ("explicit_deadline", result.explicit_deadline),
        )
        if claim is not None
    ]
    claims.extend(("company_clue", claim) for claim in result.company_clues)
    for field_name, claim in claims:
        session.add(
            FieldAssertion(
                organization_id=organization_id,
                entity_type="requirement",
                entity_id=requirement.id,
                field_name=field_name,
                value={"value": claim.value},
                source_document_id=source.id,
                evidence_span=_span(claim),
                extraction_method=adapter.model,
                confidence=Decimal("1.0000"),
                observed_at=source.observed_at,
                status="single_source",
            )
        )
    source.extraction_status = "completed"
    resolution = resolve_requirement_company(
        session,
        organization_id=organization_id,
        requirement_id=requirement.id,
        source=source,
        company_claim=result.company_clues[0] if result.company_clues else None,
        geography_claim=result.geography,
    )
    opportunity = ensure_opportunity_and_score(
        session,
        organization_id=organization_id,
        workspace_id=source.workspace_id,
        requirement=requirement,
        source=source,
        company_id=resolution.company.id if resolution.company else None,
    )
    session.flush()
    return ExtractionOutcome(
        result=result,
        requirement=requirement,
        company_resolution=resolution,
        lead=opportunity[0] if opportunity else None,
        score=opportunity[1] if opportunity else None,
        created=True,
    )
