from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import Auth
from app.config import Settings, get_settings
from app.db import get_session
from app.persistence.models import AuditLog, Membership, OrganizationControl
from app.rate_limits import enforce_rate_limit

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _require_owner(auth: Auth) -> None:
    if auth.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Owner role required")


class MemberResponse(BaseModel):
    id: UUID
    user_id: UUID
    role: str
    status: str


class MemberUpdate(BaseModel):
    role: Literal["owner", "operator", "viewer"] | None = None
    status: Literal["active", "inactive"] | None = None


class AuditResponse(BaseModel):
    id: UUID
    actor_id: UUID | None
    action: str
    target_type: str
    target_id: UUID
    reason: str | None
    request_id: str
    occurred_at: datetime


class ProviderHealthResponse(BaseModel):
    providers: dict[str, str]


class RuntimeControlResponse(BaseModel):
    calls_paused: bool
    environment_kill_switch: bool
    effective_calls_paused: bool


class RuntimeControlUpdate(BaseModel):
    calls_paused: bool


def _control(session: Session, organization_id: UUID) -> OrganizationControl:
    row = session.scalar(
        select(OrganizationControl).where(OrganizationControl.organization_id == organization_id)
    )
    if row is None:
        row = OrganizationControl(organization_id=organization_id, calls_paused=False)
        session.add(row)
        session.flush()
    return row


@router.get("/members", response_model=list[MemberResponse])
def list_members(
    auth: Auth, session: Annotated[Session, Depends(get_session)]
) -> list[MemberResponse]:
    _require_owner(auth)
    rows = session.scalars(
        select(Membership)
        .where(Membership.organization_id == auth.organization_id)
        .order_by(Membership.created_at)
    ).all()
    return [
        MemberResponse(id=row.id, user_id=row.user_id, role=row.role, status=row.status)
        for row in rows
    ]


@router.patch("/members/{membership_id}", response_model=MemberResponse)
def update_member(
    membership_id: UUID,
    payload: MemberUpdate,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> MemberResponse:
    _require_owner(auth)
    enforce_rate_limit(
        session, identity=f"{auth.organization_id}:{auth.user_id}", category="admin-write", limit=20
    )
    member = session.scalar(
        select(Membership).where(
            Membership.id == membership_id,
            Membership.organization_id == auth.organization_id,
        )
    )
    if member is None:
        raise HTTPException(status_code=404, detail="Membership not found")
    next_role = payload.role or member.role
    next_status = payload.status or member.status
    if member.role == "owner" and member.status == "active" and (
        next_role != "owner" or next_status != "active"
    ):
        active_owners = session.scalar(
            select(func.count())
            .select_from(Membership)
            .where(
                Membership.organization_id == auth.organization_id,
                Membership.role == "owner",
                Membership.status == "active",
            )
        ) or 0
        if active_owners <= 1:
            raise HTTPException(status_code=409, detail="The final active owner cannot be changed")
    member.role = next_role
    member.status = next_status
    session.add(
        AuditLog(
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            action="membership_updated",
            target_type="membership",
            target_id=member.id,
            reason=f"role={next_role};status={next_status}",
            request_id=request.state.request_id,
        )
    )
    session.commit()
    return MemberResponse(
        id=member.id, user_id=member.user_id, role=member.role, status=member.status
    )


@router.get("/audit-logs", response_model=list[AuditResponse])
def list_audit_logs(
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    action: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0, le=10_000)] = 0,
) -> list[AuditResponse]:
    _require_owner(auth)
    statement = select(AuditLog).where(AuditLog.organization_id == auth.organization_id)
    if action:
        statement = statement.where(AuditLog.action == action[:100])
    rows = session.scalars(
        statement.order_by(AuditLog.occurred_at.desc()).offset(offset).limit(limit)
    ).all()
    return [
        AuditResponse(
            id=row.id,
            actor_id=row.actor_id,
            action=row.action,
            target_type=row.target_type,
            target_id=row.target_id,
            reason=row.reason,
            request_id=row.request_id,
            occurred_at=row.occurred_at,
        )
        for row in rows
    ]


@router.get("/provider-health", response_model=ProviderHealthResponse)
def provider_health(
    auth: Auth, settings: Annotated[Settings, Depends(get_settings)]
) -> ProviderHealthResponse:
    _require_owner(auth)
    twilio_ready = all(
        [
            settings.twilio_account_sid,
            settings.twilio_auth_token,
            settings.twilio_from_number,
            settings.public_voice_base_url,
        ]
    )
    return ProviderHealthResponse(
        providers={
            "browser_voice": "ready",
            "twilio": "configured" if twilio_ready else "credentials_required",
            "omnidim": (
                "configured_unverified"
                if settings.omnidim_api_key
                and settings.omnidim_agent_id
                and settings.omnidim_test_to_number
                else "credentials_required"
            ),
            "sarvam": (
                "configured_unverified" if settings.sarvam_api_key else "credentials_required"
            ),
            "hubspot": (
                "configured_unverified"
                if settings.hubspot_access_token
                else "credentials_required"
            ),
            "crm_fallback": "ready" if settings.crm_mode == "mock" else "disabled",
        }
    )


@router.get("/runtime-controls", response_model=RuntimeControlResponse)
def get_runtime_controls(
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> RuntimeControlResponse:
    _require_owner(auth)
    row = _control(session, auth.organization_id)
    session.commit()
    return RuntimeControlResponse(
        calls_paused=row.calls_paused,
        environment_kill_switch=settings.calls_kill_switch,
        effective_calls_paused=row.calls_paused or settings.calls_kill_switch,
    )


@router.patch("/runtime-controls", response_model=RuntimeControlResponse)
def update_runtime_controls(
    payload: RuntimeControlUpdate,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> RuntimeControlResponse:
    _require_owner(auth)
    enforce_rate_limit(
        session, identity=f"{auth.organization_id}:{auth.user_id}", category="admin-write", limit=20
    )
    row = _control(session, auth.organization_id)
    row.calls_paused = payload.calls_paused
    row.updated_by = auth.user_id
    session.add(
        AuditLog(
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            action="runtime_controls_updated",
            target_type="organization_control",
            target_id=row.id,
            reason=f"calls_paused={payload.calls_paused}",
            request_id=request.state.request_id,
        )
    )
    session.commit()
    return RuntimeControlResponse(
        calls_paused=row.calls_paused,
        environment_kill_switch=settings.calls_kill_switch,
        effective_calls_paused=row.calls_paused or settings.calls_kill_switch,
    )
