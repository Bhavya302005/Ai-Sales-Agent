import threading
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.auth import Auth
from app.config import Settings, get_settings
from app.db import get_engine, get_session
from app.discovery.ingestion import ingest_source
from app.discovery.phone_enricher import enrich_contact
from app.discovery.service import DiscoveryItem, discover_with_exa, load_demo_snapshot
from app.jobs.service import enqueue_once, process_event
from app.persistence.models import AuditLog, Product, ProductVersion, SourceDocument

router = APIRouter(prefix="/api/v1/discovery", tags=["discovery"])


class DiscoveryResult(BaseModel):
    id: UUID
    title: str
    company: str | None
    location: str | None
    published_at: datetime | None
    observed_at: datetime
    original_url: str
    source: str
    opportunity_type: str
    evidence_excerpt: str
    rights_note: str
    provider_metadata: dict[str, object]
    actionable: bool
    extraction_status: str
    # ── Contact enrichment fields (populated asynchronously) ──
    best_phone: str | None = None
    best_email: str | None = None
    contact_phones: list[str] = []
    contact_emails: list[str] = []


class DiscoveryImportResponse(BaseModel):
    provider: str
    provider_status: str
    received: int
    created: int
    duplicates: int
    results: list[DiscoveryResult]


class DiscoveryStatusResponse(BaseModel):
    live_refresh_available: bool
    provider: str
    label: str


def _require_editor(auth: Auth) -> None:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Editor role required")


def _result(document: SourceDocument) -> DiscoveryResult:
    meta = document.provider_metadata or {}
    return DiscoveryResult(
        id=document.id,
        title=document.discovery_title or "Untitled public opportunity",
        company=document.discovery_company,
        location=document.discovery_location,
        published_at=document.published_at,
        observed_at=document.observed_at,
        original_url=document.canonical_url,
        source=document.source_type,
        opportunity_type=document.opportunity_type or "weak_signal",
        evidence_excerpt=document.evidence_excerpt,
        rights_note=document.rights_note,
        provider_metadata=meta,
        actionable=document.discovery_actionable is True,
        extraction_status=document.extraction_status,
        best_phone=meta.get("best_phone") or None,
        best_email=meta.get("best_email") or None,
        contact_phones=meta.get("phones") or [],
        contact_emails=meta.get("emails") or [],
    )


def _active_product_version(session: Session, organization_id: UUID) -> ProductVersion:
    version = session.scalar(
        select(ProductVersion)
        .join(Product, Product.id == ProductVersion.product_id)
        .where(
            ProductVersion.organization_id == organization_id,
            Product.active_version_id == ProductVersion.id,
            ProductVersion.approved_at.is_not(None),
        )
        .order_by(ProductVersion.approved_at.desc())
        .limit(1)
    )
    if version is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Approve a product version before running discovery",
        )
    return version



def _spawn_phone_enrichment(item: DiscoveryItem, document_id: UUID) -> None:
    """Kick off background phone/email enrichment in a daemon thread.

    Opens its own SQLAlchemy Session so it doesn't share the request-scoped
    session, and therefore never blocks the HTTP response.
    """

    def _run() -> None:
        try:
            contact_data = enrich_contact(item)
            # Write-back: open a fresh session, merge into provider_metadata
            from sqlalchemy.orm import Session as _Session  # local import avoids cycles
            engine = get_engine()
            with _Session(engine) as sess:
                doc = sess.get(SourceDocument, document_id)
                if doc is not None:
                    existing = dict(doc.provider_metadata or {})
                    existing.update(contact_data)
                    doc.provider_metadata = existing
                    sess.commit()
        except Exception:  # noqa: BLE001 — enrichment is best-effort
            pass

    t = threading.Thread(target=_run, daemon=True)
    t.start()


def _ingest_and_extract(
    session: Session,
    *,
    auth: Auth,
    request: Request,
    items: list[DiscoveryItem],
    provider: str,
) -> DiscoveryImportResponse:
    documents: list[SourceDocument] = []
    created = 0
    for item in items:
        ingestion = ingest_source(session, auth.organization_id, item.fetched_source())
        documents.append(ingestion.document)
        if not ingestion.created:
            continue
        created += 1
        queued = enqueue_once(
            session,
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            route=f"discovery:{provider}:{ingestion.document.id}",
            idempotency_key=f"discover-{ingestion.document.id}",
            event_type="lead.extraction_requested.v1",
            aggregate_type="source",
            aggregate_id=ingestion.document.id,
            payload_ref=f"source:{ingestion.document.id}",
        )
        ingestion.document.extraction_status = "queued"
        session.add(
            AuditLog(
                organization_id=auth.organization_id,
                actor_id=auth.user_id,
                action="discovery_result_imported",
                target_type="source_document",
                target_id=ingestion.document.id,
                reason=f"provider={provider}; job={queued.event.event_id}",
                request_id=request.state.request_id,
            )
        )
        session.flush()
        process_event(session, queued.event.event_id)
        # ── Async phone/email enrichment (non-blocking) ──────────────────
        # Runs in a daemon thread so the HTTP response is never delayed.
        # On completion it opens its own DB session to write back.
        _spawn_phone_enrichment(item, ingestion.document.id)
    session.commit()
    for document in documents:
        session.refresh(document)
    return DiscoveryImportResponse(
        provider=provider,
        provider_status="verified_snapshot" if provider == "saved_snapshot" else "live",
        received=len(items),
        created=created,
        duplicates=len(items) - created,
        results=[_result(document) for document in documents],
    )


@router.post("/import-demo", response_model=DiscoveryImportResponse)
def import_demo(
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> DiscoveryImportResponse:
    _require_editor(auth)
    return _ingest_and_extract(
        session,
        auth=auth,
        request=request,
        items=load_demo_snapshot(),
        provider="saved_snapshot",
    )


@router.post("/refresh", response_model=DiscoveryImportResponse)
def refresh_discovery(
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> DiscoveryImportResponse:
    _require_editor(auth)
    if settings.exa_discovery_mode != "mcp":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Live Exa refresh is disabled; verified snapshot results remain available",
        )
    product_version = _active_product_version(session, auth.organization_id)
    try:
        items = discover_with_exa(
            product_version,
            timeout_seconds=settings.exa_discovery_timeout_seconds,
        )
    except (OSError, RuntimeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=("Live Exa refresh failed; existing verified snapshot results were retained"),
        ) from exc
    return _ingest_and_extract(session, auth=auth, request=request, items=items, provider="exa_mcp")


@router.get("/results", response_model=list[DiscoveryResult])
def list_discovery_results(
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    opportunity_type: Annotated[str | None, Query(alias="type")] = None,
    source: str | None = None,
    q: str | None = None,
    actionable: bool | None = None,
) -> list[DiscoveryResult]:
    statement = select(SourceDocument).where(
        SourceDocument.organization_id == auth.organization_id,
        SourceDocument.opportunity_type.is_not(None),
    )
    if opportunity_type:
        statement = statement.where(SourceDocument.opportunity_type == opportunity_type)
    if source:
        statement = statement.where(SourceDocument.source_type == source)
    if actionable is not None:
        statement = statement.where(SourceDocument.discovery_actionable == actionable)
    if q:
        search = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                SourceDocument.discovery_title.ilike(search),
                SourceDocument.discovery_company.ilike(search),
                SourceDocument.evidence_excerpt.ilike(search),
            )
        )
    documents = session.scalars(
        statement.order_by(
            SourceDocument.published_at.desc().nullslast(),
            SourceDocument.observed_at.desc(),
        )
    ).all()
    return [_result(document) for document in documents]


@router.get("/status", response_model=DiscoveryStatusResponse)
def discovery_status(
    auth: Auth,
    settings: Annotated[Settings, Depends(get_settings)],
) -> DiscoveryStatusResponse:
    del auth
    available = settings.exa_discovery_mode == "mcp"
    return DiscoveryStatusResponse(
        live_refresh_available=available,
        provider="exa" if available else "not_configured",
        label="Live discovery connected" if available else "Connect a discovery provider",
    )
