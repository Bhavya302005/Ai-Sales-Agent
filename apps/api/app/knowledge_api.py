from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import Text, cast, func, select
from sqlalchemy.orm import Session

from app.auth import Auth, AuthContext
from app.db import get_session
from app.knowledge_schemas import (
    ApprovalRequest,
    ICPDefinition,
    KnowledgeSearchResponse,
    OfferingResponse,
    OfferingVersionCreate,
    OfferingVersionResponse,
)
from app.persistence.models import AuditLog, Product, ProductVersion

router = APIRouter(prefix="/api/v1/knowledge", tags=["knowledge"])
QUALIFICATION_KEY = "_qualification_questions"
HANDOFF_KEY = "_handoff_conditions"


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
        if key not in {QUALIFICATION_KEY, HANDOFF_KEY}
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
    )


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
