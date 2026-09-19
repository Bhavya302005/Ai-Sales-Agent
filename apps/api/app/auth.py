from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal, cast
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_session
from app.persistence.models import Membership

Role = Literal["owner", "operator", "viewer"]
bearer = HTTPBearer(auto_error=False)


class AuthContext(BaseModel):
    model_config = ConfigDict(frozen=True)

    user_id: UUID
    organization_id: UUID
    membership_id: UUID
    role: Role


def create_access_token(
    *, user_id: UUID, organization_id: UUID, settings: Settings, lifetime: timedelta
) -> str:
    now = datetime.now(UTC)
    return jwt.encode(
        {
            "sub": str(user_id),
            "org": str(organization_id),
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
            "iat": now,
            "nbf": now,
            "exp": now + lifetime,
        },
        settings.jwt_secret.get_secret_value(),
        algorithm="HS256",
    )


def authenticate_access_token(token: str, settings: Settings, session: Session) -> AuthContext:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=["HS256"],
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["sub", "org", "iat", "nbf", "exp"]},
        )
        user_id, organization_id = UUID(payload["sub"]), UUID(payload["org"])
    except (jwt.PyJWTError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication token"
        ) from exc
    membership = session.scalar(
        select(Membership).where(
            Membership.user_id == user_id,
            Membership.organization_id == organization_id,
            Membership.status == "active",
        )
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Active membership required"
        )
    if membership.role not in {"owner", "operator", "viewer"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid membership role")
    return AuthContext(
        user_id=user_id,
        organization_id=membership.organization_id,
        membership_id=membership.id,
        role=cast(Role, membership.role),
    )


def require_auth(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthContext:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required"
        )
    return authenticate_access_token(credentials.credentials, settings, session)


Auth = Annotated[AuthContext, Depends(require_auth)]
