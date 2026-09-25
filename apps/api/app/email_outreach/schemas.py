"""Pydantic schemas for email outreach endpoints."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class DraftGenerateRequest(BaseModel):
    lead_id: UUID
    campaign_id: UUID
    recipient_email: str = Field(..., max_length=320)
    consent_attested: bool


class DraftApproveRequest(BaseModel):
    subject: str | None = Field(None, max_length=500)
    body_html: str | None = None


class DraftSendRequest(BaseModel):
    consent_attested: bool


class DraftResponse(BaseModel):
    id: UUID
    campaign_id: UUID
    lead_id: UUID
    recipient_email: str
    subject: str
    body_html: str
    status: str
    approved_by: UUID | None
    approved_at: datetime | None
    sent_at: datetime | None
    opens_count: int
    created_at: datetime


class DraftListResponse(BaseModel):
    items: list[DraftResponse]
    total: int


class EmailOutreachStatus(BaseModel):
    enabled: bool
    mode: str
    from_address: str | None
    from_name: str


class TrackEventResponse(BaseModel):
    recorded: bool
