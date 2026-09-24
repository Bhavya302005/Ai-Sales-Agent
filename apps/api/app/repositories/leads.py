from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.persistence.models import (
    Company,
    FieldAssertion,
    Lead,
    ProductVersion,
    Requirement,
    ScoreSnapshot,
    SourceDocument,
)


@dataclass(frozen=True)
class LeadRecord:
    lead: Lead
    requirement: Requirement
    source: SourceDocument
    company: Company | None
    product_version: ProductVersion
    score: ScoreSnapshot | None


class LeadRepository:
    def __init__(self, session: Session, organization_id: UUID) -> None:
        self._session = session
        self._organization_id = organization_id

    def _base_query(
        self,
    ) -> Select[tuple[Lead, Requirement, SourceDocument, Company, ProductVersion]]:
        organization_id = self._organization_id
        return (
            select(Lead, Requirement, SourceDocument, Company, ProductVersion)
            .join(
                Requirement,
                (Requirement.id == Lead.requirement_id)
                & (Requirement.organization_id == organization_id),
            )
            .join(
                SourceDocument,
                (SourceDocument.id == Requirement.source_document_id)
                & (SourceDocument.organization_id == organization_id),
            )
            .outerjoin(
                Company,
                (Company.id == Lead.company_id) & (Company.organization_id == organization_id),
            )
            .join(
                ProductVersion,
                (ProductVersion.id == Lead.product_version_id)
                & (ProductVersion.organization_id == organization_id),
            )
            .where(Lead.organization_id == organization_id)
        )

    def list_records(self) -> list[LeadRecord]:
        rows = self._session.execute(self._base_query().order_by(Lead.created_at.desc())).all()
        return [self._record(*row) for row in rows]

    def get(self, lead_id: UUID) -> LeadRecord | None:
        row = self._session.execute(self._base_query().where(Lead.id == lead_id)).one_or_none()
        return None if row is None else self._record(*row)

    def assertions(self, record: LeadRecord) -> list[tuple[FieldAssertion, SourceDocument | None]]:
        organization_id = self._organization_id
        rows = self._session.execute(
            select(FieldAssertion, SourceDocument)
            .outerjoin(
                SourceDocument,
                (SourceDocument.id == FieldAssertion.source_document_id)
                & (SourceDocument.organization_id == organization_id),
            )
            .where(
                FieldAssertion.organization_id == organization_id,
                FieldAssertion.entity_id.in_([record.lead.id, record.requirement.id]),
            )
            .order_by(FieldAssertion.field_name)
        ).all()
        return [(assertion, source) for assertion, source in rows]

    def _record(
        self,
        lead: Lead,
        requirement: Requirement,
        source: SourceDocument,
        company: Company | None,
        product_version: ProductVersion,
    ) -> LeadRecord:
        score = self._session.scalar(
            select(ScoreSnapshot)
            .where(
                ScoreSnapshot.organization_id == self._organization_id,
                ScoreSnapshot.lead_id == lead.id,
            )
            .order_by(ScoreSnapshot.created_at.desc())
            .limit(1)
        )
        return LeadRecord(lead, requirement, source, company, product_version, score)
