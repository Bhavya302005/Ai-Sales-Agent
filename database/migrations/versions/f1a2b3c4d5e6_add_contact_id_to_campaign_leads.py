"""add contact_id to campaign_leads

Revision ID: f1a2b3c4d5e6
Revises: e5b6c7d8a9f0
Create Date: 2026-10-06 14:00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f1a2b3c4d5e6"
down_revision: str | None = "e5b6c7d8a9f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "campaign_leads",
        sa.Column(
            "contact_id",
            sa.dialects.postgresql.UUID(as_uuid=True),
            sa.ForeignKey("contacts.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_campaign_leads_contact_id",
        "campaign_leads",
        ["contact_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_campaign_leads_contact_id", table_name="campaign_leads")
    op.drop_column("campaign_leads", "contact_id")
