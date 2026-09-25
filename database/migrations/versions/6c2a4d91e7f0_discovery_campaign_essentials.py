"""Add canonical discovery and campaign control fields."""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "6c2a4d91e7f0"
down_revision: str | None = "8e7b0a31f2cd"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("source_documents", sa.Column("discovery_title", sa.String(500)))
    op.add_column("source_documents", sa.Column("discovery_company", sa.String(300)))
    op.add_column("source_documents", sa.Column("discovery_location", sa.String(300)))
    op.add_column("source_documents", sa.Column("opportunity_type", sa.String(40)))
    op.add_column("source_documents", sa.Column("discovery_actionable", sa.Boolean()))
    op.add_column(
        "source_documents",
        sa.Column("provider_metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
    )
    op.add_column(
        "campaigns",
        sa.Column(
            "mode",
            sa.String(30),
            nullable=False,
            server_default="leads_and_calling",
        ),
    )
    op.add_column("campaigns", sa.Column("scheduled_start_at", sa.DateTime(timezone=True)))
    op.add_column(
        "campaigns", sa.Column("recurrence", sa.String(20), nullable=False, server_default="once")
    )
    op.add_column(
        "campaigns", sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3")
    )
    op.add_column("calls", sa.Column("campaign_id", sa.Uuid()))
    op.create_index("ix_calls_campaign_id", "calls", ["campaign_id"])
    with op.batch_alter_table("calls") as batch_op:
        batch_op.create_foreign_key(
            "fk_calls_campaign_id_campaigns",
            "campaigns",
            ["campaign_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    op.drop_constraint("fk_calls_campaign_id_campaigns", "calls", type_="foreignkey")
    op.drop_index("ix_calls_campaign_id", table_name="calls")
    op.drop_column("calls", "campaign_id")
    op.drop_column("campaigns", "max_attempts")
    op.drop_column("campaigns", "recurrence")
    op.drop_column("campaigns", "scheduled_start_at")
    op.drop_column("campaigns", "mode")
    op.drop_column("source_documents", "provider_metadata")
    op.drop_column("source_documents", "discovery_actionable")
    op.drop_column("source_documents", "opportunity_type")
    op.drop_column("source_documents", "discovery_location")
    op.drop_column("source_documents", "discovery_company")
    op.drop_column("source_documents", "discovery_title")
