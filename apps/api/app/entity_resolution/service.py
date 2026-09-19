import json
import re
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from urllib.parse import urlsplit
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.extraction.schemas import EvidenceClaim
from app.persistence.models import AuditLog, Company, FieldAssertion, Lead, SourceDocument

ASSERTION_STATUSES = frozenset(
    {"verified", "corroborated", "single_source", "inferred", "unknown", "conflicted", "expired"}
)


def normalize_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"[^\w&]+", " ", normalized, flags=re.UNICODE).strip()


def normalize_geography(value: str | None) -> str | None:
    if not value:
        return None
    normalized = normalize_name(value)
    parts = [part for part in normalized.split() if part not in {"india", "भारत"}]
    return " ".join(parts) or normalized


def normalize_domain(value: str | None) -> str | None:
    if not value:
        return None
    candidate = value if "://" in value else f"https://{value}"
    hostname = urlsplit(candidate).hostname
    if not hostname:
        raise ValueError("invalid company domain")
    domain = hostname.rstrip(".").casefold().encode("idna").decode("ascii")
    return domain.removeprefix("www.")


@dataclass(frozen=True)
class ResolutionResult:
    company: Company | None
    created: bool
    method: str


def resolve_company(
    session: Session,
    *,
    organization_id: UUID,
    name: str | None,
    geography: str | None,
    domain: str | None = None,
) -> ResolutionResult:
    domain_key = normalize_domain(domain)
    if domain_key:
        exact_domain = session.scalar(
            select(Company).where(
                Company.organization_id == organization_id,
                Company.normalized_domain == domain_key,
                Company.merge_status == "canonical",
            )
        )
        if exact_domain:
            return ResolutionResult(exact_domain, False, "exact_domain")
    if not name:
        return ResolutionResult(None, False, "unknown")

    name_key = normalize_name(name)
    geography_key = normalize_geography(geography)
    candidates = session.scalars(
        select(Company).where(
            Company.organization_id == organization_id,
            Company.merge_status == "canonical",
        )
    ).all()
    exact_identity = [
        candidate
        for candidate in candidates
        if normalize_name(candidate.normalized_name) == name_key
        and geography_key is not None
        and normalize_geography(candidate.location) == geography_key
    ]
    if len(exact_identity) == 1:
        return ResolutionResult(exact_identity[0], False, "exact_name_location")

    company = Company(
        organization_id=organization_id,
        normalized_name=name_key,
        normalized_domain=domain_key,
        location=geography.strip() if geography else None,
        merge_status="canonical",
    )
    session.add(company)
    session.flush()
    method = "created_ambiguous" if any(
        normalize_name(candidate.normalized_name) == name_key for candidate in candidates
    ) else "created"
    return ResolutionResult(company, True, method)


def _span(claim: EvidenceClaim | None) -> dict[str, int | str] | None:
    if claim is None:
        return None
    return {"quote": claim.quote, "start": claim.start, "end": claim.end}


def resolve_requirement_company(
    session: Session,
    *,
    organization_id: UUID,
    requirement_id: UUID,
    source: SourceDocument,
    company_claim: EvidenceClaim | None,
    geography_claim: EvidenceClaim | None,
) -> ResolutionResult:
    existing_assertion = session.scalar(
        select(FieldAssertion).where(
            FieldAssertion.organization_id == organization_id,
            FieldAssertion.entity_type == "requirement",
            FieldAssertion.entity_id == requirement_id,
            FieldAssertion.field_name == "resolved_company_id",
        )
    )
    if existing_assertion is not None:
        value = existing_assertion.value or {}
        company_id = value.get("value")
        company = (
            session.scalar(
                select(Company).where(
                    Company.organization_id == organization_id,
                    Company.id == UUID(company_id),
                )
            )
            if isinstance(company_id, str)
            else None
        )
        return ResolutionResult(company, False, "existing_assertion")

    result = resolve_company(
        session,
        organization_id=organization_id,
        name=company_claim.value if company_claim else None,
        geography=geography_claim.value if geography_claim else None,
    )
    session.add(
        FieldAssertion(
            organization_id=organization_id,
            entity_type="requirement",
            entity_id=requirement_id,
            field_name="resolved_company_id",
            value={"value": str(result.company.id)} if result.company else None,
            source_document_id=source.id,
            evidence_span=_span(company_claim),
            extraction_method=f"entity_resolution:{result.method}",
            confidence=Decimal("1.0000") if result.company else Decimal("0.0000"),
            observed_at=source.observed_at,
            status="inferred" if result.company else "unknown",
        )
    )
    session.flush()
    return result


def refresh_assertion_statuses(
    session: Session, *, organization_id: UUID, entity_type: str, entity_id: UUID
) -> None:
    assertions = session.scalars(
        select(FieldAssertion).where(
            FieldAssertion.organization_id == organization_id,
            FieldAssertion.entity_type == entity_type,
            FieldAssertion.entity_id == entity_id,
        )
    ).all()
    now = datetime.now(UTC)
    by_field: dict[str, list[FieldAssertion]] = {}
    for assertion in assertions:
        by_field.setdefault(assertion.field_name, []).append(assertion)
    for field_assertions in by_field.values():
        active = [
            item
            for item in field_assertions
            if item.status not in {"verified", "inferred", "unknown"}
        ]
        if not active:
            continue
        values = {json.dumps(item.value, sort_keys=True) for item in active}
        for item in active:
            observed = item.observed_at
            if observed.tzinfo is None:
                observed = observed.replace(tzinfo=UTC)
            if now - observed > timedelta(days=365):
                item.status = "expired"
            elif len(values) > 1:
                item.status = "conflicted"
            elif len({item.source_document_id for item in active}) > 1:
                item.status = "corroborated"
            else:
                item.status = "single_source"


def merge_companies(
    session: Session,
    *,
    organization_id: UUID,
    source_id: UUID,
    target_id: UUID,
    actor_id: UUID,
    reason: str,
    request_id: str,
) -> AuditLog:
    if source_id == target_id:
        raise ValueError("source and target companies must differ")
    companies = session.scalars(
        select(Company).where(
            Company.organization_id == organization_id,
            Company.id.in_([source_id, target_id]),
        )
    ).all()
    by_id = {company.id: company for company in companies}
    source, target = by_id.get(source_id), by_id.get(target_id)
    if source is None or target is None:
        raise LookupError("company not found")
    if source.merge_status != "canonical" or target.merge_status != "canonical":
        raise ValueError("only canonical companies can be merged")
    leads = session.scalars(
        select(Lead).where(
            Lead.organization_id == organization_id,
            Lead.company_id == source.id,
        )
    ).all()
    moved_lead_ids = [str(lead.id) for lead in leads]
    for lead in leads:
        lead.company_id = target.id
    source.merge_status = "merged"
    source.merged_into_id = target.id
    audit = AuditLog(
        organization_id=organization_id,
        actor_id=actor_id,
        action="company_merged",
        target_type="company",
        target_id=source.id,
        reason=json.dumps(
            {"reason": reason, "target_id": str(target.id), "moved_lead_ids": moved_lead_ids},
            sort_keys=True,
        ),
        request_id=request_id,
    )
    session.add(audit)
    session.flush()
    return audit


def reverse_company_merge(
    session: Session,
    *,
    organization_id: UUID,
    merge_audit_id: UUID,
    actor_id: UUID,
    reason: str,
    request_id: str,
) -> AuditLog:
    audit = session.scalar(
        select(AuditLog).where(
            AuditLog.id == merge_audit_id,
            AuditLog.organization_id == organization_id,
            AuditLog.action == "company_merged",
        )
    )
    if audit is None:
        raise LookupError("merge audit not found")
    already_reversed = session.scalar(
        select(AuditLog).where(
            AuditLog.organization_id == organization_id,
            AuditLog.action == "company_merge_reversed",
            AuditLog.target_id == audit.id,
        )
    )
    if already_reversed is not None:
        raise ValueError("merge is already reversed")
    payload = json.loads(audit.reason or "{}")
    target_id = UUID(payload["target_id"])
    source = session.scalar(
        select(Company).where(
            Company.organization_id == organization_id,
            Company.id == audit.target_id,
            Company.merge_status == "merged",
            Company.merged_into_id == target_id,
        )
    )
    if source is None:
        raise ValueError("merge state has changed and cannot be reversed safely")
    moved_ids = [UUID(value) for value in payload.get("moved_lead_ids", [])]
    if moved_ids:
        leads = session.scalars(
            select(Lead).where(
                Lead.organization_id == organization_id,
                Lead.id.in_(moved_ids),
                Lead.company_id == target_id,
            )
        ).all()
        for lead in leads:
            lead.company_id = source.id
    source.merge_status = "canonical"
    source.merged_into_id = None
    reversal = AuditLog(
        organization_id=organization_id,
        actor_id=actor_id,
        action="company_merge_reversed",
        target_type="audit_log",
        target_id=audit.id,
        reason=reason,
        request_id=request_id,
    )
    session.add(reversal)
    session.flush()
    return reversal
