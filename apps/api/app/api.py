import logging
from datetime import timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import Auth, create_access_token
from app.config import Settings, get_settings
from app.db import get_session
from app.demo_ids import ORGANIZATION_ID, USER_ID
from app.persistence.models import Workspace
from app.rate_limits import enforce_rate_limit

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1")


class DevSessionResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    user_id: UUID
    organization_id: UUID
    role: str


class WorkspaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    organization_id: UUID
    name: str
    locale: str
    timezone: str


@router.post("/auth/dev-session", response_model=DevSessionResponse)
def create_dev_session(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
) -> DevSessionResponse:
    try:
        enforce_rate_limit(
            session,
            identity=request.client.host if request.client else "unknown",
            category="dev-session",
            limit=30,
        )
        session.commit()
    except HTTPException:
        raise
    except Exception as exc:
        session.rollback()
        logger.warning("Rate limiting skipped due to database error: %s", exc)

    token = create_access_token(
        user_id=USER_ID,
        organization_id=ORGANIZATION_ID,
        settings=settings,
        lifetime=timedelta(hours=8),
    )
    return DevSessionResponse(access_token=token)


@router.get("/me", response_model=MeResponse)
def me(auth: Auth) -> MeResponse:
    return MeResponse(
        user_id=auth.user_id,
        organization_id=auth.organization_id,
        role=auth.role,
    )


@router.get("/workspaces/current", response_model=WorkspaceResponse)
def current_workspace(
    auth: Auth, session: Annotated[Session, Depends(get_session)]
) -> WorkspaceResponse:
    workspace = session.scalar(
        select(Workspace).where(Workspace.organization_id == auth.organization_id).limit(1)
    )
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return WorkspaceResponse.model_validate(workspace)
