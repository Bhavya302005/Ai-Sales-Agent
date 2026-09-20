from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import Auth
from app.db import get_session
from app.persistence.models import Membership, Notification

router = APIRouter(prefix="/api/v1/notifications", tags=["notifications"])


class NotificationResponse(BaseModel):
    id: UUID
    notification_type: str
    severity: str
    title: str
    summary: str
    action_url: str | None
    read_at: datetime | None
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    unread_count: int


def notify_roles(
    session: Session,
    *,
    organization_id: UUID,
    notification_type: str,
    severity: Literal["info", "success", "warning", "error"],
    title: str,
    summary: str,
    action_url: str | None,
    dedupe_key: str,
    roles: tuple[str, ...] = ("owner", "operator"),
) -> int:
    recipients = session.scalars(
        select(Membership).where(
            Membership.organization_id == organization_id,
            Membership.status == "active",
            Membership.role.in_(roles),
        )
    ).all()
    created = 0
    for membership in recipients:
        exists = session.scalar(
            select(Notification.id).where(
                Notification.organization_id == organization_id,
                Notification.recipient_user_id == membership.user_id,
                Notification.dedupe_key == dedupe_key,
            )
        )
        if exists:
            continue
        session.add(
            Notification(
                organization_id=organization_id,
                recipient_user_id=membership.user_id,
                notification_type=notification_type[:80],
                severity=severity,
                title=title[:160],
                summary=summary[:500],
                action_url=action_url[:500] if action_url else None,
                dedupe_key=dedupe_key[:200],
                read_at=None,
            )
        )
        created += 1
    return created


def _response(item: Notification) -> NotificationResponse:
    return NotificationResponse(
        id=item.id,
        notification_type=item.notification_type,
        severity=item.severity,
        title=item.title,
        summary=item.summary,
        action_url=item.action_url,
        read_at=item.read_at,
        created_at=item.created_at,
    )


@router.get("", response_model=NotificationListResponse)
def list_notifications(
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    unread_only: bool = False,
    severity: Annotated[str | None, Query(pattern="^(info|success|warning|error)$")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
) -> NotificationListResponse:
    base = select(Notification).where(
        Notification.organization_id == auth.organization_id,
        Notification.recipient_user_id == auth.user_id,
    )
    unread_statement = base.where(Notification.read_at.is_(None))
    unread_count = len(session.scalars(unread_statement).all())
    if unread_only:
        base = unread_statement
    if severity:
        base = base.where(Notification.severity == severity)
    items = session.scalars(base.order_by(Notification.created_at.desc()).limit(limit)).all()
    return NotificationListResponse(
        items=[_response(item) for item in items], unread_count=unread_count
    )


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: UUID,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> NotificationResponse:
    item = session.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.organization_id == auth.organization_id,
            Notification.recipient_user_id == auth.user_id,
        )
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    item.read_at = item.read_at or datetime.now(UTC)
    session.commit()
    return _response(item)


@router.post("/read-all", status_code=204)
def mark_all_notifications_read(
    auth: Auth, session: Annotated[Session, Depends(get_session)]
) -> None:
    now = datetime.now(UTC)
    items = session.scalars(
        select(Notification).where(
            Notification.organization_id == auth.organization_id,
            Notification.recipient_user_id == auth.user_id,
            Notification.read_at.is_(None),
        )
    ).all()
    for item in items:
        item.read_at = now
    session.commit()
