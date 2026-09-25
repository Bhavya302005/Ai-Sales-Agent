"""constrain field assertion status

Revision ID: 33f5f73805d7
Revises: 9aa31948dbf5
Create Date: 2026-09-17 20:15:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "33f5f73805d7"
down_revision: str | None = "9aa31948dbf5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("field_assertions", schema=None) as batch_op:
        batch_op.create_check_constraint("assertion_status", "status IN ('verified', 'corroborated', 'single_source', 'inferred', "
        "'unknown', 'conflicted', 'expired')",
    )


def downgrade() -> None:
    with op.batch_alter_table("field_assertions", schema=None) as batch_op:
        batch_op.drop_constraint("assertion_status", type_="check")
