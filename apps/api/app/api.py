import logging
import re
from datetime import timedelta
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.account_auth import hash_password, verify_password
from app.auth import Auth, create_access_token
from app.config import Settings, get_settings
from app.db import get_session
from app.demo_ids import ORGANIZATION_ID, USER_ID
from app.persistence.models import Membership, Organization, Product, UserAccount, Workspace
from app.rate_limits import enforce_rate_limit

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1")


class DevSessionResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class CredentialRequest(BaseModel):
    email: str
    password: str


def _normalized_credentials(payload: CredentialRequest) -> tuple[str, str]:
    email = payload.email.strip().casefold()
    password = payload.password
    if len(email) > 320 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Enter a valid email address",
        )
    if not 8 <= len(password) <= 128:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must contain 8 to 128 characters",
        )
    return email, password


def _token(user_id: UUID, organization_id: UUID, settings: Settings) -> DevSessionResponse:
    return DevSessionResponse(
        access_token=create_access_token(
            user_id=user_id,
            organization_id=organization_id,
            settings=settings,
            lifetime=timedelta(hours=8),
        )
    )


def _limit_auth_request(request: Request, session: Session, category: str) -> None:
    identity = request.client.host if request.client else "unknown"
    enforce_rate_limit(session, identity=identity, category=category, limit=10)


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


@router.post("/auth/signup", response_model=DevSessionResponse, status_code=status.HTTP_201_CREATED)
def create_account(
    payload: CredentialRequest,
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
) -> DevSessionResponse:
    email, password = _normalized_credentials(payload)
    _limit_auth_request(request, session, "account-signup")
    existing_account = session.scalar(select(UserAccount).where(UserAccount.email == email))
    if existing_account is not None:
        existing_membership = session.scalar(
            select(Membership).where(
                Membership.user_id == existing_account.id,
                Membership.status == "active",
            )
        )
        if (
            existing_membership is not None
            and verify_password(password, existing_account.password_hash)
        ):
            session.commit()
            return _token(existing_account.id, existing_membership.organization_id, settings)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Account already exists")

    user_id = uuid4()
    organization_id = uuid4()
    workspace_id = uuid4()
    session.add_all(
        [
            UserAccount(id=user_id, email=email, password_hash=hash_password(password)),
            Organization(id=organization_id, name="My Organization"),
            Workspace(
                id=workspace_id,
                organization_id=organization_id,
                name="My Sales Workspace",
                locale="en-IN",
                timezone="Asia/Kolkata",
            ),
            Membership(
                organization_id=organization_id,
                user_id=user_id,
                role="owner",
                status="active",
            ),
            Product(
                organization_id=organization_id,
                workspace_id=workspace_id,
                name="Your business",
                active_version_id=None,
            ),
        ]
    )
    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        # A serverless action or client retry can race after both requests have
        # observed that the email is free. Recover the account created by the
        # winning request when the credentials match instead of returning a
        # false conflict to the user.
        raced_account = session.scalar(select(UserAccount).where(UserAccount.email == email))
        if raced_account is not None and verify_password(password, raced_account.password_hash):
            raced_membership = session.scalar(
                select(Membership).where(
                    Membership.user_id == raced_account.id,
                    Membership.status == "active",
                )
            )
            if raced_membership is not None:
                return _token(raced_account.id, raced_membership.organization_id, settings)
        logger.exception("Account creation failed because of a database integrity constraint")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Account workspace could not be created",
        ) from exc
    return _token(user_id, organization_id, settings)


@router.post("/auth/login", response_model=DevSessionResponse)
def create_account_session(
    payload: CredentialRequest,
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[Session, Depends(get_session)],
) -> DevSessionResponse:
    email, password = _normalized_credentials(payload)
    _limit_auth_request(request, session, "account-login")
    account = session.scalar(select(UserAccount).where(UserAccount.email == email))
    if account is None or not verify_password(password, account.password_hash):
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )
    membership = session.scalar(
        select(Membership).where(
            Membership.user_id == account.id,
            Membership.status == "active",
        )
    )
    if membership is None:
        session.commit()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Active membership required"
        )
    session.commit()
    return _token(account.id, membership.organization_id, settings)


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
