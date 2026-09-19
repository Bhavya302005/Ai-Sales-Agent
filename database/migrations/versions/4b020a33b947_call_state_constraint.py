"""constrain call lifecycle state

Revision ID: 4b020a33b947
Revises: 33f5f73805d7
Create Date: 2026-09-17 21:00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "4b020a33b947"
down_revision: str | None = "33f5f73805d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_check_constraint(
        "call_state",
        "calls",
        "state IN ('requested', 'eligible', 'connecting', 'active', 'ending', "
        "'completed', 'failed', 'blocked')",
    )


def downgrade() -> None:
    op.drop_constraint("call_state", "calls", type_="check")
