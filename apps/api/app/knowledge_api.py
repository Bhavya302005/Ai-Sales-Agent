from datetime import UTC, datetime, timedelta
from typing import Annotated, Any
from uuid import UUID, uuid4

import jwt
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from sqlalchemy import Text, cast, func, select
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.auth import Auth, AuthContext
from app.business_profile import (
    MAX_FILES,
    MAX_TOTAL_BYTES,
    BusinessProfileError,
    ProfileSource,
    analyze_business_profile,
    extract_uploaded_document,
    fetch_company_website,
    make_source,
)
from app.config import Settings, get_settings
from app.db import get_session
from app.knowledge_schemas import (
    ApprovalRequest,
    BusinessProfileAnalysisResponse,
    BusinessProfileConfirm,
    BusinessProfileSource,
    ICPDefinition,
    KnowledgeSearchResponse,
    OfferingResponse,
    OfferingVersionCreate,
    OfferingVersionResponse,
)
from app.persistence.models import AuditLog, ModelRun, Product, ProductVersion
from app.rate_limits import enforce_rate_limit
from app.jobs.service import enqueue_once, process_event

router = APIRouter(prefix="/api/v1/knowledge", tags=["knowledge"])
QUALIFICATION_KEY = "_qualification_questions"
HANDOFF_KEY = "_handoff_conditions"
COMPANY_URL_KEY = "_company_url"
SERVICES_KEY = "_services"
TARGET_CUSTOMERS_KEY = "_target_customers"
PROFILE_SOURCES_KEY = "_profile_sources"
ANALYSIS_METHOD_KEY = "_analysis_method"
WORKFLOW_MODE_KEY = "_workflow_mode"
ANALYSIS_ID_KEY = "_analysis_id"


def _require_editor(auth: AuthContext) -> None:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Editor role required")


def _require_owner(auth: AuthContext) -> None:
    if auth.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner role required")


def _current_product(session: Session, organization_id: UUID, *, lock: bool = False) -> Product:
    statement = (
        select(Product)
        .where(Product.organization_id == organization_id)
        .order_by(Product.created_at, Product.id)
        .limit(1)
    )
    if lock:
        statement = statement.with_for_update()
    product = session.scalar(statement)
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offering not found")
    return product


def _version_response(
    version: ProductVersion, active_version_id: UUID | None
) -> OfferingVersionResponse:
    stored_facts: dict[str, Any] = version.facts
    facts = {
        key: str(value)
        for key, value in stored_facts.items()
        if not key.startswith("_")
    }
    qualification_questions = stored_facts.get(QUALIFICATION_KEY, [])
    handoff_conditions = stored_facts.get(HANDOFF_KEY, [])
    is_active = version.id == active_version_id
    return OfferingVersionResponse(
        id=version.id,
        version=version.version,
        description=version.description,
        icp=ICPDefinition.model_validate(version.icp),
        exclusions=[str(value) for value in version.exclusions],
        facts=facts,
        pricing_policy=version.pricing_policy,
        qualification_questions=[str(value) for value in qualification_questions],
        handoff_conditions=[str(value) for value in handoff_conditions],
        approved_at=version.approved_at,
        approved_by=version.approved_by,
        is_active=is_active,
        is_callable=is_active and version.approved_at is not None,
        created_at=version.created_at,
        company_url=str(stored_facts.get(COMPANY_URL_KEY) or "") or None,
        services=[str(value) for value in stored_facts.get(SERVICES_KEY, [])],
        target_customers=[
            str(value) for value in stored_facts.get(TARGET_CUSTOMERS_KEY, [])
        ],
        analysis_method=(
            str(stored_facts[ANALYSIS_METHOD_KEY])
            if stored_facts.get(ANALYSIS_METHOD_KEY)
            else None
        ),
        profile_source_count=len(stored_facts.get(PROFILE_SOURCES_KEY, [])),
    )


@router.post("/business-profile/analyze", response_model=BusinessProfileAnalysisResponse)
async def analyze_profile(
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    company_name: Annotated[str, Form(min_length=2, max_length=200)],
    company_url: Annotated[str, Form(max_length=2048)] = "",
    business_details: Annotated[str, Form(max_length=8000)] = "",
    services: Annotated[str, Form(max_length=4000)] = "",
    documents: Annotated[list[UploadFile] | None, File()] = None,
) -> BusinessProfileAnalysisResponse:
    _require_editor(auth)
    enforce_rate_limit(
        session,
        identity=str(auth.user_id),
        category="business-profile-analysis",
        limit=5,
    )
    uploads = documents or []
    if len(uploads) > MAX_FILES:
        raise HTTPException(status_code=422, detail="Upload no more than 5 documents")
    if not any((company_url.strip(), business_details.strip(), services.strip(), uploads)):
        raise HTTPException(
            status_code=422,
            detail="Add business details, services, a company URL, or a document",
        )
    source_texts: list[str] = []
    profile_sources: list[ProfileSource] = []
    canonical_url: str | None = None
    if business_details.strip() or services.strip():
        supplied = f"{business_details.strip()}\n{services.strip()}".strip()
        source_texts.append(supplied)
        profile_sources.append(
            make_source("Business details supplied by user", "user_input", supplied)
        )
    website_warning: str | None = None
    try:
        if company_url.strip():
            try:
                canonical_url, website_text = await run_in_threadpool(
                    fetch_company_website, company_url, settings
                )
                source_texts.append(website_text)
                profile_sources.append(
                    make_source(canonical_url or company_url, "website", website_text)
                )
            except BusinessProfileError as web_exc:
                # Website scraping failed (JS-only SPA, frameset, no readable text, etc.)
                # Proceed using the user-supplied business description and services only.
                website_warning = str(web_exc)
        total_bytes = 0
        for upload in uploads:
            content = await upload.read()
            total_bytes += len(content)
            if total_bytes > MAX_TOTAL_BYTES:
                raise BusinessProfileError("Documents must total no more than 5 MB")
            filename = (upload.filename or "document").replace("/", "_").replace("\\", "_")
            document_text = await run_in_threadpool(
                extract_uploaded_document,
                filename,
                upload.content_type or "application/octet-stream",
                content,
            )
            source_texts.append(document_text)
            profile_sources.append(make_source(filename, "document", document_text))
        result = await run_in_threadpool(
            lambda: analyze_business_profile(
                settings=settings,
                company_name=company_name.strip(),
                business_details=business_details,
                services_text=services,
                sources=profile_sources,
                source_texts=source_texts,
            )
        )
    except BusinessProfileError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    product = _current_product(session, auth.organization_id)
    session.add(
        ModelRun(
            organization_id=auth.organization_id,
            purpose="business_profile_analysis",
            prompt_version="business-profile.prompt.v1",
            schema_version="business-profile.v1",
            provider=result.method,
            model=(settings.gemini_dialogue_model if result.method == "gemini" else "rules.v1"),
            latency_ms=result.latency_ms,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            result_status="succeeded" if result.method == "gemini" else "fallback",
            response_hash=result.response_hash,
        )
    )
    session.add(
        AuditLog(
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            action="business_profile_analyzed",
            target_type="product",
            target_id=product.id,
            reason=f"method={result.method}; sources={len(result.sources)}",
            request_id=request.state.request_id,
        )
    )
    session.commit()
    suggestion = result.suggestion
    analysis_id = str(uuid4())
    analysis_token = jwt.encode(
        {
            "sub": str(auth.user_id),
            "organization_id": str(auth.organization_id),
            "purpose": "business_profile_confirmation",
            "analysis_id": analysis_id,
            "company_url": canonical_url,
            "sources": [item.model_dump() for item in result.sources],
            "analysis_method": result.method,
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
            "exp": datetime.now(UTC) + timedelta(hours=1),
        },
        settings.jwt_secret.get_secret_value(),
        algorithm="HS256",
    )
    return BusinessProfileAnalysisResponse(
        company_name=suggestion.company_name,
        company_url=canonical_url,
        description=suggestion.description,
        services=suggestion.services,
        icp=ICPDefinition(
            geographies=suggestion.geographies,
            industries=suggestion.industries,
            needs=suggestion.customer_needs,
        ),
        target_customers=suggestion.target_customers,
        facts=suggestion.facts,
        exclusions=suggestion.exclusions,
        pricing_policy=suggestion.pricing_policy,
        qualification_questions=suggestion.qualification_questions,
        handoff_conditions=suggestion.handoff_conditions,
        sources=[
            BusinessProfileSource.model_validate(item.model_dump()) for item in result.sources
        ],
        analysis_method=result.method,
        warning=website_warning or result.warning,
        analysis_token=analysis_token,
    )


@router.post(
    "/business-profile/confirm", response_model=OfferingVersionResponse, status_code=201
)
def confirm_profile(
    payload: BusinessProfileConfirm,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> OfferingVersionResponse:
    _require_owner(auth)
    try:
        analysis_claims = jwt.decode(
            payload.analysis_token,
            settings.jwt_secret.get_secret_value(),
            algorithms=["HS256"],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
        )
        if (
            analysis_claims.get("sub") != str(auth.user_id)
            or analysis_claims.get("organization_id") != str(auth.organization_id)
            or analysis_claims.get("purpose") != "business_profile_confirmation"
        ):
            raise jwt.InvalidTokenError
        trusted_sources = [
            BusinessProfileSource.model_validate(item)
            for item in analysis_claims.get("sources", [])
        ]
        analysis_method = str(analysis_claims["analysis_method"])
        if analysis_method not in {"gemini", "deterministic"}:
            raise jwt.InvalidTokenError
        company_url = analysis_claims.get("company_url")
        if company_url is not None and not isinstance(company_url, str):
            raise jwt.InvalidTokenError
        analysis_id = str(UUID(str(analysis_claims["analysis_id"])))
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=422,
            detail="Business analysis has expired; analyze again",
        ) from exc
    product = _current_product(session, auth.organization_id, lock=True)
    existing = next(
        (
            version
            for version in session.scalars(
                select(ProductVersion).where(
                    ProductVersion.organization_id == auth.organization_id,
                    ProductVersion.product_id == product.id,
                )
            ).all()
            if version.facts.get(ANALYSIS_ID_KEY) == analysis_id
        ),
        None,
    )
    if existing is not None:
        return _version_response(existing, product.active_version_id)
    latest = session.scalar(
        select(func.max(ProductVersion.version)).where(
            ProductVersion.organization_id == auth.organization_id,
            ProductVersion.product_id == product.id,
        )
    )
    now = datetime.now(UTC)
    version = ProductVersion(
        organization_id=auth.organization_id,
        product_id=product.id,
        version=(latest or 0) + 1,
        description=payload.description.strip(),
        icp=payload.icp.model_dump(),
        exclusions=payload.exclusions,
        facts={
            **payload.facts,
            QUALIFICATION_KEY: payload.qualification_questions,
            HANDOFF_KEY: payload.handoff_conditions,
            COMPANY_URL_KEY: company_url,
            SERVICES_KEY: payload.services,
            TARGET_CUSTOMERS_KEY: payload.target_customers,
            PROFILE_SOURCES_KEY: [source.model_dump() for source in trusted_sources],
            ANALYSIS_METHOD_KEY: analysis_method,
            WORKFLOW_MODE_KEY: payload.workflow_mode,
            ANALYSIS_ID_KEY: analysis_id,
        },
        pricing_policy=payload.pricing_policy.strip(),
        approved_at=now,
        approved_by=auth.user_id,
    )
    session.add(version)
    session.flush()
    product.name = payload.company_name.strip()
    product.active_version_id = version.id
    session.add(
        AuditLog(
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            action="business_profile_confirmed",
            target_type="product_version",
            target_id=version.id,
            reason=(
                f"owner_confirmed; workflow={payload.workflow_mode}; "
                f"sources={len(trusted_sources)}"
            ),
            request_id=request.state.request_id,
        )
    )
    session.commit()
    session.refresh(version)
    # ── Auto-trigger live discovery for the freshly approved product version ──
    # Enqueue idempotently so re-confirming the profile doesn't double-fire.
    try:
        queued = enqueue_once(
            session,
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            route=f"discovery:auto:{version.id}",
            idempotency_key=f"auto-discover-{version.id}",
            event_type="lead.discovery_requested.v1",
            aggregate_type="product_version",
            aggregate_id=version.id,
            payload_ref=f"product_version:{version.id}",
        )
        process_event(session, queued.event.event_id)
    except Exception:  # noqa: BLE001 — discovery is best-effort, never block profile save
        pass
    return _version_response(version, product.active_version_id)


def _offering_response(session: Session, product: Product) -> OfferingResponse:
    versions = session.scalars(
        select(ProductVersion)
        .where(
            ProductVersion.organization_id == product.organization_id,
            ProductVersion.product_id == product.id,
        )
        .order_by(ProductVersion.version.desc())
    ).all()
    return OfferingResponse(
        product_id=product.id,
        product_name=product.name,
        active_version_id=product.active_version_id,
        versions=[_version_response(version, product.active_version_id) for version in versions],
    )


@router.get("/offering", response_model=OfferingResponse)
def get_offering(
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> OfferingResponse:
    return _offering_response(session, _current_product(session, auth.organization_id))


@router.get("/search", response_model=list[KnowledgeSearchResponse])
def search_approved_knowledge(
    q: str,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> list[KnowledgeSearchResponse]:
    query = q.strip()
    if len(query) < 2 or len(query) > 100:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Search query must contain 2 to 100 characters",
        )
    statement = (
        select(Product, ProductVersion)
        .join(
            ProductVersion,
            (ProductVersion.id == Product.active_version_id)
            & (ProductVersion.organization_id == auth.organization_id),
        )
        .where(
            Product.organization_id == auth.organization_id,
            ProductVersion.approved_at.is_not(None),
        )
    )
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        document = func.concat_ws(
            " ", Product.name, ProductVersion.description, cast(ProductVersion.facts, Text)
        )
        statement = statement.where(
            func.to_tsvector("simple", document).op("@@")(
                func.plainto_tsquery("simple", query)
            )
        )
    rows = session.execute(statement.limit(10)).all()
    terms = query.casefold().split()
    results: list[KnowledgeSearchResponse] = []
    for product, version in rows:
        searchable = f"{product.name} {version.description} {version.facts}".casefold()
        if not all(term in searchable for term in terms):
            continue
        facts = {
            key: str(value)
            for key, value in version.facts.items()
            if key not in {QUALIFICATION_KEY, HANDOFF_KEY}
            and any(term in f"{key} {value}".casefold() for term in terms)
        }
        results.append(
            KnowledgeSearchResponse(
                product_id=product.id,
                product_version_id=version.id,
                product_name=product.name,
                description=version.description,
                matched_facts=facts,
            )
        )
    return results


@router.post("/offering/versions", response_model=OfferingVersionResponse, status_code=201)
def create_offering_version(
    payload: OfferingVersionCreate,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> OfferingVersionResponse:
    _require_editor(auth)
    product = _current_product(session, auth.organization_id, lock=True)
    latest = session.scalar(
        select(func.max(ProductVersion.version)).where(
            ProductVersion.organization_id == auth.organization_id,
            ProductVersion.product_id == product.id,
        )
    )
    version = ProductVersion(
        organization_id=auth.organization_id,
        product_id=product.id,
        version=(latest or 0) + 1,
        description=payload.description.strip(),
        icp=payload.icp.model_dump(),
        exclusions=payload.exclusions,
        facts={
            **payload.facts,
            QUALIFICATION_KEY: payload.qualification_questions,
            HANDOFF_KEY: payload.handoff_conditions,
        },
        pricing_policy=payload.pricing_policy.strip(),
        approved_at=None,
        approved_by=None,
    )
    session.add(version)
    session.flush()
    session.add(
        AuditLog(
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            action="product_version_created",
            target_type="product_version",
            target_id=version.id,
            reason="Created immutable offering draft",
            request_id=request.state.request_id,
        )
    )
    session.commit()
    session.refresh(version)
    return _version_response(version, product.active_version_id)


@router.post("/offering/versions/{version_id}/approve", response_model=OfferingVersionResponse)
def approve_offering_version(
    version_id: UUID,
    payload: ApprovalRequest,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> OfferingVersionResponse:
    _require_owner(auth)
    product = _current_product(session, auth.organization_id, lock=True)
    version = session.scalar(
        select(ProductVersion).where(
            ProductVersion.id == version_id,
            ProductVersion.product_id == product.id,
            ProductVersion.organization_id == auth.organization_id,
        )
    )
    if version is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Offering version not found"
        )
    action = "product_version_activated" if version.approved_at else "product_version_approved"
    if version.approved_at is None:
        version.approved_at = datetime.now(UTC)
        version.approved_by = auth.user_id
    product.active_version_id = version.id
    session.add(
        AuditLog(
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            action=action,
            target_type="product_version",
            target_id=version.id,
            reason=payload.reason.strip(),
            request_id=request.state.request_id,
        )
    )
    session.commit()
    session.refresh(version)
    return _version_response(version, product.active_version_id)
