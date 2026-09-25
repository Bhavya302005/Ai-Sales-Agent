"""add Calendly booking followups

Revision ID: d4a9b8c7e6f5
Revises: c3f8a1d92e04
Create Date: 2026-09-25 10:30:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d4a9b8c7e6f5"
down_revision: str | None = "c3f8a1d92e04"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "booking_followups",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("call_id", sa.Uuid(), nullable=False),
        sa.Column("handoff_id", sa.Uuid()),
        sa.Column("callback_request_id", sa.Uuid()),
        sa.Column("campaign_id", sa.Uuid()),
        sa.Column("contact_id", sa.Uuid(), nullable=False),
        sa.Column("retry_call_id", sa.Uuid()),
        sa.Column("correlation_token", sa.String(64), nullable=False),
        sa.Column("calendly_link", sa.String(2048)),
        sa.Column("calendly_event_uri", sa.String(500)),
        sa.Column("calendly_invitee_uri", sa.String(500)),
        sa.Column("provider_message_id", sa.String(200)),
        sa.Column("delivery_mode", sa.String(30), nullable=False),
        sa.Column("delivery_status", sa.String(30), nullable=False, server_default="pending"),
        sa.Column("status", sa.String(30), nullable=False, server_default="prepared"),
        sa.Column(
            "retry_consent_confirmed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        sa.Column("link_sent_at", sa.DateTime(timezone=True)),
        sa.Column("booking_check_at", sa.DateTime(timezone=True)),
        sa.Column("booked_at", sa.DateTime(timezone=True)),
        sa.Column("canceled_at", sa.DateTime(timezone=True)),
        sa.Column("scheduled_start_at", sa.DateTime(timezone=True)),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error_code", sa.String(100)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "status IN ('prepared','delivery_pending','awaiting_booking','booked',"
            "'canceled','retry_due','retry_dispatched','action_required')",
            name="booking_followup_status",
        ),
        sa.CheckConstraint(
            "delivery_status IN ('pending','sent','simulated','failed','suppressed')",
            name="booking_followup_delivery_status",
        ),
        sa.CheckConstraint("retry_count >= 0 AND retry_count <= 1", name="booking_retry_count"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["call_id"], ["calls.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["handoff_id"], ["handoff_tasks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["callback_request_id"], ["callback_requests.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["retry_call_id"], ["calls.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "call_id"),
        sa.UniqueConstraint("correlation_token"),
        sa.UniqueConstraint("organization_id", "calendly_invitee_uri"),
    )
    for column in (
        "organization_id",
        "call_id",
        "handoff_id",
        "callback_request_id",
        "campaign_id",
        "contact_id",
        "retry_call_id",
    ):
        op.create_index(f"ix_booking_followups_{column}", "booking_followups", [column])
    op.create_index(
        "ix_booking_followups_due",
        "booking_followups",
        ["status", "booking_check_at"],
    )


def downgrade() -> None:
    op.drop_table("booking_followups")
