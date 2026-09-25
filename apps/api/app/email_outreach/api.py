"""
FastAPI router for email outreach.
Prefix: /api/v1/email-outreach
All endpoints require authentication except the tracking pixel GET.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import Auth
from app.config import get_settings
from app.db import get_session
from app.email_outreach.models import EmailEvent, EmailOutreachDraft
from app.email_outreach.schemas import (
    DraftApproveRequest,
    DraftGenerateRequest,
    DraftListResponse,
    DraftResponse,
    DraftSendRequest,
    EmailOutreachStatus,
)
from app.email_outreach.sender import (
    EmailNotConfiguredError,
    EmailSendError,
    inject_tracking_pixel,
    send_email,
)
from app.email_outreach.service import DraftGenerationError, generate_draft
from app.persistence.models import Suppression
from app.repositories.leads import LeadRepository

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/email-outreach", tags=["email-outreach"])

# Bot / preview scanner user-agents to ignore for open tracking
_BOT_UA_FRAGMENTS = [
    "googleimageproxy", "google-producer", "ggpht",
    "microsoft office", "outlook", "thunderbird",
    "wget", "curl", "bot", "spider", "crawler", "scan", "preview",
    "facebookexternalhit", "slackbot", "whatsapp", "telegrambot",
]

# 1x1 transparent GIF
_TRANSPARENT_GIF = bytes([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00,
    0x01, 0x00, 0x00, 0xFF, 0x00, 0x2C, 0x00, 0x00,
    0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02,
    0x00, 0x3B,
])


def _pixel_response() -> Response:
    return Response(
        content=_TRANSPARENT_GIF,
        media_type="image/gif",
        headers={"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"},
    )


def _is_bot(ua: str) -> bool:
    lower = ua.lower()
    return any(f in lower for f in _BOT_UA_FRAGMENTS)


def _hash_ip(ip: str) -> str:
    return hashlib.sha256(ip.encode()).hexdigest()


def _draft_to_response(draft: EmailOutreachDraft, opens_count: int = 0) -> DraftResponse:
    return DraftResponse(
        id=draft.id,
        campaign_id=draft.campaign_id,
        lead_id=draft.lead_id,
        recipient_email=draft.recipient_email,
        subject=draft.subject,
        body_html=draft.body_html,
        status=draft.status,
        approved_by=draft.approved_by,
        approved_at=draft.approved_at,
        sent_at=draft.sent_at,
        opens_count=opens_count,
        created_at=draft.created_at,
    )


# ---------------------------------------------------------------------------
# GET /status — check if email outreach is configured
# ---------------------------------------------------------------------------

@router.get("/status", response_model=EmailOutreachStatus)
def get_status(
    auth: Auth,
    settings: Settings = Depends(get_settings),
) -> EmailOutreachStatus:
    return EmailOutreachStatus(
        enabled=settings.email_outreach_mode != "disabled",
        mode=settings.email_outreach_mode,
        from_address=settings.email_from_address,
        from_name=settings.email_from_name,
    )


# ---------------------------------------------------------------------------
# POST /drafts — generate AI draft for a lead
# ---------------------------------------------------------------------------

@router.post("/drafts", response_model=DraftResponse, status_code=status.HTTP_201_CREATED)
async def generate_email_draft(
    body: DraftGenerateRequest,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> DraftResponse:
    if not body.consent_attested:
        raise HTTPException(status_code=422, detail="Consent must be attested before generating outreach email")

    # Check email suppression first
    identifier_hash = hashlib.sha256(body.recipient_email.lower().encode()).hexdigest()
    suppressed = session.execute(
        select(Suppression).where(
            Suppression.organization_id == auth.organization_id,
            Suppression.channel == "email",
            Suppression.identifier_hash == identifier_hash,
        )
    ).scalar_one_or_none()
    if suppressed:
        raise HTTPException(status_code=422, detail="This email address is suppressed — contact cannot receive emails")

    # Validate lead belongs to org
    lead_repo = LeadRepository(session, auth.organization_id)
    record = lead_repo.get(body.lead_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Generate AI draft
    try:
        draft_content = await generate_draft(record, session=session)
    except DraftGenerationError as exc:
        logger.warning("Draft generation failed for lead=%s: %s", body.lead_id, exc)
        raise HTTPException(status_code=502, detail=f"Draft generation failed: {exc}") from exc

    now = datetime.now(UTC)
    draft = EmailOutreachDraft(
        id=uuid4(),
        organization_id=auth.organization_id,
        campaign_id=body.campaign_id,
        lead_id=body.lead_id,
        recipient_email=body.recipient_email,
        subject=draft_content["subject"],
        body_html=draft_content["body_html"],
        status="draft",
        created_at=now,
        updated_at=now,
    )
    session.add(draft)
    session.commit()
    session.refresh(draft)

    return _draft_to_response(draft)


# ---------------------------------------------------------------------------
# GET /drafts — list all drafts for the org
# ---------------------------------------------------------------------------

@router.get("/drafts", response_model=DraftListResponse)
def list_drafts(
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
    campaign_id: UUID | None = None,
    lead_id: UUID | None = None,
) -> DraftListResponse:
    q = select(EmailOutreachDraft).where(
        EmailOutreachDraft.organization_id == auth.organization_id
    )
    if campaign_id:
        q = q.where(EmailOutreachDraft.campaign_id == campaign_id)
    if lead_id:
        q = q.where(EmailOutreachDraft.lead_id == lead_id)
    q = q.order_by(EmailOutreachDraft.created_at.desc())
    drafts = list(session.execute(q).scalars())

    # Count opens per draft
    draft_ids = [d.id for d in drafts]
    opens_by_draft: dict[UUID, int] = {}
    if draft_ids:
        rows = session.execute(
            select(EmailEvent.draft_id, func.count(EmailEvent.id))
            .where(EmailEvent.draft_id.in_(draft_ids), EmailEvent.event_type == "open")
            .group_by(EmailEvent.draft_id)
        ).all()
        opens_by_draft = {r[0]: r[1] for r in rows}

    items = [_draft_to_response(d, opens_by_draft.get(d.id, 0)) for d in drafts]
    return DraftListResponse(items=items, total=len(items))


# ---------------------------------------------------------------------------
# PATCH /drafts/{draft_id} — approve / edit draft
# ---------------------------------------------------------------------------

@router.patch("/drafts/{draft_id}", response_model=DraftResponse)
def approve_draft(
    draft_id: UUID,
    body: DraftApproveRequest,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> DraftResponse:
    draft = session.execute(
        select(EmailOutreachDraft).where(
            EmailOutreachDraft.id == draft_id,
            EmailOutreachDraft.organization_id == auth.organization_id,
        )
    ).scalar_one_or_none()

    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft.status in ("sent", "sending"):
        raise HTTPException(status_code=409, detail="Cannot edit a draft that has already been sent")

    now = datetime.now(UTC)
    if body.subject is not None:
        draft.subject = body.subject
    if body.body_html is not None:
        draft.body_html = body.body_html
    draft.status = "approved"
    draft.approved_by = auth.user_id
    draft.approved_at = now
    draft.updated_at = now
    session.commit()
    session.refresh(draft)

    return _draft_to_response(draft)


# ---------------------------------------------------------------------------
# POST /drafts/{draft_id}/send — dispatch email
# ---------------------------------------------------------------------------

@router.post("/drafts/{draft_id}/send", response_model=DraftResponse)
async def send_draft(
    draft_id: UUID,
    body: DraftSendRequest,
    request: Request,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> DraftResponse:
    if not body.consent_attested:
        raise HTTPException(status_code=422, detail="Consent must be attested before sending")

    draft = session.execute(
        select(EmailOutreachDraft).where(
            EmailOutreachDraft.id == draft_id,
            EmailOutreachDraft.organization_id == auth.organization_id,
        )
    ).scalar_one_or_none()

    if draft is None:
        raise HTTPException(status_code=404, detail="Draft not found")
    if draft.status == "sent":
        raise HTTPException(status_code=409, detail="Email already sent — idempotent guard")
    if draft.status == "sending":
        raise HTTPException(status_code=409, detail="Email is currently being sent")
    if draft.status not in ("approved", "draft", "failed"):
        raise HTTPException(status_code=409, detail=f"Cannot send a draft with status '{draft.status}'")

    # Build tracking body
    settings = get_settings()
    base_url = str(request.base_url).rstrip("/")
    # Disable tracking pixel temporarily to prevent spam classification
    body_with_pixel = draft.body_html

    # Mark as sending (idempotency guard)
    draft.status = "sending"
    draft.updated_at = datetime.now(UTC)
    session.commit()

    try:
        message_id = await send_email(
            to_address=draft.recipient_email,
            subject=draft.subject,
            body_html=body_with_pixel,
            draft_id=str(draft.id),
        )
        draft.status = "sent"
        draft.sent_at = datetime.now(UTC)
        draft.sendgrid_message_id = message_id
    except EmailNotConfiguredError as exc:
        draft.status = "draft"  # revert so user can try again later
        session.commit()
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except EmailSendError as exc:
        draft.status = "failed"
        session.commit()
        raise HTTPException(status_code=502, detail=f"Email delivery failed: {exc}") from exc

    draft.updated_at = datetime.now(UTC)
    session.commit()
    session.refresh(draft)

    return _draft_to_response(draft)


# ---------------------------------------------------------------------------
# GET /track — open tracking pixel (public, no auth)
# ---------------------------------------------------------------------------

@router.get("/track")
async def track_open(
    request: Request,
    id: UUID | None = None,
    session: Annotated[Session, Depends(get_session)] = None,
) -> Response:
    if id is None:
        return _pixel_response()

    ua = request.headers.get("user-agent", "")
    if _is_bot(ua):
        return _pixel_response()

    # Only count opens for sent emails within reasonable window
    draft = session.execute(
        select(EmailOutreachDraft).where(EmailOutreachDraft.id == id)
    ).scalar_one_or_none()

    if draft is None or draft.status != "sent":
        return _pixel_response()

    client_ip = (
        request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or request.headers.get("x-real-ip", "")
        or "unknown"
    )

    event = EmailEvent(
        id=uuid4(),
        draft_id=id,
        event_type="open",
        user_agent=ua[:500] if ua else None,
        ip_hash=_hash_ip(client_ip),
        occurred_at=datetime.now(UTC),
    )
    session.add(event)
    session.commit()

    return _pixel_response()


# ---------------------------------------------------------------------------
# POST /unsubscribe — write email suppression record
# ---------------------------------------------------------------------------

@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(
    email: str,
    auth: Auth,
    session: Annotated[Session, Depends(get_session)],
) -> None:
    identifier_hash = hashlib.sha256(email.lower().encode()).hexdigest()
    existing = session.execute(
        select(Suppression).where(
            Suppression.organization_id == auth.organization_id,
            Suppression.channel == "email",
            Suppression.identifier_hash == identifier_hash,
        )
    ).scalar_one_or_none()

    if existing is None:
        record = Suppression(
            id=uuid4(),
            organization_id=auth.organization_id,
            channel="email",
            identifier_hash=identifier_hash,
            reason="unsubscribe_request",
            scope="all_email_outreach",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(record)
        session.commit()
