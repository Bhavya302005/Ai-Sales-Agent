from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import Auth
from app.config import Settings, get_settings
from app.db import get_session
from app.jobs.api import JobResponse, job_response
from app.jobs.service import IdempotencyConflict, enqueue_once, process_event
from app.persistence.models import AuditLog, HandoffTask

router = APIRouter(prefix="/api/v1", tags=["crm"])


class CrmStatusResponse(BaseModel):
    mode: str
    configured: bool
    label: str


@router.get("/integrations/crm", response_model=CrmStatusResponse)
def crm_status(
    auth: Auth,
    settings: Annotated[Settings, Depends(get_settings)],
) -> CrmStatusResponse:
    _ = auth
    configured = settings.crm_mode == "mock" or bool(settings.hubspot_access_token)
    return CrmStatusResponse(
        mode=settings.crm_mode,
        configured=configured,
        label=(
            "Mock CRM · deterministic local verification"
            if settings.crm_mode == "mock"
            else f"HubSpot · pinned API {settings.hubspot_api_version}"
        ),
    )


@router.post("/handoffs/{handoff_id}/sync-crm", response_model=JobResponse, status_code=202)
def request_crm_sync(
    handoff_id: UUID,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=200)],
) -> JobResponse:
    if auth.role not in {"owner", "operator"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Editor role required")
    handoff = session.scalar(
        select(HandoffTask).where(
            HandoffTask.id == handoff_id,
            HandoffTask.organization_id == auth.organization_id,
        )
    )
    if handoff is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Handoff not found")
    try:
        queued = enqueue_once(
            session,
            organization_id=auth.organization_id,
            actor_id=auth.user_id,
            route=f"POST:/api/v1/handoffs/{handoff.id}/sync-crm",
            idempotency_key=idempotency_key,
            event_type="crm.sync_requested.v1",
            aggregate_type="handoff_task",
            aggregate_id=handoff.id,
            payload_ref=f"handoff:{handoff.id}",
        )
    except IdempotencyConflict as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    if queued.created:
        session.add(
            AuditLog(
                organization_id=auth.organization_id,
                actor_id=auth.user_id,
                action="crm_sync_queued",
                target_type="handoff_task",
                target_id=handoff.id,
                reason=f"provider={settings.crm_mode};job={queued.event.event_id}",
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
