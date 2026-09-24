import re
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from hashlib import sha256
from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.discovery.connectors import FetchedSource
from app.persistence.models import SourceDocument, Workspace
from app.usage.service import record_usage_once


@dataclass(frozen=True)
class IngestionResult:
    document: SourceDocument
    created: bool


def normalized_excerpt(content: bytes, *, limit: int = 1600) -> str:
    text = content.decode("utf-8", errors="replace")
    return re.sub(r"\s+", " ", text).strip()[:limit]


def ingest_source(
    session: Session, organization_id: UUID, source: FetchedSource
) -> IngestionResult:
    content_hash = sha256(source.content).hexdigest()
    existing = session.scalar(
        select(SourceDocument).where(
            SourceDocument.organization_id == organization_id,
            or_(
                SourceDocument.canonical_url == source.candidate.canonical_url,
                SourceDocument.content_hash == content_hash,
            ),
        )
    )
    if existing is not None:
        return IngestionResult(document=existing, created=False)
    workspace = session.scalar(
        select(Workspace)
        .where(Workspace.organization_id == organization_id)
        .order_by(Workspace.created_at, Workspace.id)
        .limit(1)
    )
    if workspace is None:
        raise ValueError("organization has no workspace")
    now = datetime.now(UTC)
    document = SourceDocument(
        organization_id=organization_id,
        workspace_id=workspace.id,
        canonical_url=source.candidate.canonical_url,
        source_type=source.candidate.source_type,
        rights_note=source.candidate.rights_note,
        fetched_at=now,
        published_at=source.candidate.published_at,
        observed_at=now,
        content_hash=content_hash,
        snapshot_ref=source.candidate.snapshot_ref,
        evidence_excerpt=normalized_excerpt(source.content),
        extraction_status="pending",
        discovery_title=source.candidate.discovery_title,
        discovery_company=source.candidate.discovery_company,
        discovery_location=source.candidate.discovery_location,
        opportunity_type=source.candidate.opportunity_type,
        discovery_actionable=source.candidate.discovery_actionable,
        provider_metadata=source.candidate.provider_metadata or {},
    )
    session.add(document)
    session.flush()
    record_usage_once(
        session,
        organization_id=organization_id,
        provider_event_id=f"{document.id}:enrichment",
        provider=source.candidate.source_type,
        quantity=Decimal("1"),
        unit="enrichment_units",
        occurred_at=now,
    )
    return IngestionResult(document=document, created=True)
