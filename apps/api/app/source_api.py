from datetime import datetime
from typing import Annotated
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import Auth
from app.config import Settings, get_settings
from app.db import get_session
from app.discovery.connectors import FixtureConnector, ManualHTTPConnector, SourcePolicyError
from app.discovery.ingestion import ingest_source
from app.jobs.api import JobResponse, job_response
from app.jobs.service import IdempotencyConflict, enqueue_once, process_event
from app.persistence.models import AuditLog, SourceDocument

router = APIRouter(prefix="/api/v1/sources", tags=["sources"])


class FixtureImportRequest(BaseModel):
    fixture_id: str = Field(default=FixtureConnector.FIXTURE_ID, max_length=100)


class URLImportRequest(BaseModel):
    url: str = Field(min_length=10, max_length=2048)
    rights_note: str = Field(min_length=20, max_length=1000)


class SourceDocumentResponse(BaseModel):
    id: UUID
    canonical_url: str
    source_type: str
    rights_note: str
    published_at: datetime | None
    observed_at: datetime
    evidence_excerpt: str
    extraction_status: str
    discovery_title: str | None
    discovery_company: str | None
    discovery_location: str | None
    opportunity_type: str | None
    discovery_actionable: bool | None
    created: bool | None = None


def _response(document: SourceDocument, *, created: bool | None = None) -> SourceDocumentResponse:
    return SourceDocumentResponse(
        id=document.id,
        canonical_url=document.canonical_url,
        source_type=document.source_type,
        rights_note=document.rights_note,
        published_at=document.published_at,
        observed_at=document.observed_at,
        evidence_excerpt=document.evidence_excerpt,
        extraction_status=document.extraction_status,
        discovery_title=document.discovery_title,
        discovery_company=document.discovery_company,
        discovery_location=document.discovery_location,
        opportunity_type=document.opportunity_type,
        discovery_actionable=document.discovery_actionable,
        created=created,
    )


@router.get("", response_model=list[SourceDocumentResponse])
def list_sources(
    auth: Auth, session: Annotated[Session, Depends(get_session)]
) -> list[SourceDocumentResponse]:
    documents = session.scalars(
        select(SourceDocument)
        .where(SourceDocument.organization_id == auth.organization_id)
        .order_by(SourceDocument.observed_at.desc())
    ).all()
    return [_response(document) for document in documents]


@router.post("/{source_id}/extract", response_model=JobResponse, status_code=202)
def extract_source_document(
    source_id: UUID,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=200)],
) -> JobResponse:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Editor role required")
    document = session.scalar(
        select(SourceDocument).where(
            SourceDocument.id == source_id,
            SourceDocument.organization_id == auth.organization_id,
        )
    )
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source not found")
    try:
        queued = enqueue_once(
            session,
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            route=f"POST:/api/v1/sources/{source_id}/extract",
            idempotency_key=idempotency_key,
            event_type="lead.extraction_requested.v1",
            aggregate_type="source",
            aggregate_id=document.id,
            payload_ref=f"source:{document.id}",
        )
    except IdempotencyConflict as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if queued.created:
        document.extraction_status = "queued"
        session.add(
            AuditLog(
                organization_id=auth.organization_id,
                actor_id=auth.user_id,
                action="source_extraction_queued",
                target_type="source_document",
                target_id=document.id,
                reason=f"job={queued.event.event_id}",
                request_id=request.state.request_id,
            )
        )
    session.commit()
    if settings.async_mode == "inline" and queued.event.state != "completed":
        process_event(session, queued.event.event_id)
    elif settings.async_mode == "celery" and queued.created:
        from app.worker import process_outbox_event

        process_outbox_event.delay(str(queued.event.event_id))
    session.refresh(queued.event)
    return job_response(queued.event, created=queued.created)


@router.post("/import-fixture", response_model=SourceDocumentResponse)
def import_fixture(
    payload: FixtureImportRequest,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> SourceDocumentResponse:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Editor role required")
    connector = FixtureConnector()
    try:
        fetched = connector.fetch(payload.fixture_id)
    except (KeyError, OSError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Fixture not found"
        ) from exc
    result = ingest_source(session, auth.organization_id, fetched)
    if result.created:
        session.add(
            AuditLog(
                organization_id=auth.organization_id,
                actor_id=auth.user_id,
                action="source_fixture_imported",
                target_type="source_document",
                target_id=result.document.id,
                reason=result.document.rights_note,
                request_id=request.state.request_id,
            )
        )
    session.commit()
    return _response(result.document, created=result.created)


@router.post("/import-url", response_model=SourceDocumentResponse)
def import_url(
    payload: URLImportRequest,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> SourceDocumentResponse:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Editor role required")
    if settings.discovery_mode != "live":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Manual URL import is disabled in fixture mode",
        )
    connector = ManualHTTPConnector(
        allowed_hosts=settings.allowed_source_hosts,
        max_bytes=settings.source_max_bytes,
    )
    try:
        fetched = connector.fetch_url(payload.url, payload.rights_note)
    except SourcePolicyError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Permitted source could not be fetched",
        ) from exc
    result = ingest_source(session, auth.organization_id, fetched)
    if result.created:
        session.add(
            AuditLog(
                organization_id=auth.organization_id,
                actor_id=auth.user_id,
                action="source_url_imported",
                target_type="source_document",
                target_id=result.document.id,
                reason=result.document.rights_note,
                request_id=request.state.request_id,
            )
        )
    session.commit()
    return _response(result.document, created=result.created)
