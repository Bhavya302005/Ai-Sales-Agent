"""
SQLAlchemy ORM models for email outreach.
Lives entirely in this module — no changes to persistence/models.py.
"""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.persistence.models import Base


class EmailOutreachDraft(Base):
    __tablename__ = "email_outreach_drafts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft','approved','sending','sent','failed','suppressed')",
            name="email_draft_status",
        ),
        UniqueConstraint("idempotency_key"),
        Index("ix_email_drafts_campaign_id", "campaign_id"),
        Index("ix_email_drafts_lead_id", "lead_id"),
        Index("ix_email_drafts_organization_id", "organization_id"),
        Index("ix_email_drafts_status", "status"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    organization_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("organizations.id", ondelete="RESTRICT"), nullable=False)
    campaign_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    lead_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False)
    recipient_email: Mapped[str] = mapped_column(String(320), nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    body_html: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    approved_by: Mapped[UUID | None] = mapped_column(Uuid, nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    sendgrid_message_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class EmailEvent(Base):
    __tablename__ = "email_events"
    __table_args__ = (
        CheckConstraint("event_type IN ('open','click','bounce','unsubscribe')", name="email_event_type"),
        Index("ix_email_events_draft_id", "draft_id"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True)
    draft_id: Mapped[UUID] = mapped_column(Uuid, ForeignKey("email_outreach_drafts.id", ondelete="CASCADE"), nullable=False)
    event_type: Mapped[str] = mapped_column(String(30), nullable=False)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
