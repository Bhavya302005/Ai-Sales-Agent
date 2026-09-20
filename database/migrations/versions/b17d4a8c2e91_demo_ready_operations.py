"""add demo-ready operations controls

Revision ID: b17d4a8c2e91
Revises: 6c2a4d91e7f0
Create Date: 2026-09-19 22:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b17d4a8c2e91"
down_revision: str | None = "6c2a4d91e7f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "campaigns",
        sa.Column("retry_delay_minutes", sa.Integer(), nullable=False, server_default="60"),
    )
    op.create_table(
        "campaign_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("campaign_id", sa.Uuid(), nullable=False),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=False),
        sa.Column("state", sa.String(30), nullable=False),
        sa.Column("ready_lead_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("processed_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "state IN ('scheduled', 'ready', 'completed', 'cancelled')",
            name="campaign_run_state",
        ),
        sa.ForeignKeyConstraint(["campaign_id"], ["campaigns.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "campaign_id", "scheduled_for"),
    )
    op.create_index("ix_campaign_runs_campaign_id", "campaign_runs", ["campaign_id"])
    op.create_index("ix_campaign_runs_organization_id", "campaign_runs", ["organization_id"])
    op.create_table(
        "callback_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("call_id", sa.Uuid(), nullable=False),
        sa.Column("handoff_id", sa.Uuid()),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("requested_text", sa.String(500), nullable=False),
        sa.Column("scheduled_for", sa.DateTime(timezone=True)),
        sa.Column("status", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "status IN ('awaiting_confirmation', 'scheduled', 'completed', 'cancelled')",
            name="callback_request_status",
        ),
        sa.ForeignKeyConstraint(["call_id"], ["calls.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["handoff_id"], ["handoff_tasks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "call_id"),
    )
    op.create_index("ix_callback_requests_call_id", "callback_requests", ["call_id"])
    op.create_index("ix_callback_requests_handoff_id", "callback_requests", ["handoff_id"])
    op.create_index("ix_callback_requests_organization_id", "callback_requests", ["organization_id"])
    op.create_index("ix_callback_requests_owner_id", "callback_requests", ["owner_id"])
    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("recipient_user_id", sa.Uuid(), nullable=False),
        sa.Column("notification_type", sa.String(80), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("summary", sa.String(500), nullable=False),
        sa.Column("action_url", sa.String(500)),
        sa.Column("dedupe_key", sa.String(200), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "severity IN ('info', 'success', 'warning', 'error')",
            name="notification_severity",
        ),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id", "recipient_user_id", "dedupe_key"),
    )
    op.create_index("ix_notifications_organization_id", "notifications", ["organization_id"])
    op.create_index("ix_notifications_recipient_user_id", "notifications", ["recipient_user_id"])
    op.create_table(
        "organization_controls",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("calls_paused", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("updated_by", sa.Uuid()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organization_id"),
    )
    op.create_index("ix_organization_controls_organization_id", "organization_controls", ["organization_id"])
    op.create_table(
        "rate_limit_buckets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("bucket_hash", sa.String(64), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("request_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bucket_hash", "window_start"),
    )


def downgrade() -> None:
    op.drop_table("rate_limit_buckets")
    op.drop_index("ix_organization_controls_organization_id", table_name="organization_controls")
    op.drop_table("organization_controls")
    op.drop_index("ix_notifications_recipient_user_id", table_name="notifications")
    op.drop_index("ix_notifications_organization_id", table_name="notifications")
    op.drop_table("notifications")
    op.drop_index("ix_callback_requests_owner_id", table_name="callback_requests")
    op.drop_index("ix_callback_requests_organization_id", table_name="callback_requests")
    op.drop_index("ix_callback_requests_handoff_id", table_name="callback_requests")
    op.drop_index("ix_callback_requests_call_id", table_name="callback_requests")
    op.drop_table("callback_requests")
    op.drop_index("ix_campaign_runs_organization_id", table_name="campaign_runs")
    op.drop_index("ix_campaign_runs_campaign_id", table_name="campaign_runs")
    op.drop_table("campaign_runs")
    op.drop_column("campaigns", "retry_delay_minutes")
