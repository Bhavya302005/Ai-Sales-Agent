from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import Auth
from app.db import get_session
from app.persistence.models import OutboxEvent

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


class JobResponse(BaseModel):
    event_id: UUID
    event_type: str
    aggregate_type: str
    aggregate_id: UUID
    state: str
    attempts: int
    next_attempt_at: datetime | None
    last_error_code: str | None
    status_url: str
    created: bool | None = None


def job_response(event: OutboxEvent, *, created: bool | None = None) -> JobResponse:
    return JobResponse(
        event_id=event.event_id,
        event_type=event.event_type,
        aggregate_type=event.aggregate_type,
        aggregate_id=event.aggregate_id,
        state=event.state,
        attempts=event.attempts,
        next_attempt_at=event.next_attempt_at,
        last_error_code=event.last_error_code,
        status_url=f"/api/v1/jobs/{event.event_id}",
        created=created,
    )


@router.get("/{event_id}", response_model=JobResponse)
def get_job(
    event_id: UUID,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> JobResponse:
    event = session.scalar(
        select(OutboxEvent).where(
            OutboxEvent.event_id == event_id,
            OutboxEvent.organization_id == auth.organization_id,
        )
    )
    if event is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job_response(event)
