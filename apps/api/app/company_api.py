from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import Auth
from app.db import get_session
from app.entity_resolution.service import merge_companies, reverse_company_merge
from app.persistence.models import Company

router = APIRouter(prefix="/api/v1/companies", tags=["companies"])


class CompanyResponse(BaseModel):
    id: UUID
    normalized_name: str
    normalized_domain: str | None
    location: str | None
    merge_status: str
    merged_into_id: UUID | None


class MergeRequest(BaseModel):
    source_id: UUID
    target_id: UUID
    reason: str = Field(min_length=10, max_length=500)


class ReverseMergeRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=500)


class MergeResponse(BaseModel):
    audit_id: UUID
    action: str
    occurred_at: datetime


def _company_response(company: Company) -> CompanyResponse:
    return CompanyResponse(
        id=company.id,
        normalized_name=company.normalized_name,
        normalized_domain=company.normalized_domain,
        location=company.location,
        merge_status=company.merge_status,
        merged_into_id=company.merged_into_id,
    )


@router.get("", response_model=list[CompanyResponse])
def list_companies(
    auth: Auth, session: Annotated[Session, Depends(get_session)]
) -> list[CompanyResponse]:
    companies = session.scalars(
        select(Company)
        .where(Company.organization_id == auth.organization_id)
        .order_by(Company.normalized_name, Company.created_at)
    ).all()
    return [_company_response(company) for company in companies]


@router.post("/merge", response_model=MergeResponse)
def merge_company_records(
    payload: MergeRequest,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> MergeResponse:
    if auth.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner role required")
    try:
        audit = merge_companies(
            session,
            organization_id=auth.organization_id,
            source_id=payload.source_id,
            target_id=payload.target_id,
            actor_id=auth.user_id,
            reason=payload.reason,
            request_id=request.state.request_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    session.commit()
    return MergeResponse(audit_id=audit.id, action=audit.action, occurred_at=audit.occurred_at)


@router.post("/merges/{merge_audit_id}/reverse", response_model=MergeResponse)
def reverse_company_merge_record(
    merge_audit_id: UUID,
    payload: ReverseMergeRequest,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> MergeResponse:
    if auth.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner role required")
    try:
        audit = reverse_company_merge(
            session,
            organization_id=auth.organization_id,
            merge_audit_id=merge_audit_id,
            actor_id=auth.user_id,
            reason=payload.reason,
            request_id=request.state.request_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except (KeyError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    session.commit()
    return MergeResponse(audit_id=audit.id, action=audit.action, occurred_at=audit.occurred_at)
